const db    = require('../config/db');
const cache = require('../config/cache');
const { logActivity } = require('../services/activityLogService');

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
    const [r] = await db.query(
      'INSERT INTO daily_task_groups (group_id,name,icon,created_by) VALUES (?,?,?,?)',
      [group_id, name, icon, req.user.id]
    );
    cache.clear('tg:');
    res.status(201).json({ success: true, data: { id: r.insertId, group_id, name, icon } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.updateGroup = async (req, res) => {
  try {
    const { name, icon } = req.body;
    await db.query('UPDATE daily_task_groups SET name=COALESCE(?,name),icon=COALESCE(?,icon) WHERE id=?',
      [name, icon, req.params.id]);
    cache.clear('tg:'); cache.clear('page:');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.deleteGroup = async (req, res) => {
  try {
    await db.query('UPDATE daily_task_groups SET is_active=0 WHERE id=?', [req.params.id]);
    cache.clear('tg:'); cache.clear('page:'); cache.clear('board:');
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

exports.createTask = async (req, res) => {
  try {
    const { name, max_score=10, frequency='daily', frequency_day=null } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name required' });
    const [r] = await db.query(
      'INSERT INTO daily_tasks (task_group_id,name,max_score,frequency,frequency_day) VALUES (?,?,?,?,?)',
      [req.params.groupId, name, max_score, frequency, frequency_day]
    );
    cache.clear('tasks:'); cache.clear('page:'); cache.clear('board:');
    res.status(201).json({ success: true, data: { id: r.insertId, name, max_score, frequency, frequency_day } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.updateTask = async (req, res) => {
  try {
    const { name, max_score, frequency, frequency_day } = req.body;
    await db.query(
      `UPDATE daily_tasks SET name=COALESCE(?,name), max_score=COALESCE(?,max_score),
       frequency=COALESCE(?,frequency), frequency_day=COALESCE(?,frequency_day) WHERE id=?`,
      [name, max_score, frequency, frequency_day, req.params.id]
    );
    cache.clear('tasks:'); cache.clear('page:'); cache.clear('board:');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.deleteTask = async (req, res) => {
  try {
    await db.query('UPDATE daily_tasks SET is_active=0 WHERE id=?', [req.params.id]);
    cache.clear('tasks:'); cache.clear('page:'); cache.clear('board:');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Logs ──

exports.getLogs = async (req, res) => {
  try {
    const { group_id, date = new Date().toISOString().slice(0,10), user_id } = req.query;

    let taskSql = `SELECT dt.*, dtg.name as group_name
                   FROM daily_tasks dt
                   JOIN daily_task_groups dtg ON dtg.id=dt.task_group_id
                   WHERE dt.is_active=1 AND dtg.is_active=1`;
    const tp = [];
    if (group_id) { taskSql += ' AND dtg.group_id=?'; tp.push(group_id); }
    taskSql += ' ORDER BY dtg.id, dt.sort_order, dt.id';
    const [tasks] = await db.query(taskSql, tp);

    let members = [];
    if (group_id) {
      const [m] = await db.query(
        `SELECT u.id,u.full_name,u.username,u.avatar_color
         FROM group_members gm JOIN users u ON u.id=gm.user_id
         WHERE gm.group_id=? AND u.is_active=1`, [group_id]
      );
      members = m;
    }
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

    const matrix = tasks.map(task => {
      const d = new Date(date);
      const dow = d.getDay() === 0 ? 7 : d.getDay();
      const dom = d.getDate();
      // frequency_day giờ là VARCHAR (có thể chứa "3" hoặc "2,4,6") — luôn so
      // sánh dạng số, không dùng === trực tiếp với chuỗi từ DB.
      const parseDays = (v) => (v==null?'':String(v)).split(',').map(s=>parseInt(s.trim(),10)).filter(n=>!isNaN(n));
      let shouldShow = false;
      if (task.frequency === 'daily') shouldShow = true;
      else if (task.frequency === 'weekly'  && parseDays(task.frequency_day)[0] === dow) shouldShow = true;
      else if (task.frequency === 'monthly' && parseDays(task.frequency_day)[0] === dom) shouldShow = true;
      // ⚠️ "weekly_count" = chọn SẴN NHIỀU THỨ cụ thể trong tuần (VD "2,4,6" =
      // T2+T4+T6); "monthly_count" = chọn SẴN NHIỀU NGÀY cụ thể trong tháng.
      // Chỉ hiện ra đúng những ngày đã chọn, không phải mọi ngày.
      else if (task.frequency === 'weekly_count'  && parseDays(task.frequency_day).includes(dow)) shouldShow = true;
      else if (task.frequency === 'monthly_count' && parseDays(task.frequency_day).includes(dom)) shouldShow = true;
      if (!shouldShow) return null;
      return {
        id: task.id, name: task.name, max_score: task.max_score,
        frequency: task.frequency, frequency_day: task.frequency_day,
        user_logs: members.map(m => {
          const log = logs.find(l => l.daily_task_id === task.id && l.user_id === m.id);
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
    const conn = await db.getConnection();
    await conn.beginTransaction();
    const activityEntries = []; // ghi log SAU khi commit thành công, tránh giữ transaction lâu
    try {
      for (const log of logs) {
        // ⚠️ Nếu log này ĐÃ được chấm trước đó (is_done=1 hoặc score>0) và giá
        // trị mới khác giá trị cũ → bắt buộc phải có edit_reason mới cho lưu.
        // Đây là lớp bảo vệ phía server — frontend đã chặn từ trước bằng modal,
        // nhưng vẫn kiểm tra lại ở đây để không ai lách qua API trực tiếp được.
        const [[existing]] = await conn.query(
          'SELECT is_done, score FROM daily_task_logs WHERE daily_task_id=? AND user_id=? AND log_date=?',
          [log.daily_task_id, log.user_id, log.log_date]
        );
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

        await conn.query(
          `INSERT INTO daily_task_logs (daily_task_id,user_id,log_date,is_done,score,scored_by,scored_at,edit_reason)
           VALUES (?,?,?,?,?,?,NOW(),?)
           ON DUPLICATE KEY UPDATE is_done=VALUES(is_done),score=VALUES(score),scored_by=VALUES(scored_by),scored_at=NOW(),edit_reason=VALUES(edit_reason)`,
          [log.daily_task_id, log.user_id, log.log_date, log.is_done, log.score, req.user.id, log.edit_reason || null]
        );

        // 📝 Lịch sử thay đổi — chỉ ghi khi thực sự có điểm/tick (bỏ qua việc
        // tick-rồi-bỏ-tick về 0 không phải sửa gì đáng kể), phân biệt CHẤM MỚI
        // và SỬA LẠI (có lý do) để hiển thị đúng loại hành động ở trang lịch sử.
        if (wasScored && changed) {
          activityEntries.push({
            type: 'daily_score_edited', log,
            oldScore: existing.score, oldDone: existing.is_done,
          });
        } else if (!wasScored && (log.is_done || +log.score > 0)) {
          activityEntries.push({ type: 'daily_scored', log });
        }
      }
      await conn.commit();
      // Clear log caches
      cache.clear('logs:'); cache.clear('board:');

      // Ghi log lịch sử sau khi transaction đã commit chắc chắn thành công
      if (activityEntries.length) {
        const actorName = req.user.full_name || req.user.username;
        for (const entry of activityEntries) {
          const [[taskRow]] = await db.query('SELECT name FROM daily_tasks WHERE id=?', [entry.log.daily_task_id]);
          const [[userRow]] = await db.query('SELECT full_name FROM users WHERE id=?', [entry.log.user_id]);
          const taskName = taskRow?.name || `#${entry.log.daily_task_id}`;
          const targetName = userRow?.full_name || '?';
          if (entry.type === 'daily_scored') {
            await logActivity({
              actorId: req.user.id, actionType: 'daily_scored', entityType: 'daily_task', entityId: entry.log.daily_task_id,
              description: `${actorName} đã chấm "${taskName}" cho ${targetName}: ${entry.log.score}đ (ngày ${entry.log.log_date})`,
            });
          } else {
            await logActivity({
              actorId: req.user.id, actionType: 'daily_score_edited', entityType: 'daily_task', entityId: entry.log.daily_task_id,
              description: `${actorName} đã SỬA điểm "${taskName}" cho ${targetName}: ${entry.oldScore}đ → ${entry.log.score}đ (ngày ${entry.log.log_date}). Lý do: ${entry.log.edit_reason}`,
              metadata: { old_score: entry.oldScore, new_score: entry.log.score, reason: entry.log.edit_reason },
            });
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
      const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
      return d.toISOString().slice(0,10);
    })();
    let endStr = week_end;
    if (!endStr) {
      const end = new Date(start); end.setDate(end.getDate() + 6);
      endStr = end.toISOString().slice(0,10);
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
      cache.set(cKey, rows, 15000); // 15s cache
    }
    res.json({ success: true, data: { start, end: endStr, logs: rows } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── GET /daily/board — 1 call cho BoardPage ──
exports.getBoardData = async (req, res) => {
  try {
    const { group_id, date = new Date().toISOString().slice(0,10) } = req.query;
    if (!group_id) return res.json({ success: true, data: [] });

    const cKey = `board:${group_id}:${date}`;
    let result = cache.get(cKey);
    if (!result) {
      const [[members], [rows]] = await Promise.all([
        db.query(
          `SELECT u.id, u.full_name, u.avatar_color FROM group_members gm
           JOIN users u ON u.id=gm.user_id WHERE gm.group_id=? AND u.is_active=1`, [group_id]
        ),
        db.query(`
          SELECT dt.id, dt.name, dt.max_score, dt.frequency, dt.frequency_day,
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
        frequency:r.frequency, frequency_day:r.frequency_day,
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
      cache.set(cKey, data, 60000); // 60s — tasks/members ít thay đổi
    }
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.debug = async (req, res) => {
  try {
    const [[period]]   = await db.query('SELECT * FROM score_periods WHERE is_locked=0 ORDER BY started_at DESC LIMIT 1');
    const [members]    = await db.query('SELECT id, full_name FROM users WHERE is_active=1 LIMIT 10');
    const [logs]       = await db.query('SELECT dtl.user_id, dtl.score, dtl.log_date FROM daily_task_logs dtl LIMIT 10');
    const [taskGroups] = await db.query('SELECT id, name, group_id FROM daily_task_groups LIMIT 10');
    res.json({ period, members, logs, taskGroups });
  } catch (e) { res.status(500).json({ error: e.message }); }
};