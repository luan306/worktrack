const db    = require('../config/db');
const cache = require('../config/cache');
const { logActivity, logActivities, diffFields } = require('../services/activityLogService');
const { localDate, parseLocalDate } = require('../utils/date');
const { notify, notifyMany } = require('../services/notificationService');

// ── Leader chỉ thao tác trong nhóm của mình ──
// "Nhóm của leader" = nhóm họ là thành viên (group_members). Không dùng
// groups.leader_id vì 1 nhóm có thể có nhiều leader và cột này đang để trống.
// Admin/Manager: không giới hạn.
const NOT_YOUR_GROUP = { success: false, message: 'Leader chỉ được thao tác trong nhóm của mình' };

async function leaderGroupIds(req) {
  if (req.user.role !== 'leader') return null; // null = không giới hạn
  const [rows] = await db.query('SELECT group_id FROM group_members WHERE user_id=?', [req.user.id]);
  return new Set(rows.map(r => r.group_id));
}

// Truyền 1 trong 3: groupId (nhóm), taskGroupId (daily_task_groups.id), taskId (daily_tasks.id)
async function inLeaderGroup(req, { groupId, taskGroupId, taskId }) {
  const allowed = await leaderGroupIds(req);
  if (!allowed) return true;
  if (groupId === undefined) {
    const [[row]] = taskId
      ? await db.query('SELECT dtg.group_id FROM daily_tasks dt JOIN daily_task_groups dtg ON dtg.id=dt.task_group_id WHERE dt.id=?', [taskId])
      : await db.query('SELECT group_id FROM daily_task_groups WHERE id=?', [taskGroupId]);
    groupId = row?.group_id;
  }
  return allowed.has(+groupId);
}

// ── Task Groups ──

exports.listGroups = async (req, res) => {
  try {
    const { group_id } = req.query;
    const cKey = `tg:list:${group_id||'all'}`;
    let rows = cache.get(cKey);
    if (!rows) {
      let sql = `SELECT dtg.*, COUNT(dt.id) as task_count
                 FROM daily_task_groups dtg
                 LEFT JOIN daily_tasks dt ON dt.task_group_id=dtg.id AND dt.is_active=1
                 WHERE dtg.is_active=1`;
      const p = [];
      if (group_id) { sql += ' AND dtg.group_id=?'; p.push(group_id); }
      sql += ' GROUP BY dtg.id ORDER BY dtg.name';
      [rows] = await db.query(sql, p);
      cache.set(cKey, rows, 30000);
    }
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.createGroup = async (req, res) => {
  try {
    const { group_id, name, icon='📋' } = req.body;
    if (!group_id || !name) return res.status(400).json({ success: false, message: 'group_id and name required' });
    if (!(await inLeaderGroup(req, { groupId: group_id }))) return res.status(403).json(NOT_YOUR_GROUP);
    const [r] = await db.query(
      'INSERT INTO daily_task_groups (group_id,name,icon,created_by) VALUES (?,?,?,?)',
      [group_id, name, icon, req.user.id]
    );
    cache.clear('tg:');

    await logActivity({
      actorId: req.user.id, actionType: 'daily_group_created', entityType: 'daily_task_group', entityId: r.insertId,
      description: `${req.user.full_name || req.user.username} đã tạo nhóm công việc Daily "${name}"`,
    });

    res.status(201).json({ success: true, data: { id: r.insertId, group_id, name, icon } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Nhóm công việc Daily + tên nhóm (bộ phận) — dùng cho log "ở đâu"
async function getTaskGroup(id) {
  const [[row]] = await db.query(
    `SELECT dtg.*, g.name AS group_name FROM daily_task_groups dtg
       LEFT JOIN \`groups\` g ON g.id=dtg.group_id WHERE dtg.id=?`, [id]);
  return row;
}

exports.updateGroup = async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!(await inLeaderGroup(req, { taskGroupId: req.params.id }))) return res.status(403).json(NOT_YOUR_GROUP);
    const before = await getTaskGroup(req.params.id);
    if (!before) return res.status(404).json({ success: false, message: 'Not found' });
    await db.query('UPDATE daily_task_groups SET name=COALESCE(?,name),icon=COALESCE(?,icon) WHERE id=?',
      [name, icon, req.params.id]);
    cache.clear('tg:'); cache.clear('page:');

    const diff = diffFields(before, { name, icon }, { name: ['tên'], icon: ['biểu tượng'] });
    if (diff.text) await logActivity({
      actorId: req.user.id, actionType: 'daily_group_updated', entityType: 'daily_task_group', entityId: +req.params.id,
      description: `${req.user.full_name || req.user.username} đã sửa nhóm công việc Daily "${before.name}" (nhóm ${before.group_name || '?'}): ${diff.text}`,
      metadata: { group_id: before.group_id, changes: diff.changes },
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.deleteGroup = async (req, res) => {
  try {
    if (!(await inLeaderGroup(req, { taskGroupId: req.params.id }))) return res.status(403).json(NOT_YOUR_GROUP);
    const before = await getTaskGroup(req.params.id);
    if (!before) return res.status(404).json({ success: false, message: 'Not found' });
    await db.query('UPDATE daily_task_groups SET is_active=0 WHERE id=?', [req.params.id]);
    cache.clear('tg:'); cache.clear('page:'); cache.clear('board:');
    await logActivity({
      actorId: req.user.id, actionType: 'daily_group_deleted', entityType: 'daily_task_group', entityId: +req.params.id,
      description: `${req.user.full_name || req.user.username} đã xóa nhóm công việc Daily "${before.name}" (nhóm ${before.group_name || '?'})`,
      metadata: { group_id: before.group_id },
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Tasks ──

exports.listTasks = async (req, res) => {
  try {
    const cKey = `tasks:${req.params.groupId}`;
    let rows = cache.get(cKey);
    if (!rows) {
      [rows] = await db.query(
        'SELECT * FROM daily_tasks WHERE task_group_id=? AND is_active=1 ORDER BY sort_order,id',
        [req.params.groupId]
      );
      cache.set(cKey, rows, 60000);
    }
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /daily/task-groups/:groupId/tasks
// ⚠️ assigned_user_id (mới): NULL = công việc chung cho CẢ NHÓM (mặc định,
// hành vi cũ). Có giá trị = công việc RIÊNG, chỉ hiện với đúng 1 người đó
// khi Leader bấm chọn họ trong bảng chấm điểm — người khác trong nhóm sẽ
// không thấy dòng công việc này.
exports.createTask = async (req, res) => {
  try {
    const { name, max_score=10, frequency='daily', frequency_day=null, assigned_user_id=null } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name required' });
    if (!(await inLeaderGroup(req, { taskGroupId: req.params.groupId }))) return res.status(403).json(NOT_YOUR_GROUP);
    const [r] = await db.query(
      'INSERT INTO daily_tasks (task_group_id,name,max_score,frequency,frequency_day,assigned_user_id) VALUES (?,?,?,?,?,?)',
      [req.params.groupId, name, max_score, frequency, frequency_day, assigned_user_id||null]
    );
    cache.clear('tasks:'); cache.clear('page:'); cache.clear('board:');

    const freqLabel = frequency === 'daily' ? 'Hằng ngày'
      : frequency === 'weekly' ? 'Tuần 1 lần'
      : frequency === 'monthly' ? 'Tháng 1 lần'
      : frequency === 'weekly_count' ? 'Nhiều thứ/tuần'
      : frequency === 'monthly_count' ? 'Nhiều ngày/tháng'
      : frequency;
    let assigneeNote = '';
    if (assigned_user_id) {
      const [[u]] = await db.query('SELECT full_name FROM users WHERE id=?', [assigned_user_id]);
      assigneeNote = ` — riêng cho ${u?.full_name || '?'}`;
    }
    await logActivity({
      actorId: req.user.id, actionType: 'daily_task_created', entityType: 'daily_task', entityId: r.insertId,
      description: `${req.user.full_name || req.user.username} đã tạo công việc Daily "${name}" (${freqLabel}, tối đa ${max_score}đ)${assigneeNote}`,
    });

    res.status(201).json({ success: true, data: { id: r.insertId, name, max_score, frequency, frequency_day, assigned_user_id } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const FREQ_LABEL = {
  daily: 'Hằng ngày', weekly: 'Tuần 1 lần', monthly: 'Tháng 1 lần',
  weekly_count: 'Nhiều thứ/tuần', monthly_count: 'Nhiều ngày/tháng',
};

// Công việc Daily + nhóm + tên người được giao riêng — dùng cho log
async function getDailyTask(id) {
  const [[row]] = await db.query(
    `SELECT dt.*, dtg.name AS tg_name, g.name AS group_name, u.full_name AS assigned_name
       FROM daily_tasks dt
       JOIN daily_task_groups dtg ON dtg.id=dt.task_group_id
       LEFT JOIN \`groups\` g ON g.id=dtg.group_id
       LEFT JOIN users u ON u.id=dt.assigned_user_id
      WHERE dt.id=?`, [id]);
  return row;
}

exports.updateTask = async (req, res) => {
  try {
    const { name, max_score, frequency, frequency_day, assigned_user_id } = req.body;
    if (!(await inLeaderGroup(req, { taskId: req.params.id }))) return res.status(403).json(NOT_YOUR_GROUP);
    const before = await getDailyTask(req.params.id);
    if (!before) return res.status(404).json({ success: false, message: 'Not found' });
    // ⚠️ Chỉ đổi người được giao khi request CÓ gửi assigned_user_id (null = bỏ giao
    // riêng). Trước đây thiếu field này là tự gán NULL → sửa tên công việc riêng
    // của 1 người vô tình biến nó thành công việc chung của cả nhóm.
    await db.query(
      `UPDATE daily_tasks SET name=COALESCE(?,name), max_score=COALESCE(?,max_score),
       frequency=COALESCE(?,frequency), frequency_day=COALESCE(?,frequency_day),
       assigned_user_id=IF(?, ?, assigned_user_id)
       WHERE id=?`,
      [name, max_score, frequency, frequency_day, assigned_user_id !== undefined, assigned_user_id || null, req.params.id]
    );
    cache.clear('tasks:'); cache.clear('page:'); cache.clear('board:');

    const after = await getDailyTask(req.params.id);
    const diff = diffFields(before, after, {
      name:          ['tên'],
      max_score:     ['điểm tối đa', v => `${+v}đ`],
      frequency:     ['tần suất', v => FREQ_LABEL[v] || v],
      frequency_day: ['ngày áp dụng', v => (v == null || v === '' ? '(trống)' : String(v))],
      assigned_name: ['giao riêng cho', v => v || '(cả nhóm)'],
    });
    if (diff.text) await logActivity({
      actorId: req.user.id, actionType: 'daily_task_updated', entityType: 'daily_task', entityId: +req.params.id,
      description: `${req.user.full_name || req.user.username} đã sửa công việc Daily "${before.name}" (nhóm ${before.group_name || '?'}): ${diff.text}`,
      metadata: { group_id: before.group_id, changes: diff.changes },
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.deleteTask = async (req, res) => {
  try {
    if (!(await inLeaderGroup(req, { taskId: req.params.id }))) return res.status(403).json(NOT_YOUR_GROUP);
    const before = await getDailyTask(req.params.id);
    if (!before) return res.status(404).json({ success: false, message: 'Not found' });
    await db.query('UPDATE daily_tasks SET is_active=0 WHERE id=?', [req.params.id]);
    cache.clear('tasks:'); cache.clear('page:'); cache.clear('board:');
    await logActivity({
      actorId: req.user.id, actionType: 'daily_task_deleted', entityType: 'daily_task', entityId: +req.params.id,
      description: `${req.user.full_name || req.user.username} đã xóa công việc Daily "${before.name}" (nhóm ${before.group_name || '?'}, tối đa ${+before.max_score}đ${before.assigned_name ? `, riêng cho ${before.assigned_name}` : ''})`,
      metadata: { group_id: before.group_id },
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Logs ──

exports.getLogs = async (req, res) => {
  try {
    const { group_id, date = localDate(), user_id } = req.query;

    let taskSql = `SELECT dt.*, dtg.name as group_name
                   FROM daily_tasks dt
                   JOIN daily_task_groups dtg ON dtg.id=dt.task_group_id
                   WHERE dt.is_active=1 AND dtg.is_active=1`;
    const tp = [];
    if (group_id) { taskSql += ' AND dtg.group_id=?'; tp.push(group_id); }
    taskSql += ' ORDER BY dtg.id, dt.sort_order, dt.id';
    const [[tasks], [allMembers]] = await Promise.all([
      db.query(taskSql, tp),
      group_id
        ? db.query(
            `SELECT u.id,u.full_name,u.username,u.avatar_color
             FROM group_members gm JOIN users u ON u.id=gm.user_id
             WHERE gm.group_id=? AND u.is_active=1`, [group_id])
        : [[]],
    ]);
    let members = allMembers;
    if (user_id) members = members.filter(m => m.id === +user_id);

    const taskIds = tasks.map(t => t.id);
    let logs = [];
    if (taskIds.length && members.length) {
      const userIds = members.map(m => m.id);
      const [l] = await db.query(
        `SELECT * FROM daily_task_logs WHERE daily_task_id IN (?) AND user_id IN (?) AND log_date=?`,
        [taskIds, userIds, date]
      );
      logs = l;
    }

    const logMap = {};
    logs.forEach(l => { logMap[`${l.daily_task_id}_${l.user_id}`] = l; });

    const d = parseLocalDate(date);
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    const dom = d.getDate();
    const parseDays = (v) => (v==null?'':String(v)).split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!isNaN(n));
    const matrix = tasks.map(task => {
      let shouldShow = false;
      if (task.frequency === 'daily') shouldShow = true;
      else if (task.frequency === 'weekly'  && parseDays(task.frequency_day)[0] === dow) shouldShow = true;
      else if (task.frequency === 'monthly' && parseDays(task.frequency_day)[0] === dom) shouldShow = true;
      else if (task.frequency === 'weekly_count'  && parseDays(task.frequency_day).includes(dow)) shouldShow = true;
      else if (task.frequency === 'monthly_count' && parseDays(task.frequency_day).includes(dom)) shouldShow = true;
      if (!shouldShow) return null;
      return {
        id: task.id, name: task.name, max_score: task.max_score,
        frequency: task.frequency, frequency_day: task.frequency_day,
        assigned_user_id: task.assigned_user_id,
        user_logs: members.map(m => {
          const log = logMap[`${task.id}_${m.id}`];
          return { user_id: m.id, is_done: log?.is_done || 0, score: log?.score || 0 };
        }),
      };
    }).filter(Boolean);

    res.json({ success: true, data: { tasks: matrix, members } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.saveLogs = async (req, res) => {
  try {
    const { logs } = req.body;
    if (!Array.isArray(logs)) return res.status(400).json({ success: false, message: 'logs array required' });
    if (!logs.length) return res.json({ success: true, message: 'Saved 0 logs' });

    // Leader: mọi ô chấm phải là CV của nhóm mình VÀ người được chấm là thành viên nhóm đó
    const allowed = await leaderGroupIds(req);
    if (allowed) {
      const taskIds = [...new Set(logs.map(l => +l.daily_task_id))];
      const userIds = [...new Set(logs.map(l => +l.user_id))];
      const [[taskRows], [memberRows]] = await Promise.all([
        db.query(
          `SELECT dt.id, dtg.group_id FROM daily_tasks dt
             JOIN daily_task_groups dtg ON dtg.id=dt.task_group_id WHERE dt.id IN (?)`, [taskIds]),
        db.query('SELECT group_id, user_id FROM group_members WHERE user_id IN (?)', [userIds]),
      ]);
      const taskGroup = Object.fromEntries(taskRows.map(r => [r.id, r.group_id]));
      const members = new Set(memberRows.map(m => `${m.group_id}_${m.user_id}`));
      const outside = logs.some(l => {
        const g = taskGroup[+l.daily_task_id];
        return !allowed.has(g) || !members.has(`${g}_${+l.user_id}`);
      });
      if (outside) return res.status(403).json(NOT_YOUR_GROUP);
    }

    const conn = await db.getConnection();
    await conn.beginTransaction();
    const activityEntries = [];
    try {
      const tuples = logs.map(l => [l.daily_task_id, l.user_id, l.log_date]);
      const placeholders = tuples.map(() => '(?,?,?)').join(',');
      const [existingRows] = await conn.query(
        `SELECT daily_task_id, user_id, log_date, is_done, score, scored_by
         FROM daily_task_logs
         WHERE (daily_task_id, user_id, log_date) IN (${placeholders})`,
        tuples.flat()
      );
      const existingMap = {};
      existingRows.forEach(r => {
        // ⚠️ SỬA LỖI MÚI GIỜ NGHIÊM TRỌNG: .toISOString() quy đổi Date object
        // sang giờ UTC trước khi cắt lấy ngày — với server chạy múi giờ VN
        // (UTC+7), ngày có thể bị LÙI 1 NGÀY (VD: 13/08 00:00 giờ VN →
        // 12/08 17:00 UTC → cắt ra "12/08" SAI). Điều này khiến khóa tra cứu
        // existingMap không khớp với ngày thực sự gửi lên, nên code LUÔN coi
        // mọi lần chấm là "mới" (existing=undefined) dù đã có người chấm
        // trước đó — hậu quả: không phát hiện được đây là SỬA điểm, nên
        // không thông báo đúng cho người đã chấm trước (VD: Leader). Dùng
        // local date components (getFullYear/getMonth/getDate) thay vì UTC.
        const dateStr = r.log_date instanceof Date
          ? `${r.log_date.getFullYear()}-${String(r.log_date.getMonth()+1).padStart(2,'0')}-${String(r.log_date.getDate()).padStart(2,'0')}`
          : r.log_date;
        existingMap[`${r.daily_task_id}_${r.user_id}_${dateStr}`] = r;
      });

      for (const log of logs) {
        const existing = existingMap[`${log.daily_task_id}_${log.user_id}_${log.log_date}`];
        const wasScored = existing && (existing.is_done || +existing.score > 0);
        const changed = existing && (
          !!existing.is_done !== !!log.is_done || +existing.score !== +log.score
        );
        if (wasScored && changed && !(log.edit_reason && log.edit_reason.trim())) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: `Cần ghi lý do khi sửa điểm đã chấm trước đó (task_id=${log.daily_task_id}, ngày ${log.log_date})`
          });
        }

        if (wasScored && changed) {
          activityEntries.push({ type: 'daily_score_edited', log, oldScore: existing.score, oldDone: existing.is_done, oldScoredBy: existing.scored_by });
        } else if (!wasScored && (log.is_done || +log.score > 0)) {
          activityEntries.push({ type: 'daily_scored', log });
        }
      }

      // 1 câu upsert cho cả bảng điểm (trước đây 1 câu/ô)
      await conn.query(
        `INSERT INTO daily_task_logs (daily_task_id,user_id,log_date,is_done,score,scored_by,scored_at,edit_reason)
         VALUES ?
         ON DUPLICATE KEY UPDATE is_done=VALUES(is_done),score=VALUES(score),scored_by=VALUES(scored_by),scored_at=NOW(),edit_reason=VALUES(edit_reason)`,
        [logs.map(l => [l.daily_task_id, l.user_id, l.log_date, l.is_done, l.score, req.user.id, new Date(), l.edit_reason || null])]
      );
      await conn.commit();
      cache.clear('logs:'); cache.clear('board:'); cache.clear('dash:');

      // 📡 Realtime — báo cho MỌI người đang mở trang Daily biết vừa có điểm
      // mới/sửa, để tự tải lại ngay không cần F5 (giống cơ chế đã làm cho
      // Requests). Gửi kèm user_id bị ảnh hưởng để frontend biết có liên
      // quan tới mình hay không.
      const affectedUserIds = [...new Set(logs.map(l => l.user_id))];
      req.app.get('io')?.emit('daily:updated', { taskIds: [...new Set(logs.map(l=>l.daily_task_id))], userIds: affectedUserIds, logDate: logs[0]?.log_date });

      if (activityEntries.length) {
        const actorName = req.user.full_name || req.user.username;
        const taskIds = [...new Set(activityEntries.map(e => e.log.daily_task_id))];
        // Gồm cả người chấm LẦN TRƯỚC để log ghi rõ "điểm cũ do ai chấm"
        const userIds = [...new Set(activityEntries.flatMap(e => [e.log.user_id, e.oldScoredBy]).filter(Boolean))];

        const [[taskRows], [userRows]] = await Promise.all([
          db.query(
            `SELECT dt.id, dt.name, dtg.group_id, g.name AS group_name
             FROM daily_tasks dt JOIN daily_task_groups dtg ON dtg.id=dt.task_group_id
             LEFT JOIN \`groups\` g ON g.id=dtg.group_id
             WHERE dt.id IN (?)`, [taskIds]),
          db.query('SELECT id, full_name FROM users WHERE id IN (?)', [userIds]),
        ]);
        const taskNameMap = Object.fromEntries(taskRows.map(t => [t.id, t.name]));
        const taskGroupMap = Object.fromEntries(taskRows.map(t => [t.id, t.group_id]));
        const groupNameMap = Object.fromEntries(taskRows.map(t => [t.id, t.group_name]));
        const userNameMap = Object.fromEntries(userRows.map(u => [u.id, u.full_name]));
        const doneText = (v) => (+v ? 'đã làm' : 'chưa làm');

        // Mỗi dòng: AI chấm/sửa, công việc NÀO ở nhóm NÀO ngày NÀO, CHO AI, điểm cũ → mới
        await logActivities(activityEntries.map(entry => {
          const { log } = entry;
          const taskName   = taskNameMap[log.daily_task_id] || `#${log.daily_task_id}`;
          const targetName = userNameMap[log.user_id] || '?';
          const where = `"${taskName}" (nhóm ${groupNameMap[log.daily_task_id] || '?'}, ngày ${log.log_date})`;
          const base = { user_id: log.user_id, log_date: log.log_date, group_id: taskGroupMap[log.daily_task_id], task_name: taskName, target_name: targetName };
          if (entry.type === 'daily_scored') {
            return {
              actorId: req.user.id, actionType: 'daily_scored', entityType: 'daily_task', entityId: log.daily_task_id,
              description: `${actorName} đã chấm ${where} cho ${targetName}: ${+log.score}đ, ${doneText(log.is_done)}`,
              metadata: { ...base, new_score: log.score, new_done: log.is_done, reason: log.edit_reason || null },
            };
          }
          const doneChanged = !!+entry.oldDone !== !!+log.is_done;
          const prevBy = entry.oldScoredBy ? ` (điểm cũ do ${userNameMap[entry.oldScoredBy] || '?'} chấm)` : '';
          return {
            actorId: req.user.id, actionType: 'daily_score_edited', entityType: 'daily_task', entityId: log.daily_task_id,
            description: `${actorName} đã SỬA điểm ${where} cho ${targetName}: ${+entry.oldScore}đ → ${+log.score}đ`
              + (doneChanged ? `, ${doneText(entry.oldDone)} → ${doneText(log.is_done)}` : '')
              + prevBy + (log.edit_reason ? `. Lý do: ${log.edit_reason}` : ''),
            metadata: { ...base, old_score: entry.oldScore, new_score: log.score, old_done: entry.oldDone, new_done: log.is_done,
                        old_scored_by: entry.oldScoredBy || null, reason: log.edit_reason },
          };
        }));

        // 🔔 Thông báo — CHẤM MỚI: báo cho chính người được chấm (User).
        // SỬA LẠI: báo cho CẢ người được chấm (User) LẪN người đã chấm lần
        // trước đó (VD: Leader) để họ biết điểm mình chấm vừa bị đổi — trừ
        // khi người đó chính là người vừa thực hiện hành động (không tự báo mình).
        const io = req.app.get('io');
        for (const entry of activityEntries) {
          const taskName = taskNameMap[entry.log.daily_task_id] || `#${entry.log.daily_task_id}`;
          const groupId  = taskGroupMap[entry.log.daily_task_id];
          if (entry.type === 'daily_scored') {
            if (entry.log.user_id !== req.user.id) {
              notify(io, {
                userId: entry.log.user_id, actorId: req.user.id, type: 'daily_scored',
                entityType: 'daily_task', entityId: entry.log.daily_task_id,
                payload: { taskName, score: entry.log.score, logDate: entry.log.log_date, groupId, actorName, reason: entry.log.edit_reason || null },
              }).catch(err => console.error('[notify daily_scored]', err.message));
            }
          } else {
            const targets = new Set([entry.log.user_id, entry.oldScoredBy].filter(id => id && id !== req.user.id));
            if (targets.size) {
              notifyMany(io, [...targets], {
                actorId: req.user.id, type: 'daily_score_edited',
                entityType: 'daily_task', entityId: entry.log.daily_task_id,
                payload: { taskName, oldScore: entry.oldScore, newScore: entry.log.score, logDate: entry.log.log_date, groupId, actorName, reason: entry.log.edit_reason },
              }).catch(err => console.error('[notify daily_score_edited]', err.message));
            }
          }
        }
      }

      res.json({ success: true, message: `Saved ${logs.length} logs` });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.getWeekLogs = async (req, res) => {
  try {
    const { group_id, user_id, week_start, week_end } = req.query;
    const start = week_start || (() => {
      const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7);
      return localDate(d);
    })();
    let endStr = week_end;
    if (!endStr) {
      const end = parseLocalDate(start); end.setDate(end.getDate() + 6);
      endStr = localDate(end);
    }

    const cKey = `logs:week:${group_id||'all'}:${user_id||'all'}:${start}:${endStr}`;
    let rows = cache.get(cKey);
    if (!rows) {
      let sql = `
        SELECT dtl.daily_task_id, dtl.user_id, dtl.log_date, dtl.is_done, dtl.score, dtl.edit_reason
        FROM daily_task_logs dtl
        JOIN daily_tasks dt ON dt.id=dtl.daily_task_id
        JOIN daily_task_groups dtg ON dtg.id=dt.task_group_id
        WHERE dtl.log_date BETWEEN ? AND ?
      `;
      const p = [start, endStr];
      if (group_id) { sql += ' AND dtg.group_id=?'; p.push(group_id); }
      if (user_id)  { sql += ' AND dtl.user_id=?'; p.push(user_id); }
      [rows] = await db.query(sql, p);
      cache.set(cKey, rows, 15000);
    }
    res.json({ success: true, data: { start, end: endStr, logs: rows } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── GET /daily/board — 1 call cho BoardPage ──
exports.getBoardData = async (req, res) => {
  try {
    const { group_id, date = localDate() } = req.query;
    if (!group_id) return res.json({ success: true, data: [] });

    // Dữ liệu có điểm HÔM NAY của CHÍNH người xem → key phải có user id (trước
    // đây thiếu, nên trong 15s người sau thấy điểm của người tải trước)
    const cKey = `board:${group_id}:${date}:${req.user.id}`;
    let result = cache.get(cKey);
    if (!result) {
      const [[members], [rows]] = await Promise.all([
        db.query(
          `SELECT u.id, u.full_name, u.avatar_color FROM group_members gm
           JOIN users u ON u.id=gm.user_id WHERE gm.group_id=? AND u.is_active=1`, [group_id]
        ),
        db.query(`
          SELECT dt.id, dt.name, dt.max_score, dt.frequency, dt.frequency_day, dt.assigned_user_id,
                 dtg.group_id, dtg.name as tg_name, dtg.icon as tg_icon,
                 dtl.is_done, dtl.score, dtl.user_id as log_user_id
          FROM daily_tasks dt
          JOIN daily_task_groups dtg ON dtg.id=dt.task_group_id
          LEFT JOIN daily_task_logs dtl ON dtl.daily_task_id=dt.id AND dtl.log_date=? AND dtl.user_id=?
          WHERE dt.is_active=1 AND dtg.is_active=1 AND dtg.group_id=?
          ORDER BY dtg.id, dt.sort_order, dt.id
        `, [date, req.user.id, group_id]),
      ]);

      result = [{ group_id, tasks: rows.map(r=>({
        id:r.id, name:r.name, max_score:r.max_score,
        frequency:r.frequency, frequency_day:r.frequency_day, assigned_user_id:r.assigned_user_id,
        today_done:r.is_done||0, today_score:r.score||0,
      })), members }];
      cache.set(cKey, result, 15000);
    }
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── GET /daily/page-data — 1 call cho DailyPage ──
exports.getPageData = async (req, res) => {
  try {
    const { group_id } = req.query;
    if (!group_id) return res.status(400).json({ success: false, message: 'group_id required' });

    const cKey = `page:${group_id}`;
    let data = cache.get(cKey);
    if (!data) {
      const [[members], [tasks]] = await Promise.all([
        db.query(
          `SELECT u.id, u.full_name, u.avatar_color, u.role
           FROM group_members gm JOIN users u ON u.id=gm.user_id
           WHERE gm.group_id=? AND u.is_active=1`, [group_id]
        ),
        db.query(
          `SELECT dt.*, dtg.id as tg_id, dtg.name as tg_name, dtg.icon as tg_icon
           FROM daily_tasks dt
           JOIN daily_task_groups dtg ON dtg.id=dt.task_group_id
           WHERE dtg.group_id=? AND dt.is_active=1 AND dtg.is_active=1
           ORDER BY dtg.id, dt.sort_order, dt.id`, [group_id]
        ),
      ]);
      data = { tasks, members };
      cache.set(cKey, data, 60000);
    }
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /daily/note-history?task_id=&user_id=&log_date=
// Lịch sử TẤT CẢ lần chấm/sửa điểm của ĐÚNG 1 Ô (task+người+ngày cụ thể) —
// mỗi người từng ghi lý do ở lần chấm/sửa của họ đều được giữ lại riêng biệt.
exports.getNoteHistory = async (req, res) => {
  try {
    const { task_id, user_id, log_date } = req.query;
    if (!task_id || !user_id || !log_date) {
      return res.status(400).json({ success: false, message: 'task_id, user_id, log_date required' });
    }
    const [rows] = await db.query(
      `SELECT al.id, al.action_type, al.created_at,
              u.full_name as actor_name, u.avatar_color as actor_color,
              JSON_UNQUOTE(JSON_EXTRACT(al.metadata,'$.old_score')) as old_score,
              JSON_UNQUOTE(JSON_EXTRACT(al.metadata,'$.new_score')) as new_score,
              JSON_UNQUOTE(JSON_EXTRACT(al.metadata,'$.reason'))    as reason
         FROM activity_logs al
         LEFT JOIN users u ON u.id=al.actor_id
        WHERE al.entity_type='daily_task' AND al.entity_id=?
          AND JSON_UNQUOTE(JSON_EXTRACT(al.metadata,'$.user_id'))=?
          AND JSON_UNQUOTE(JSON_EXTRACT(al.metadata,'$.log_date'))=?
        ORDER BY al.created_at ASC`,
      [task_id, user_id, log_date]
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.debug = async (req, res) => {
  try {
    const [[[period]], [members], [logs], [taskGroups]] = await Promise.all([
      db.query('SELECT * FROM score_periods WHERE is_locked=0 ORDER BY started_at DESC LIMIT 1'),
      db.query('SELECT id, full_name FROM users WHERE is_active=1 LIMIT 10'),
      db.query('SELECT dtl.user_id, dtl.score, dtl.log_date FROM daily_task_logs dtl LIMIT 10'),
      db.query('SELECT id, name, group_id FROM daily_task_groups LIMIT 10'),
    ]);
    res.json({ period, members, logs, taskGroups });
  } catch (e) { res.status(500).json({ error: e.message }); }
};