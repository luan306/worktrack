const db   = require('../config/db');
const cache = require('../config/cache');
const { sendCachedJson } = require('../utils/cachedJson');
const path = require('path');
const fs   = require('fs');
const {
  logActivity, diffFields, fmtText, fmtDateTime, fmtScore, STATUS_LABEL, PRIORITY_LABEL,
} = require('../services/activityLogService');
const { notify, notifyMany } = require('../services/notificationService');

// Danh sách cột của 1 bảng — cache trong bộ nhớ vì schema không đổi khi server đang chạy
const columnCache = {};
async function getColumns(table) {
  if (!columnCache[table]) {
    const [cols] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
    columnCache[table] = new Set(cols.map(c => c.Field));
  }
  return columnCache[table];
}

// Báo realtime cho mọi người rằng danh sách CV đã đổi
function broadcastRequests(req, payload) {
  cache.clear('req:');
  cache.clear('dash:'); // điểm YC trên Dashboard phụ thuộc trạng thái/điểm CV
  req.app.get('io')?.emit('requests:updated', payload);
}

// 🔔 Admin nhận thông báo về MỌI thao tác giao việc / chỉnh sửa CV
function notifyAdmins(req, { taskId, title, action, skip = [], withManagers = false, ...extra }) {
  (async () => {
    const [admins] = await db.query('SELECT id FROM users WHERE role IN (?) AND is_active=1', [withManagers ? ['admin', 'manager'] : ['admin']]);
    const skipSet = new Set([...skip].map(Number));
    const ids = admins.map(a => a.id).filter(id => !skipSet.has(id));
    if (!ids.length) return;
    await notifyMany(req.app.get('io'), ids, {
      actorId: req.user.id, type: 'request_activity', entityId: taskId,
      payload: { title, action, actorName: req.user.full_name || req.user.username, ...extra },
    });
  })().catch(err => console.error('[notify admins]', err.message));
}

// Lịch sử thay đổi (audit log)

// "Nguyễn Văn A, Trần Thị B (hỗ trợ)" + mảng [{id,name,role}] cho metadata
async function getAssigneeInfo(taskId) {
  const [rows] = await db.query(
    `SELECT a.user_id AS id, u.full_name AS name, a.role FROM request_task_assignees a
       JOIN users u ON u.id=a.user_id WHERE a.task_id=? ORDER BY a.role, u.full_name`, [taskId]);
  return { list: rows, text: rows.map(r => r.name + (r.role === 'support' ? ' (hỗ trợ)' : '')).join(', ') };
}

const REQUEST_FIELDS = {
  title:        ['tiêu đề'],
  description:  ['mô tả'],
  priority:     ['độ ưu tiên', v => PRIORITY_LABEL[v] || fmtText(v)],
  deadline:     ['deadline', fmtDateTime],
  started_at:   ['giờ bắt đầu', fmtDateTime],
  completed_at: ['giờ hoàn thành', fmtDateTime],
  status:       ['trạng thái', v => STATUS_LABEL[v] || v],
};

async function logRequestUpdate(req, task, { id, status, statusChanged, score, scoreChanged, perPerson }) {
  const actorName = req.user.full_name || req.user.username;
  const where = `CV #${id} "${task.title}"`;
  const who = await getAssigneeInfo(id);
  // Chấm riêng từng người → ghi rõ "A: 8đ, B (hỗ trợ): 7đ" thay cho danh sách tên
  const forWhom = perPerson?.length
    ? ` — điểm từng người: ${perPerson.map(p => `${p.name}${p.role === 'support' ? ' (hỗ trợ)' : ''}: ${fmtScore(p.score)}`).join(', ')}`
    : who.text ? ` — cho ${who.text}` : '';
  const scoreDiff = scoreChanged && (fmtScore(task.score) !== fmtScore(score) || !!perPerson?.length);
  const b = req.body;

  // 1) Điểm: duyệt hoàn thành / chấm sơ bộ / sửa điểm — luôn ghi điểm cũ → mới
  let statusInScoreLog = false;
  if (statusChanged && status === 'done') {
    statusInScoreLog = true;
    await logActivity({
      actorId: req.user.id, actionType: 'request_completed', entityType: 'request', entityId: id,
      description: `${actorName} đã duyệt hoàn thành ${where} — điểm: ${scoreDiff ? `${fmtScore(task.score)} → ${fmtScore(score)}` : fmtScore(scoreChanged ? score : task.score)}${forWhom}`,
      metadata: { old_score: task.score, new_score: scoreChanged ? score : task.score, old_status: task.status, assignees: who.list, per_person: perPerson },
    });
  } else if (scoreDiff) {
    statusInScoreLog = statusChanged;
    const stage = statusChanged && status === 'reviewing' ? 'chấm điểm sơ bộ (gửi Manager duyệt)'
      : task.score == null ? 'chấm điểm' : 'SỬA điểm';
    await logActivity({
      actorId: req.user.id, actionType: 'request_scored', entityType: 'request', entityId: id,
      description: `${actorName} đã ${stage} ${where}: ${fmtScore(task.score)} → ${fmtScore(score)}${forWhom}`,
      metadata: { old_score: task.score, new_score: score, old_status: task.status, new_status: statusChanged ? status : undefined, assignees: who.list, per_person: perPerson },
    });
  }

  // 2) Các trường khác (và trạng thái nếu chưa nằm trong log điểm ở trên)
  const diff = diffFields(task, {
    title: b.title, description: b.description, priority: b.priority, deadline: b.deadline,
    started_at: b.started_at, completed_at: b.completed_at,
    status: statusChanged && !statusInScoreLog ? status : undefined,
  }, REQUEST_FIELDS);
  if (diff.text) {
    await logActivity({
      actorId: req.user.id, actionType: 'request_updated', entityType: 'request', entityId: id,
      description: `${actorName} đã sửa ${where}: ${diff.text}${forWhom}`,
      metadata: { changes: diff.changes, assignees: who.list },
    });
  }
}

// Gom creator + tất cả assignees của 1 task (để gửi thông báo status/comment)
async function getRecipients(taskId, createdBy) {
  const [assignees] = await db.query('SELECT user_id FROM request_task_assignees WHERE task_id=?', [taskId]);
  const ids = assignees.map(a => a.user_id);
  if (createdBy) ids.push(createdBy);
  return ids;
}

// Auto-archive: CV ở trạng thái "done" quá ARCHIVE_AFTER_DAYS ngày kể từ completed_at sẽ tự động chuyển status
const ARCHIVE_AFTER_DAYS = 6;
const CANCELLED_KEEP_DAYS = 30; // CV đã hủy còn hiện trong danh sách mặc định bao nhiêu ngày
const ARCHIVE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 tiếng/lần

async function archiveOldCompletedTasks() {
  try {
    const [r] = await db.query(
      `UPDATE request_tasks
          SET status='archived'
        WHERE status='done'
          AND completed_at IS NOT NULL
          AND completed_at < (NOW() - INTERVAL ? DAY)`,
      [ARCHIVE_AFTER_DAYS]
    );
    if (r.affectedRows) {
      cache.clear('req:');
      console.log(`[auto-archive] Đã lưu trữ ${r.affectedRows} CV hoàn thành quá ${ARCHIVE_AFTER_DAYS} ngày`);
    }
  } catch (e) {
    console.error('[auto-archive] lỗi:', e.message);
  }
}

archiveOldCompletedTasks(); // chạy ngay lúc load, không cần chờ tick đầu tiên
setInterval(archiveOldCompletedTasks, ARCHIVE_CHECK_INTERVAL_MS);

// Export để có thể gọi thủ công (vd. từ 1 route admin "chốt lưu trữ ngay") hoặc gọi trong test
exports._archiveOldCompletedTasks = archiveOldCompletedTasks;

exports.list = async (req, res) => {
  try {
    const { status, group_id, assigned_to, created_by, search, include_archived, page, limit } = req.query;
    // Cache ngắn + gộp request trùng
    const cKey = 'req:list:' + JSON.stringify([status, group_id, assigned_to, created_by, search, include_archived, page, limit]);
    await sendCachedJson(req, res, cKey, 30000, async () => {
    let sql = `
      SELECT rt.*, u.full_name as creator_name, u.avatar_color as creator_color,
             g.name as group_name,
             GROUP_CONCAT(DISTINCT CONCAT(a.user_id,':',a.role,':',au.full_name,':',COALESCE(au.avatar_color,'')) SEPARATOR '|') as assignees_raw
      FROM request_tasks rt
      LEFT JOIN users u ON u.id=rt.created_by
      LEFT JOIN \`groups\` g ON g.id=rt.group_id
      LEFT JOIN request_task_assignees a ON a.task_id=rt.id
      LEFT JOIN users au ON au.id=a.user_id
      WHERE 1=1
    `;
    const p = [];
    // Nhiều trạng thái trong 1 lần gọi: ?status=pending,assigned,in_progress
    if (status)      { sql += ' AND rt.status IN (?)'; p.push(String(status).split(',')); }
    // Không lọc status cụ thể → mặc định ẨN CV đã lưu trữ
    else if (!include_archived) {
      sql += ` AND (rt.status IN ('pending','assigned','in_progress','scoring','reviewing','done')
                    OR (rt.status='cancelled' AND rt.updated_at >= NOW() - INTERVAL ${CANCELLED_KEEP_DAYS} DAY))`;
    }
    if (group_id)    { sql += ' AND rt.group_id=?'; p.push(group_id); }
    if (created_by)  { sql += ' AND rt.created_by=?'; p.push(created_by); }
    if (search)      { sql += ' AND rt.title LIKE ?'; p.push(`%${search}%`); }
    if (assigned_to) { sql += ' AND EXISTS (SELECT 1 FROM request_task_assignees WHERE task_id=rt.id AND user_id=?)'; p.push(assigned_to); }
    sql += ' GROUP BY rt.id ORDER BY rt.created_at DESC';

    // ⚠️ Phân trang — CHỈ áp dụng khi caller CHỦ ĐỘNG gửi page/limit
    if (page || limit) {
      const l  = Math.min(200, Math.max(1, +limit || 50));
      const pg = Math.max(1, +page || 1);
      sql += ' LIMIT ? OFFSET ?';
      p.push(l, (pg - 1) * l);
    }

    const [rows] = await db.query(sql, p);
    return rows.map(r => ({
      ...r,
      assignees: r.assignees_raw ? r.assignees_raw.split('|').map(s => {
        const [user_id, role, full_name, avatar_color] = s.split(':');
        return { user_id: +user_id, role, full_name, avatar_color };
      }) : [],
      assignees_raw: undefined,
    }));
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.getOne = async (req, res) => {
  try {
    const [[task]] = await db.query(
      `SELECT rt.*, u.full_name as creator_name, u.avatar_color as creator_color, u.role as creator_role, g.name as group_name
       FROM request_tasks rt LEFT JOIN users u ON u.id=rt.created_by
       LEFT JOIN \`groups\` g ON g.id=rt.group_id WHERE rt.id=?`, [req.params.id]
    );
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });

    const [[assignees], [files], [comments], [links]] = await Promise.all([
      db.query(
        `SELECT a.*, u.full_name, u.avatar_color FROM request_task_assignees a JOIN users u ON u.id=a.user_id WHERE a.task_id=?`,
        [req.params.id]),
      db.query('SELECT * FROM request_task_files WHERE task_id=?', [req.params.id]),
      db.query(
        `SELECT c.*, u.full_name, u.avatar_color FROM request_task_comments c JOIN users u ON u.id=c.user_id
         WHERE c.task_id=? ORDER BY c.created_at`, [req.params.id]),
      db.query(
        `SELECT l.id, l.url, l.title, l.added_by, l.created_at, u.full_name AS added_by_name
           FROM request_task_links l LEFT JOIN users u ON u.id=l.added_by WHERE l.task_id=? ORDER BY l.id`, [req.params.id]),
    ]);

    res.json({ success: true, data: { ...task, assignees, files, comments, links } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /requests/:id/activity — dòng thời gian
exports.getActivity = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT al.*, u.full_name as actor_name, u.avatar_color as actor_color
       FROM activity_logs al
       LEFT JOIN users u ON u.id=al.actor_id
       WHERE al.entity_type='request' AND al.entity_id=?
       ORDER BY al.created_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { title, description, priority='medium', group_id, deadline, assignees=[], score } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title required' });

    const fields = ['title','description','priority','status','created_by','group_id','deadline'];
    const vals   = [title, description||null, priority,
                     assignees.length ? 'assigned' : 'pending',
                     req.user.id, group_id||null, deadline||null];

    // Điểm dự kiến nhập lúc tạo — không bắt buộc, để trống nếu không cần
    if (score !== undefined && score !== null && score !== '') {
      fields.push('score'); vals.push(+score);
    }

    const [r] = await db.query(
      `INSERT INTO request_tasks (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,
      vals
    );
    const taskId = r.insertId;

    if (assignees.length) {
      // Mỗi CV chỉ 1 người làm CHÍNH: giữ người "chính" đầu tiên (không có ai thì người đầu tiên), còn lại là hỗ trợ
      const mainIdx = Math.max(0, assignees.findIndex(a => (a.role || 'main') === 'main'));
      await db.query('INSERT IGNORE INTO request_task_assignees (task_id,user_id,role) VALUES ?',
        [assignees.map((a, i) => [taskId, a.user_id, i === mainIdx ? 'main' : 'support'])]);
    }

    // Log system comment — ghi cả `message`
    const createdMsg = `CV được tạo bởi ${req.user.full_name || req.user.username}`;
    await db.query(
      'INSERT INTO request_task_comments (task_id,user_id,content,message,type) VALUES (?,?,?,?,?)',
      [taskId, req.user.id, createdMsg, createdMsg, 'system']
    ).catch(e => console.error('[system comment]', e.message));

    // 📝 Lịch sử thay đổi — tạo CV
    const who = await getAssigneeInfo(taskId);
    await logActivity({
      actorId: req.user.id, actionType: 'request_created', entityType: 'request', entityId: taskId,
      description: `${req.user.full_name || req.user.username} đã tạo CV #${taskId} "${title}"`
        + (score !== undefined && score !== null && score !== '' ? `, điểm dự kiến ${fmtScore(score)}` : '')
        + (deadline ? `, deadline ${fmtDateTime(deadline)}` : '')
        + (who.text ? ` — giao cho ${who.text}` : ''),
      metadata: { assignees: who.list, score: score ?? null, deadline: deadline || null },
    });

    // 🔔 Admin: CV mới (kèm danh sách người được giao)
    const [assigneeRows] = assignees.length
      ? await db.query('SELECT full_name FROM users WHERE id IN (?)', [assignees.map(a => a.user_id)])
      : [[]];
    notifyAdmins(req, { taskId, title, action: 'created', target: assigneeRows.map(u => u.full_name).join(', '),
      skip: assignees.map(a => a.user_id) });

    // 🔔 Thông báo cho những người được assign ngay lúc tạo (nếu có)
    if (assignees.length) {
      const io = req.app.get('io');
      await notifyMany(io, assignees.map(a => a.user_id), {
        actorId: req.user.id,
        type: 'request_assigned',
        entityId: taskId,
        payload: { title, actorName: req.user.full_name || req.user.username },
      });
    }

    // 📡 Realtime — báo cho MỌI người đang mở trang Requests biết có CV mới
    broadcastRequests(req, { taskId, action: 'created' });

    res.status(201).json({ success: true, data: { id: taskId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const toMySQL = (d) => d ? new Date(d).toISOString().slice(0,19).replace('T',' ') : null;

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, status, deadline, started_at, completed_at, hours_spent } = req.body;
    let { score } = req.body;
    const [[task]] = await db.query('SELECT * FROM request_tasks WHERE id=?', [id]);
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });

    const isAdmin   = ['admin','manager'].includes(req.user.role);
    const isLeaderRole = ['admin','manager','leader'].includes(req.user.role);
    const isCreator = task.created_by === req.user.id;
    const [[assigned]] = await db.query('SELECT 1 AS x FROM request_task_assignees WHERE task_id=? AND user_id=?', [id, req.user.id]);
    const isAssignee = !!assigned;
    const statusChanged = status !== undefined && status !== task.status;
    const deny = (message) => res.status(403).json({ success: false, message });

    // Phân quyền ở SERVER — không dựa vào việc frontend ẩn nút, vì ai cũng có thể gọi thẳng API bằng token của mình
    if (!isLeaderRole && !isCreator && !isAssignee)
      return deny('Bạn không tham gia CV này');
    if (['done', 'archived'].includes(task.status) && !isAdmin)
      return deny('CV đã hoàn thành — chỉ Manager/Admin mới được chỉnh sửa');
    if ([title, description, priority, deadline, started_at].some(v => v !== undefined) && !isCreator && !isAdmin)
      return deny('Chỉ người tạo CV hoặc Manager/Admin mới được sửa thông tin CV');
    if (completed_at !== undefined && !isLeaderRole && !isCreator)
      return deny('Bạn không có quyền sửa thời gian hoàn thành');

    // Người thực hiện (không phải leader/người tạo) chỉ được đi đúng luồng
    if (statusChanged && !isLeaderRole && !isCreator) {
      const FLOW = {
        in_progress: ['pending', 'assigned'],
        scoring:     ['assigned', 'in_progress'],
        reviewing:   ['assigned', 'in_progress'],
      };
      if (!FLOW[status]?.includes(task.status))
        return deny('Bạn không được chuyển CV sang trạng thái này');
      if (status === 'reviewing') {
        const [[creator]] = await db.query('SELECT role FROM users WHERE id=?', [task.created_by]);
        if (!['admin', 'manager'].includes(creator?.role))
          return deny('CV này phải qua Leader chấm điểm trước');
      }
    }

    const fields = [];
    const vals   = [];
    if (title        !== undefined) { fields.push('title=?');        vals.push(title); }
    if (description  !== undefined) { fields.push('description=?');  vals.push(description); }
    if (priority     !== undefined) { fields.push('priority=?');     vals.push(priority); }
    // hours_spent optional - bỏ qua nếu cột chưa có if
    if (deadline     !== undefined) { fields.push('deadline=?');     vals.push(deadline?toMySQL(deadline):null); }
    if (started_at   !== undefined) { fields.push('started_at=?');   vals.push(started_at?toMySQL(started_at):null); }
    if (completed_at !== undefined) { fields.push('completed_at=?'); vals.push(completed_at?toMySQL(completed_at):null); }

    // Status transitions
    if (statusChanged) {
      // ⚠️ Lấy giờ từ NOW() của MySQL (giống claim()), KHÔNG dùng toISOString()
      const [[{ now }]] = await db.query("SELECT DATE_FORMAT(NOW(),'%Y-%m-%d %H:%i:%s') AS now");

      if (status === 'in_progress' && !task.started_at) {
        // Bắt đầu làm → set started_at
        fields.push('status=?'); vals.push('in_progress');
        fields.push('started_at=?'); vals.push(now);
      }
      else if (status === 'scoring') {
        // Assignee submit hoàn thành → chờ người tạo/leader chấm điểm sơ bộ
        fields.push('status=?'); vals.push('scoring');
        if (!task.completed_at) { fields.push('completed_at=?'); vals.push(now); }
      }
      else if (status === 'reviewing') {
        // Leader chấm điểm sơ bộ xong → gửi Manager duyệt lần cuối
        fields.push('status=?'); vals.push('reviewing');
        if (!task.completed_at) { fields.push('completed_at=?'); vals.push(now); }
      }
      else if (status === 'done') {
        // ⚠️ Duyệt hoàn thành lần cuối CHỈ dành cho Manager/Admin
        if (!isAdmin) {
          return res.status(403).json({
            success: false,
            message: 'Chỉ Manager/Admin mới được duyệt hoàn thành CV. Vui lòng chờ Manager chấm điểm lần cuối.'
          });
        }
        // Manager duyệt → done + tính is_late
        fields.push('status=?'); vals.push('done');
        const dl = task.deadline || deadline;
        const ct = task.completed_at || now;
        if (dl) { fields.push('is_late=?'); vals.push(new Date(ct) > new Date(dl) ? 1 : 0); }
      }
      else {
        fields.push('status=?'); vals.push(status);
      }
    }

    // Chấm RIÊNG từng người: assignee_scores = [{ user_id, score }]
    let perPerson = null;
    if (Array.isArray(req.body.assignee_scores) && req.body.assignee_scores.length) {
      if (!isLeaderRole && !isCreator) return deny('Bạn không có quyền chấm điểm CV này');
      const [rows] = await db.query(
        `SELECT a.user_id, a.role, u.full_name AS name FROM request_task_assignees a JOIN users u ON u.id=a.user_id WHERE a.task_id=?`, [id]);
      const byId = new Map(rows.map(r => [r.user_id, r]));
      perPerson = [];
      for (const it of req.body.assignee_scores) {
        const a = byId.get(+it.user_id);
        const v = Number(it.score);
        if (!a) return res.status(400).json({ success: false, message: 'Có người không thuộc CV này' });
        if (it.score === '' || it.score == null || !Number.isFinite(v) || v < 0 || v > 10)
          return res.status(400).json({ success: false, message: `Điểm của ${a.name} phải từ 0 đến 10` });
        perPerson.push({ user_id: a.user_id, name: a.name, role: a.role, score: v });
      }
      if (perPerson.length !== rows.length)
        return res.status(400).json({ success: false, message: 'Cần chấm điểm cho TẤT CẢ người thực hiện CV' });
      score = Math.round(perPerson.reduce((s, p) => s + p.score, 0) / perPerson.length * 10) / 10;
    }

    const scoreChanged = score !== undefined && (isLeaderRole||isCreator);

    // Score do leader/manager/admin (hoặc creator) chấm
    if (scoreChanged) {
      fields.push('score=?');     vals.push(score);
      fields.push('scored_by=?'); vals.push(req.user.id);
      fields.push('scored_at=NOW()');
    }

    if (!fields.length) return res.json({ success: true });
    // Đổi trạng thái chỉ thành công nếu CV VẪN ở trạng thái vừa đọc phía trên
    const [upd] = await db.query(
      `UPDATE request_tasks SET ${fields.join(',')} WHERE id=?${statusChanged ? ' AND status=?' : ''}`,
      statusChanged ? [...vals, id, task.status] : [...vals, id]);
    if (statusChanged && !upd.affectedRows)
      return res.status(409).json({ success: false, message: 'CV vừa được người khác cập nhật — vui lòng tải lại rồi thử lại' });
    if (perPerson) {
      await db.query(
        `UPDATE request_task_assignees SET score = CASE user_id ${perPerson.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE task_id=?`,
        [...perPerson.flatMap(p => [p.user_id, p.score]), id]);
    } else if (scoreChanged) {
      // Chấm 1 điểm chung → xóa điểm riêng cũ để mọi người nhận đúng điểm chung
      await db.query('UPDATE request_task_assignees SET score=NULL WHERE task_id=?', [id]);
    }

    // 🔔 Thông báo — bắn SAU khi update thành công, không chặn response nếu lỗi
    const io = req.app.get('io');
    const actorName = req.user.full_name || req.user.username;
    const notified = new Set(); // ai đã nhận thông báo cho lần sửa này

    if (statusChanged) {
      let recipients = await getRecipients(id, task.created_by);

      // Khi CV chuyển sang "reviewing"
      if (status === 'reviewing') {
        const [managers] = await db.query(
          "SELECT id FROM users WHERE role IN ('admin','manager') AND is_active=1"
        );
        recipients = [...new Set([...recipients, ...managers.map(m => m.id)])];
      }
      recipients.forEach(r => notified.add(r));

      notifyMany(io, recipients, {
        actorId: req.user.id,
        type: 'request_status_changed',
        entityId: id,
        payload: { title: task.title, status, actorName },
      }).catch(err => console.error('[notify status_changed]', err.message));
    }

    if (scoreChanged) {
      const assignees = perPerson || (await db.query('SELECT user_id, score FROM request_task_assignees WHERE task_id=?', [id]))[0];
      assignees.forEach(a => notified.add(a.user_id));
      // Mỗi người nhận thông báo với ĐIỂM CỦA CHÍNH MÌNH
      Promise.all(assignees.map(a => notify(io, {
        userId: a.user_id, actorId: req.user.id, type: 'request_scored', entityId: id,
        payload: { title: task.title, score: a.score != null ? +a.score : score, actorName },
      }))).catch(err => console.error('[notify scored]', err.message));
    }

    await logRequestUpdate(req, task, { id: +id, status, statusChanged, score, scoreChanged, perPerson });

    // 📡 Realtime — báo cho mọi người đang mở trang Requests, và nếu ai đang xem đúng CV này thì tự tải lại chi tiết
    broadcastRequests(req, { taskId: +id, action: statusChanged ? 'status_changed' : 'edited' });

    // 🔔 Admin: tóm tắt mọi thay đổi của lần sửa này
    notifyAdmins(req, {
      taskId: +id, title: title ?? task.title, action: 'edited',
      status: statusChanged ? status : undefined,
      score: scoreChanged ? score : undefined,
      fields: ['title', 'description', 'priority', 'deadline', 'started_at', 'completed_at'].filter(k => req.body[k] !== undefined),
      skip: notified,
    });

    res.json({ success: true });
  } catch (e) { console.error('[update error]', e.message, e.stack); res.status(500).json({ success: false, message: e.message }); }
};

// Tải CV để thay đổi người thực hiện
async function loadAssignableTask(req, res, id, doneMessage = 'CV đã hoàn thành, không thể chỉnh sửa người thực hiện nữa') {
  const [[task]] = await db.query('SELECT title, status, created_by FROM request_tasks WHERE id=?', [id]);
  if (!task) { res.status(404).json({ success: false, message: 'Not found' }); return null; }
  if (['done', 'cancelled'].includes(task.status)) { res.status(400).json({ success: false, message: doneMessage }); return null; }
  if (!['admin', 'manager'].includes(req.user.role) && task.created_by !== req.user.id) {
    res.status(403).json({ success: false, message: 'Chỉ người tạo CV hoặc Manager/Admin mới được thay đổi người thực hiện' });
    return null;
  }
  return task;
}

exports.addAssignee = async (req, res) => {
  try {
    const { user_id, role='main' } = req.body;
    const { id } = req.params;
    const task = await loadAssignableTask(req, res, id, 'CV đã hoàn thành, không thể thêm người nữa');
    if (!task) return;

    if (role === 'main') {
      const [[main]] = await db.query(
        `SELECT u.full_name FROM request_task_assignees a JOIN users u ON u.id=a.user_id
          WHERE a.task_id=? AND a.role='main' AND a.user_id<>? LIMIT 1`, [id, user_id]);
      if (main) return res.status(400).json({ success: false, message: `CV đã có người làm chính (${main.full_name}) — mỗi CV chỉ 1 người làm chính. Hãy thêm với vai trò Hỗ trợ, hoặc đổi vai trò sau.` });
    }
    // CV đã nộp (chờ chấm / chờ Manager duyệt) mà vẫn thêm người → đánh dấu: người này không tham gia lúc làm,
    // Manager phải thấy rõ trước khi cho điểm (tránh thêm người vào chỉ để được hưởng điểm)
    const late = ['scoring', 'reviewing'].includes(task.status);
    await db.query('INSERT IGNORE INTO request_task_assignees (task_id,user_id,role,added_late) VALUES (?,?,?,?)',
      [id, user_id, role === 'support' ? 'support' : 'main', late ? 1 : 0]);
    await db.query("UPDATE request_tasks SET status='assigned' WHERE id=? AND status='pending'", [id]);

    // 📝 Lịch sử thay đổi — thêm người thực hiện
    const [[addedUser]] = await db.query('SELECT full_name FROM users WHERE id=?', [user_id]);
    await logActivity({
      actorId: req.user.id, actionType: 'request_assignee_added', entityType: 'request', entityId: +id,
      description: `${req.user.full_name || req.user.username} đã thêm ${addedUser?.full_name || '?'} vào CV "${task?.title || '?'}" (${role === 'support' ? 'Hỗ trợ' : 'Chính'})`
        + (late ? ` — ⚠️ THÊM SAU KHI CV ĐÃ NỘP (đang "${STATUS_LABEL[task.status] || task.status}")` : ''),
      metadata: { added_user_id: +user_id, role, late, status_when_added: task.status },
    });

    // Thêm sau khi nộp → báo cả Manager (người duyệt điểm cuối), không chỉ Admin
    notifyAdmins(req, { taskId: +id, title: task.title, action: 'assigned',
      target: addedUser?.full_name, role, late, withManagers: late, skip: [user_id] });

    // 🔔 Thông báo cho người được gán
    const io = req.app.get('io');
    notify(io, {
      userId: +user_id,
      actorId: req.user.id,
      type: 'request_assigned',
      entityId: id,
      payload: { title: task?.title, actorName: req.user.full_name || req.user.username },
    }).catch(err => console.error('[notify assigned]', err.message));

    // 📡 Realtime
    broadcastRequests(req, { taskId: +id, action: 'assignee_added' });

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// PUT /requests/:id/assign/:userId/role { role
exports.setAssigneeRole = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id, userId } = req.params;
    const role = req.body.role === 'support' ? 'support' : 'main';
    const task = await loadAssignableTask(req, res, id);
    if (!task) return;

    const [rows] = await conn.query(
      `SELECT a.user_id, a.role, u.full_name FROM request_task_assignees a JOIN users u ON u.id=a.user_id WHERE a.task_id=?`, [id]);
    const target = rows.find(r => r.user_id === +userId);
    if (!target) return res.status(404).json({ success: false, message: 'Người này không thuộc CV' });
    if (target.role === role) return res.json({ success: true });
    if (role === 'support' && !rows.some(r => r.role === 'main' && r.user_id !== +userId))
      return res.status(400).json({ success: false, message: 'CV phải có 1 người làm chính — hãy chọn người khác làm chính (người này sẽ tự chuyển sang hỗ trợ)' });

    const oldMains = role === 'main' ? rows.filter(r => r.role === 'main') : [];
    await conn.beginTransaction();
    if (role === 'main') await conn.query("UPDATE request_task_assignees SET role='support' WHERE task_id=? AND role='main'", [id]);
    await conn.query('UPDATE request_task_assignees SET role=? WHERE task_id=? AND user_id=?', [role, id, userId]);
    await conn.commit();

    const actor = req.user.full_name || req.user.username;
    await logActivity({
      actorId: req.user.id, actionType: 'request_updated', entityType: 'request', entityId: +id,
      description: role === 'main'
        ? `${actor} đã chọn ${target.full_name} làm CHÍNH trong CV "${task.title}"${oldMains.length ? ` (${oldMains.map(m => m.full_name).join(', ')} chuyển sang hỗ trợ)` : ''}`
        : `${actor} đã chuyển ${target.full_name} sang HỖ TRỢ trong CV "${task.title}"`,
      metadata: { user_id: +userId, role, demoted: oldMains.map(m => m.user_id) },
    });
    broadcastRequests(req, { taskId: +id, action: 'edited' });
    res.json({ success: true });
  } catch (e) {
    await conn.rollback().catch(() => {});
    res.status(500).json({ success: false, message: e.message });
  } finally { conn.release(); }
};

exports.removeAssignee = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const task = await loadAssignableTask(req, res, id);
    if (!task) return;

    const [[removedUser]] = await db.query('SELECT full_name FROM users WHERE id=?', [userId]);
    await db.query('DELETE FROM request_task_assignees WHERE task_id=? AND user_id=?', [id, userId]);
    // Xóa đúng người làm chính → người được thêm sớm nhất còn lại lên làm chính (CV luôn có 1 người chính)
    await db.query(
      `UPDATE request_task_assignees SET role='main' WHERE task_id=? AND NOT EXISTS
         (SELECT 1 FROM (SELECT 1 FROM request_task_assignees WHERE task_id=? AND role='main') m)
       ORDER BY id LIMIT 1`, [id, id]);

    // 📝 Lịch sử thay đổi — xóa người thực hiện
    await logActivity({
      actorId: req.user.id, actionType: 'request_assignee_removed', entityType: 'request', entityId: +id,
      description: `${req.user.full_name || req.user.username} đã xóa ${removedUser?.full_name || '?'} khỏi CV "${task?.title || '?'}"`,
      metadata: { removed_user_id: +userId },
    });

    notifyAdmins(req, { taskId: +id, title: task.title, action: 'unassigned', target: removedUser?.full_name });

    // 📡 Realtime
    broadcastRequests(req, { taskId: +id, action: 'assignee_removed' });

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /requests/:id/claim — user thường tự "nhận" 1 CV đang ở trạng thái chờ
exports.claim = async (req, res) => {
  try {
    const { id } = req.params;
    const [[task]] = await db.query('SELECT * FROM request_tasks WHERE id=?', [id]);
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });

    // Kiểm tra cột 'started_by' có tồn tại không trước khi ghi
    const hasStartedBy = (await getColumns('request_tasks')).has('started_by');

    // ⚠️ DÙNG NOW() CỦA MYSQL, KHÔNG tự tính giờ bằng new Date().toISOString() ở Node
    const [claimed] = await db.query(
      `UPDATE request_tasks SET status='in_progress', started_at=NOW()${hasStartedBy ? ', started_by=?' : ''}
        WHERE id=? AND status='pending'
          AND NOT EXISTS (SELECT 1 FROM request_task_assignees a WHERE a.task_id=?)`,
      hasStartedBy ? [req.user.id, id, id] : [id, id]);
    if (!claimed.affectedRows) {
      return res.status(400).json({ success: false, message: 'CV này đã có người nhận hoặc không còn ở trạng thái chờ' });
    }
    await db.query('INSERT IGNORE INTO request_task_assignees (task_id,user_id,role) VALUES (?,?,?)',
      [id, req.user.id, 'main']);

    const actorName = req.user.full_name || req.user.username;

    // 📝 Activity log — ghi vào request_task_comments (hiện trong tab Nhắn tin)
    await db.query(
      'INSERT INTO request_task_comments (task_id,user_id,content,message,type) VALUES ?',
      [[`${actorName} đã tự nhận công việc này.`, 'Công việc đã tự động bắt đầu.']
        .map(msg => [id, req.user.id, msg, msg, 'system'])]
    ).catch(e => console.error('[system comment]', e.message));

    // 📝 Lịch sử thay đổi — ghi vào activity_logs để hiện trong Timeline "Tiến trình" ở chi tiết CV
    await logActivity({
      actorId: req.user.id, actionType: 'request_assignee_added', entityType: 'request', entityId: +id,
      description: `${actorName} đã tự nhận và bắt đầu công việc "${task.title}"`,
      metadata: { added_user_id: req.user.id, role: 'main', self_assigned: true },
    });

    notifyAdmins(req, { taskId: +id, title: task.title, action: 'claimed', skip: [task.created_by] });

    // 🔔 Báo cho người tạo CV biết đã có người nhận
    const io = req.app.get('io');
    notify(io, {
      userId: task.created_by,
      actorId: req.user.id,
      type: 'request_claimed',
      entityId: id,
      payload: { title: task.title, actorName },
    }).catch(err => console.error('[notify claimed]', err.message));

    // 📡 Realtime
    broadcastRequests(req, { taskId: +id, action: 'claimed' });

    res.json({ success: true, data: { status: 'in_progress' } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /requests/:id/comments Hỗ trợ 2 kiểu gửi lên
exports.addComment = async (req, res) => {
  try {
    const { content, message, type } = req.body;
    const text = content || message || '';

    if (!text && !req.file) {
      return res.status(400).json({ success: false, message: 'content required' });
    }

    const colNames = await getColumns('request_task_comments');

    const fields = ['task_id', 'user_id'];
    const vals   = [req.params.id, req.user.id];

    if (colNames.has('content')) { fields.push('content'); vals.push(text); }
    if (colNames.has('message')) { fields.push('message'); vals.push(text); }

    if (colNames.has('type')) {
      const safeType = ['comment', 'history', 'system'].includes(type) ? type : 'comment';
      fields.push('type'); vals.push(safeType);
    }

    if (req.file) {
      if (colNames.has('file_name'))   { fields.push('file_name');   vals.push(req.file.originalname); }
      if (colNames.has('stored_name')) { fields.push('stored_name'); vals.push(req.file.filename); }
      if (colNames.has('file_url'))    { fields.push('file_url');    vals.push('/uploads/' + req.file.filename); }
      // Log ra console nếu backend nhận được file nhưng DB chưa có cột để lưu
      if (!colNames.has('file_name')) {
        console.warn('[addComment] Nhận được file nhưng bảng request_task_comments chưa có cột file_name/stored_name/file_url — file sẽ KHÔNG được lưu.');
      }
    }

    const [r] = await db.query(
      `INSERT INTO request_task_comments (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
      vals
    );

    await notifyComment(req).catch(err => console.error('[notify commented]', err.message));
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (e) {
    console.error('[addComment error]', e.message, e.stack);
    res.status(500).json({ success: false, message: e.message });
  }
};

// 🔔 Helper dùng chung cho cả 2 nhánh (try + fallback) của addComment
async function notifyComment(req) {
  const [[task]] = await db.query('SELECT title, created_by FROM request_tasks WHERE id=?', [req.params.id]);
  if (!task) return;
  const recipients = await getRecipients(req.params.id, task.created_by);
  const io = req.app.get('io');
  await notifyMany(io, recipients, {
    actorId: req.user.id,
    type: 'request_commented',
    entityId: req.params.id,
    payload: { title: task.title, actorName: req.user.full_name || req.user.username },
  });
}

// Endpoint chấm điểm riêng (nếu frontend còn dùng route này thay vì PUT /requests/:id)
exports.score = async (req, res) => {
  try {
    const { score } = req.body;
    if (score === undefined) return res.status(400).json({ success: false, message: 'score required' });
    // Lấy điểm CŨ trước khi ghi đè để log được "cũ → mới"
    const [[[task]], [assignees]] = await Promise.all([
      db.query('SELECT title, score FROM request_tasks WHERE id=?', [req.params.id]),
      db.query('SELECT user_id FROM request_task_assignees WHERE task_id=?', [req.params.id]),
    ]);
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });
    await db.query('UPDATE request_tasks SET score=?,scored_by=?,scored_at=NOW() WHERE id=?',
      [score, req.user.id, req.params.id]);
    await db.query('UPDATE request_task_assignees SET score=NULL WHERE task_id=?', [req.params.id]); // điểm chung thay điểm riêng
    cache.clear('req:'); cache.clear('dash:');

    const who = await getAssigneeInfo(req.params.id);
    await logActivity({
      actorId: req.user.id, actionType: 'request_scored', entityType: 'request', entityId: +req.params.id,
      description: `${req.user.full_name || req.user.username} đã ${task.score == null ? 'chấm' : 'SỬA'} điểm CV #${req.params.id} "${task.title}": ${fmtScore(task.score)} → ${fmtScore(score)}${who.text ? ` — cho ${who.text}` : ''}`,
      metadata: { old_score: task.score, new_score: score, assignees: who.list },
    });
    const io = req.app.get('io');
    notifyMany(io, assignees.map(a => a.user_id), {
      actorId: req.user.id,
      type: 'request_scored',
      entityId: req.params.id,
      payload: { title: task?.title, score, actorName: req.user.full_name || req.user.username },
    }).catch(err => console.error('[notify scored]', err.message));
    notifyAdmins(req, { taskId: +req.params.id, title: task?.title, action: 'edited', score, skip: assignees.map(a => a.user_id) });

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    const [[task]] = await db.query('SELECT title, created_by, status FROM request_tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });
    // Trước đây route chỉ cần đăng nhập → user thường xóa được CV của bất kỳ ai
    const isAdmin = ['admin','manager'].includes(req.user.role);
    if (!isAdmin && task.created_by !== req.user.id)
      return res.status(403).json({ success: false, message: 'Chỉ người tạo CV hoặc Manager/Admin mới được xóa CV' });
    if (!isAdmin && ['done', 'archived'].includes(task.status))
      return res.status(403).json({ success: false, message: 'CV đã hoàn thành (đã tính điểm) — chỉ Manager/Admin mới được xóa' });
    // Ghi lại điểm + người thực hiện TRƯỚC khi xóa (xóa CV đã tính điểm = trừ điểm của họ)
    const [[scoreRow]] = await db.query('SELECT score FROM request_tasks WHERE id=?', [req.params.id]);
    const who = await getAssigneeInfo(req.params.id);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      for (const t of ['request_task_assignees', 'request_task_comments', 'request_task_files', 'request_task_links']) {
        await conn.query(`DELETE FROM ${t} WHERE task_id=?`, [req.params.id]);
      }
      await conn.query('DELETE FROM request_tasks WHERE id=?', [req.params.id]);
      await conn.commit();
    } catch (err) { await conn.rollback(); throw err; }
    finally { conn.release(); }

    // 📝 Lịch sử thay đổi — xóa CV (lấy title TRƯỚC khi xóa, ở trên)
    await logActivity({
      actorId: req.user.id, actionType: 'request_deleted', entityType: 'request', entityId: +req.params.id,
      description: `${req.user.full_name || req.user.username} đã xóa CV #${req.params.id} "${task.title}" (trạng thái: ${STATUS_LABEL[task.status] || task.status}, điểm: ${fmtScore(scoreRow.score)})${who.text ? ` — của ${who.text}` : ''}`,
      metadata: { status: task.status, score: scoreRow.score, assignees: who.list },
    });

    notifyAdmins(req, { taskId: +req.params.id, title: task.title, action: 'deleted' });

    // 📡 Realtime — action:'deleted' để frontend biết ĐÓNG panel chi tiết nếu đang mở đúng CV này
    broadcastRequests(req, { taskId: +req.params.id, action: 'deleted' });

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /requests/:id/files — upload file
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
    const { id } = req.params;
    const { originalname, filename, size, mimetype } = req.file;

    // Kiểm tra cột nào tồn tại
    const colNames = await getColumns('request_task_files');

    const fields = ['task_id','filename'];
    const vals   = [id, originalname];

    if (colNames.has('stored_name'))  { fields.push('stored_name');  vals.push(filename); }
    if (colNames.has('filesize'))     { fields.push('filesize');      vals.push(size); }
    if (colNames.has('mimetype'))     { fields.push('mimetype');      vals.push(mimetype); }
    if (colNames.has('uploaded_by'))  { fields.push('uploaded_by');   vals.push(req.user.id); }
    if (colNames.has('file_path'))    { fields.push('file_path');     vals.push('/uploads/' + filename); }
    if (colNames.has('filepath'))     { fields.push('filepath');      vals.push('/uploads/' + filename); }
    if (colNames.has('original_name')){ fields.push('original_name'); vals.push(originalname); }

    await db.query(
      `INSERT INTO request_task_files (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,
      vals
    );

    res.json({ success: true, data: {
      filename: originalname,
      stored_name: filename,
      url: `/uploads/${filename}`,
      filesize: Math.round(size/1024) + ' KB',
      mimetype,
    }});
  } catch (e) { console.error('[uploadFile]', e.message); res.status(500).json({ success: false, message: e.message }); }
};

// DELETE /requests/:id/files/:fileId
exports.deleteFile = async (req, res) => {
  try {
    const [[file]] = await db.query(
      `SELECT f.*, rt.created_by AS task_creator FROM request_task_files f
         JOIN request_tasks rt ON rt.id=f.task_id WHERE f.id=? AND f.task_id=?`,
      [req.params.fileId, req.params.id]);
    if (!file) return res.status(404).json({ success: false, message: 'Not found' });
    // Chỉ người tải file lên, người tạo CV hoặc Manager/Admin mới được xóa
    if (![file.uploaded_by, file.task_creator].includes(req.user.id) && !['admin','manager'].includes(req.user.role))
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa file này' });
    // Xóa file vật lý
    if (file.stored_name) {
      const filePath = path.join(__dirname, '../uploads', path.basename(file.stored_name));
      await fs.promises.unlink(filePath).catch(() => {}); // file có thể đã bị xóa tay
    }
    await db.query('DELETE FROM request_task_files WHERE id=?', [req.params.fileId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Link đính kèm ──────────────────────────────────────────────────
// Chỉ nhận http/https: chặn "javascript:..." (bấm vào là chạy mã trên trang) và các kiểu link lạ
function cleanUrl(raw) {
  let v = String(raw || '').trim();
  if (!v || v.length > 2000) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'http://' + v; // "intranet/tai-lieu" → "http://intranet/tai-lieu"
  try {
    const u = new URL(v);
    return ['http:', 'https:'].includes(u.protocol) && u.hostname ? u.href : null;
  } catch { return null; }
}

// Người tạo CV, người thực hiện, Leader/Manager/Admin
async function canTouchTask(req, task) {
  if (['admin', 'manager', 'leader'].includes(req.user.role) || task.created_by === req.user.id) return true;
  const [[a]] = await db.query('SELECT 1 AS x FROM request_task_assignees WHERE task_id=? AND user_id=?', [task.id, req.user.id]);
  return !!a;
}

// POST /requests/:id/links { url, title }
exports.addLink = async (req, res) => {
  try {
    const [[task]] = await db.query('SELECT id, title, created_by FROM request_tasks WHERE id=?', [req.params.id]);
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });
    if (!(await canTouchTask(req, task))) return res.status(403).json({ success: false, message: 'Bạn không tham gia CV này' });
    const url = cleanUrl(req.body.url);
    if (!url) return res.status(400).json({ success: false, message: 'Link không hợp lệ (chỉ nhận http:// hoặc https://)' });
    const title = String(req.body.title || '').trim().slice(0, 200) || null;
    const [r] = await db.query('INSERT INTO request_task_links (task_id, url, title, added_by) VALUES (?,?,?,?)', [task.id, url, title, req.user.id]);
    await logActivity({
      actorId: req.user.id, actionType: 'request_link_added', entityType: 'request', entityId: task.id,
      description: `${req.user.full_name || req.user.username} đã đính kèm link${title ? ` "${title}"` : ''} vào CV #${task.id} "${task.title}": ${url}`,
      metadata: { link_id: r.insertId, url, title },
    });
    broadcastRequests(req, { taskId: task.id, action: 'edited' });
    res.status(201).json({ success: true, data: { id: r.insertId, url, title } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DELETE /requests/:id/links/:linkId — người thêm link, người tạo CV hoặc Manager/Admin
exports.deleteLink = async (req, res) => {
  try {
    const [[link]] = await db.query(
      `SELECT l.*, rt.created_by AS task_creator, rt.title AS task_title FROM request_task_links l
         JOIN request_tasks rt ON rt.id=l.task_id WHERE l.id=? AND l.task_id=?`, [req.params.linkId, req.params.id]);
    if (!link) return res.status(404).json({ success: false, message: 'Not found' });
    if (![link.added_by, link.task_creator].includes(req.user.id) && !['admin', 'manager'].includes(req.user.role))
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa link này' });
    await db.query('DELETE FROM request_task_links WHERE id=?', [link.id]);
    await logActivity({
      actorId: req.user.id, actionType: 'request_link_removed', entityType: 'request', entityId: link.task_id,
      description: `${req.user.full_name || req.user.username} đã xóa link${link.title ? ` "${link.title}"` : ''} khỏi CV #${link.task_id} "${link.task_title}": ${link.url}`,
      metadata: { url: link.url, title: link.title },
    });
    broadcastRequests(req, { taskId: link.task_id, action: 'edited' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
