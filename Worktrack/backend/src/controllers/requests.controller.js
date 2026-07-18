const db = require('../config/db');
const { notify, notifyMany } = require('../services/notificationService');

// Gom creator + tất cả assignees của 1 task (để gửi thông báo status/comment)
async function getRecipients(taskId, createdBy) {
  const [assignees] = await db.query('SELECT user_id FROM request_task_assignees WHERE task_id=?', [taskId]);
  const ids = assignees.map(a => a.user_id);
  if (createdBy) ids.push(createdBy);
  return ids;
}

// ══════════════════════════════════════════════════════════════════
// Auto-archive: CV ở trạng thái "done" quá ARCHIVE_AFTER_DAYS ngày kể
// từ completed_at sẽ tự động chuyển status sang 'archived'. Chạy ngay
// khi module được load (server start) rồi lặp lại định kỳ trong tiến
// trình — không cần cron ngoài hay người dùng phải mở app để kích hoạt.
// ══════════════════════════════════════════════════════════════════
const ARCHIVE_AFTER_DAYS = 6;
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
      console.log(`[auto-archive] Đã lưu trữ ${r.affectedRows} CV hoàn thành quá ${ARCHIVE_AFTER_DAYS} ngày`);
    }
  } catch (e) {
    console.error('[auto-archive] lỗi:', e.message);
  }
}

archiveOldCompletedTasks(); // chạy ngay lúc load, không cần chờ tick đầu tiên
setInterval(archiveOldCompletedTasks, ARCHIVE_CHECK_INTERVAL_MS);

// Export để có thể gọi thủ công (vd. từ 1 route admin "chốt lưu trữ ngay")
// hoặc gọi trong test, mà không phải chờ setInterval.
exports._archiveOldCompletedTasks = archiveOldCompletedTasks;

exports.list = async (req, res) => {
  try {
    const { status, group_id, assigned_to, created_by, search, include_archived } = req.query;
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
    if (status)      { sql += ' AND rt.status=?'; p.push(status); }
    // Không lọc status cụ thể → mặc định ẨN CV đã lưu trữ (đỡ rối các màn hình
    // "lấy hết"), trừ khi caller chủ động xin include_archived=1 (vd. trang
    // Dashboard cần thống kê đầy đủ lịch sử của 1 nhân viên).
    else if (!include_archived) { sql += " AND rt.status<>'archived'"; }
    if (group_id)    { sql += ' AND rt.group_id=?'; p.push(group_id); }
    if (created_by)  { sql += ' AND rt.created_by=?'; p.push(created_by); }
    if (search)      { sql += ' AND rt.title LIKE ?'; p.push(`%${search}%`); }
    if (assigned_to) { sql += ' AND EXISTS (SELECT 1 FROM request_task_assignees WHERE task_id=rt.id AND user_id=?)'; p.push(assigned_to); }
    sql += ' GROUP BY rt.id ORDER BY rt.created_at DESC';

    const [rows] = await db.query(sql, p);
    const data = rows.map(r => ({
      ...r,
      assignees: r.assignees_raw ? r.assignees_raw.split('|').map(s => {
        const [user_id, role, full_name, avatar_color] = s.split(':');
        return { user_id: +user_id, role, full_name, avatar_color };
      }) : [],
      assignees_raw: undefined,
    }));
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.getOne = async (req, res) => {
  try {
    const [[task]] = await db.query(
      `SELECT rt.*, u.full_name as creator_name, u.avatar_color as creator_color, g.name as group_name
       FROM request_tasks rt LEFT JOIN users u ON u.id=rt.created_by
       LEFT JOIN \`groups\` g ON g.id=rt.group_id WHERE rt.id=?`, [req.params.id]
    );
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });

    const [assignees] = await db.query(
      `SELECT a.*, u.full_name, u.avatar_color FROM request_task_assignees a JOIN users u ON u.id=a.user_id WHERE a.task_id=?`,
      [req.params.id]
    );
    const [files] = await db.query('SELECT * FROM request_task_files WHERE task_id=?', [req.params.id]);
    const [comments] = await db.query(
      `SELECT c.*, u.full_name, u.avatar_color FROM request_task_comments c JOIN users u ON u.id=c.user_id
       WHERE c.task_id=? ORDER BY c.created_at`, [req.params.id]
    );

    res.json({ success: true, data: { ...task, assignees, files, comments } });
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

    for (const a of assignees) {
      await db.query('INSERT IGNORE INTO request_task_assignees (task_id,user_id,role) VALUES (?,?,?)',
        [taskId, a.user_id, a.role||'main']);
    }

    // Log system comment
    await db.query(
      'INSERT INTO request_task_comments (task_id,user_id,content,type) VALUES (?,?,?,?)',
      [taskId, req.user.id, `CV được tạo bởi ${req.user.full_name || req.user.username}`, 'system']
    ).catch(()=>{}); // ignore nếu chưa có cột type

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

    res.status(201).json({ success: true, data: { id: taskId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const toMySQL = (d) => d ? new Date(d).toISOString().slice(0,19).replace('T',' ') : null;

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, status, deadline, started_at, completed_at, score, hours_spent } = req.body;
    const [[task]] = await db.query('SELECT * FROM request_tasks WHERE id=?', [id]);
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });

    const isAdmin   = ['admin','manager'].includes(req.user.role);
    const isLeaderRole = ['admin','manager','leader'].includes(req.user.role);
    const isCreator = task.created_by === req.user.id;
    const isAssignee = (await db.query('SELECT 1 FROM request_task_assignees WHERE task_id=? AND user_id=?', [id, req.user.id]))[0].length > 0;

    // Chỉ creator hoặc admin mới đổi deadline
    if (deadline !== undefined && !isCreator && !isAdmin)
      return res.status(403).json({ success: false, message: 'Chỉ người tạo hoặc admin mới đổi được deadline!' });

    const fields = [];
    const vals   = [];
    if (title        !== undefined) { fields.push('title=?');        vals.push(title); }
    if (description  !== undefined) { fields.push('description=?');  vals.push(description); }
    if (priority     !== undefined) { fields.push('priority=?');     vals.push(priority); }
    // hours_spent optional - bỏ qua nếu cột chưa có
    // if (hours_spent !== undefined) { fields.push('hours_spent=?'); vals.push(hours_spent||null); }
    if (deadline     !== undefined) { fields.push('deadline=?');     vals.push(deadline?toMySQL(deadline):null); }
    if (started_at   !== undefined) { fields.push('started_at=?');   vals.push(started_at?toMySQL(started_at):null); }
    if (completed_at !== undefined) { fields.push('completed_at=?'); vals.push(completed_at?toMySQL(completed_at):null); }

    const statusChanged = status !== undefined && status !== task.status;

    // Status transitions
    if (statusChanged) {
      const now = new Date().toISOString().slice(0,19).replace('T',' ');

      if (status === 'in_progress' && !task.started_at) {
        // Bắt đầu làm → set started_at
        fields.push('status=?'); vals.push('in_progress');
        fields.push('started_at=?'); vals.push(now);
      }
      else if (status === 'scoring') {
        // Assignee submit hoàn thành → chờ người tạo chấm điểm
        fields.push('status=?'); vals.push('scoring');
        if (!task.completed_at) { fields.push('completed_at=?'); vals.push(now); }
      }
      else if (status === 'reviewing') {
        // Người tạo chấm xong → gửi manager duyệt
        fields.push('status=?'); vals.push('reviewing');
      }
      else if (status === 'done') {
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

    const scoreChanged = score !== undefined && (isLeaderRole||isCreator);

    // Score do leader/manager/admin (hoặc creator) chấm — thường xảy ra ở bước
    // reviewing→done, khi leader chấm điểm chính xác lại lần cuối.
    if (scoreChanged) {
      fields.push('score=?');     vals.push(score);
      fields.push('scored_by=?'); vals.push(req.user.id);
      fields.push('scored_at=?'); vals.push(new Date().toISOString().slice(0,19).replace('T',' '));
    }

    if (!fields.length) return res.json({ success: true });
    await db.query(`UPDATE request_tasks SET ${fields.join(',')} WHERE id=?`, [...vals, id]);

    // 🔔 Thông báo — bắn SAU khi update thành công, không chặn response nếu lỗi
    const io = req.app.get('io');
    const actorName = req.user.full_name || req.user.username;

    if (statusChanged) {
      const recipients = await getRecipients(id, task.created_by);
      notifyMany(io, recipients, {
        actorId: req.user.id,
        type: 'request_status_changed',
        entityId: id,
        payload: { title: task.title, status, actorName },
      }).catch(err => console.error('[notify status_changed]', err.message));
    }

    if (scoreChanged) {
      const [assignees] = await db.query('SELECT user_id FROM request_task_assignees WHERE task_id=?', [id]);
      notifyMany(io, assignees.map(a => a.user_id), {
        actorId: req.user.id,
        type: 'request_scored',
        entityId: id,
        payload: { title: task.title, score, actorName },
      }).catch(err => console.error('[notify scored]', err.message));
    }

    res.json({ success: true });
  } catch (e) { console.error('[update error]', e.message, e.stack); res.status(500).json({ success: false, message: e.message }); }
};

exports.addAssignee = async (req, res) => {
  try {
    const { user_id, role='main' } = req.body;
    const { id } = req.params;

    const [[task]] = await db.query('SELECT title, status FROM request_tasks WHERE id=?', [id]);
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });

    // Đã hoàn thành/hủy thì không cho thêm người nữa
    if (['done', 'cancelled'].includes(task.status)) {
      return res.status(400).json({ success: false, message: 'CV đã hoàn thành, không thể thêm người nữa' });
    }

    // Leader/manager/admin: assign được cho CV bất kỳ.
    // User thường: chỉ được thêm người khi CHÍNH MÌNH đã là assignee của CV này
    // (mời đồng nghiệp vào làm chung), không được assign cho CV mình không liên quan.
    const isPrivileged = ['admin','manager','leader'].includes(req.user.role);
    if (!isPrivileged) {
      const [rows] = await db.query(
        'SELECT 1 FROM request_task_assignees WHERE task_id=? AND user_id=?', [id, req.user.id]
      );
      if (!rows.length) {
        return res.status(403).json({ success: false, message: 'Bạn cần đang tham gia CV này mới được thêm người khác vào làm chung' });
      }
    }

    await db.query('INSERT IGNORE INTO request_task_assignees (task_id,user_id,role) VALUES (?,?,?)',
      [id, user_id, role]);
    await db.query("UPDATE request_tasks SET status='assigned' WHERE id=? AND status='pending'", [id]);

    // 🔔 Thông báo cho người được gán
    const io = req.app.get('io');
    notify(io, {
      userId: +user_id,
      actorId: req.user.id,
      type: 'request_assigned',
      entityId: id,
      payload: { title: task?.title, actorName: req.user.full_name || req.user.username },
    }).catch(err => console.error('[notify assigned]', err.message));

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.removeAssignee = async (req, res) => {
  try {
    const { id, userId } = req.params;

    const [[task]] = await db.query('SELECT status FROM request_tasks WHERE id=?', [id]);
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });

    if (['done', 'cancelled'].includes(task.status)) {
      return res.status(400).json({ success: false, message: 'CV đã hoàn thành, không thể chỉnh sửa người thực hiện nữa' });
    }

    const isPrivileged = ['admin','manager','leader'].includes(req.user.role);
    if (!isPrivileged) {
      const [rows] = await db.query(
        'SELECT 1 FROM request_task_assignees WHERE task_id=? AND user_id=?', [id, req.user.id]
      );
      if (!rows.length) {
        return res.status(403).json({ success: false, message: 'Bạn cần đang tham gia CV này mới được xóa người khác' });
      }
    }

    await db.query('DELETE FROM request_task_assignees WHERE task_id=? AND user_id=?', [id, userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /requests/:id/claim — user thường tự "nhận" 1 CV đang ở trạng thái chờ (pending),
// khác với addAssignee (chỉ leader/manager/admin mới gán được cho NGƯỜI KHÁC).
// Không nhận user_id từ req.body — luôn tự gán cho chính req.user.id, tránh user
// tự gán CV cho người khác qua endpoint này.
exports.claim = async (req, res) => {
  try {
    const { id } = req.params;
    const [[task]] = await db.query('SELECT * FROM request_tasks WHERE id=?', [id]);
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });

    const [[{ cnt }]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM request_task_assignees WHERE task_id=?', [id]
    );

    // Chỉ được nhận khi CV còn "pending" và chưa có ai nhận trước
    if (task.status !== 'pending' || cnt > 0) {
      return res.status(400).json({ success: false, message: 'CV này đã có người nhận hoặc không còn ở trạng thái chờ' });
    }

    await db.query('INSERT IGNORE INTO request_task_assignees (task_id,user_id,role) VALUES (?,?,?)',
      [id, req.user.id, 'main']);
    await db.query("UPDATE request_tasks SET status='assigned' WHERE id=?", [id]);

    // 🔔 Báo cho người tạo CV biết đã có người nhận
    const io = req.app.get('io');
    notify(io, {
      userId: task.created_by,
      actorId: req.user.id,
      type: 'request_claimed',
      entityId: id,
      payload: { title: task.title, actorName: req.user.full_name || req.user.username },
    }).catch(err => console.error('[notify claimed]', err.message));

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /requests/:id/comments
// Hỗ trợ 2 kiểu gửi lên:
//   1) JSON thường:          { content: "..." }
//   2) multipart/form-data:  content (có thể rỗng) + file (đính kèm)
// ⚠️ Route này cần middleware multer (upload.single('file')) gắn ở routes/index.js
// thì req.file mới có giá trị khi client gửi multipart/form-data.
//
// Thay vì dùng try/catch với fallback (dễ âm thầm bỏ sót cột file_* nếu nhánh
// chính lỗi vì lý do khác), hàm này kiểm tra trực tiếp cột nào đang thực sự
// tồn tại trong bảng (giống cách uploadFile() đang làm) rồi mới build câu INSERT
// — đảm bảo file luôn được lưu nếu cột đã có, và báo lỗi rõ ràng nếu có vấn đề khác.
exports.addComment = async (req, res) => {
  try {
    const { content, message, type } = req.body;
    const text = content || message || '';

    if (!text && !req.file) {
      return res.status(400).json({ success: false, message: 'content required' });
    }

    const [cols] = await db.query('SHOW COLUMNS FROM request_task_comments');
    const colNames = cols.map(c => c.Field);

    const fields = ['task_id', 'user_id'];
    const vals   = [req.params.id, req.user.id];

    if (colNames.includes('content')) { fields.push('content'); vals.push(text); }
    if (colNames.includes('message')) { fields.push('message'); vals.push(text); }

    if (colNames.includes('type')) {
      const safeType = ['comment', 'history', 'system'].includes(type) ? type : 'comment';
      fields.push('type'); vals.push(safeType);
    }

    if (req.file) {
      if (colNames.includes('file_name'))   { fields.push('file_name');   vals.push(req.file.originalname); }
      if (colNames.includes('stored_name')) { fields.push('stored_name'); vals.push(req.file.filename); }
      if (colNames.includes('file_url'))    { fields.push('file_url');    vals.push('/uploads/' + req.file.filename); }
      // Log ra console nếu backend nhận được file nhưng DB chưa có cột để lưu —
      // để không còn phải đoán mò lý do "gửi được nhưng hiện ô trắng" nữa.
      if (!colNames.includes('file_name')) {
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
    await db.query('UPDATE request_tasks SET score=?,scored_by=?,scored_at=NOW() WHERE id=?',
      [score, req.user.id, req.params.id]);

    const [[task]] = await db.query('SELECT title FROM request_tasks WHERE id=?', [req.params.id]);
    const [assignees] = await db.query('SELECT user_id FROM request_task_assignees WHERE task_id=?', [req.params.id]);
    const io = req.app.get('io');
    notifyMany(io, assignees.map(a => a.user_id), {
      actorId: req.user.id,
      type: 'request_scored',
      entityId: req.params.id,
      payload: { title: task?.title, score, actorName: req.user.full_name || req.user.username },
    }).catch(err => console.error('[notify scored]', err.message));

    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    await db.query('DELETE FROM request_task_assignees WHERE task_id=?', [req.params.id]);
    await db.query('DELETE FROM request_task_comments WHERE task_id=?', [req.params.id]);
    await db.query('DELETE FROM request_task_files WHERE task_id=?', [req.params.id]);
    await db.query('DELETE FROM request_tasks WHERE id=?', [req.params.id]);
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
    const [cols] = await db.query("SHOW COLUMNS FROM request_task_files");
    const colNames = cols.map(c => c.Field);

    const fields = ['task_id','filename'];
    const vals   = [id, originalname];

    if (colNames.includes('stored_name'))  { fields.push('stored_name');  vals.push(filename); }
    if (colNames.includes('filesize'))     { fields.push('filesize');      vals.push(size); }
    if (colNames.includes('mimetype'))     { fields.push('mimetype');      vals.push(mimetype); }
    if (colNames.includes('uploaded_by'))  { fields.push('uploaded_by');   vals.push(req.user.id); }
    if (colNames.includes('file_path'))    { fields.push('file_path');     vals.push('/uploads/' + filename); }
    if (colNames.includes('filepath'))     { fields.push('filepath');      vals.push('/uploads/' + filename); }
    if (colNames.includes('original_name')){ fields.push('original_name'); vals.push(originalname); }

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
    const [[file]] = await db.query('SELECT * FROM request_task_files WHERE id=? AND task_id=?', [req.params.fileId, req.params.id]);
    if (!file) return res.status(404).json({ success: false, message: 'Not found' });
    // Xóa file vật lý
    const path = require('path');
    const fs   = require('fs');
    const filePath = path.join(__dirname, '../uploads', file.stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await db.query('DELETE FROM request_task_files WHERE id=?', [req.params.fileId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
