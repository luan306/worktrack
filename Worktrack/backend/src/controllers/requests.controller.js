const db = require('../config/db');

exports.list = async (req, res) => {
  try {
    const { status, group_id, assigned_to, created_by, search } = req.query;
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
    const { title, description, priority='medium', group_id, deadline, assignees=[] } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title required' });

    const [r] = await db.query(
      `INSERT INTO request_tasks (title,description,priority,status,created_by,group_id,deadline)
       VALUES (?,?,?,?,?,?,?)`,
      [title, description||null, priority,
       assignees.length ? 'assigned' : 'pending',
       req.user.id, group_id||null, deadline||null]
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

    // Status transitions
    if (status !== undefined && status !== task.status) {
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

    // Score chỉ leader/admin chấm
    if (score !== undefined && (isAdmin||isCreator)) {
      fields.push('score=?');     vals.push(score);
      fields.push('scored_by=?'); vals.push(req.user.id);
      fields.push('scored_at=?'); vals.push(new Date().toISOString().slice(0,19).replace('T',' '));
    }

    if (!fields.length) return res.json({ success: true });
    await db.query(`UPDATE request_tasks SET ${fields.join(',')} WHERE id=?`, [...vals, id]);
    res.json({ success: true });
  } catch (e) { console.error('[update error]', e.message, e.stack); res.status(500).json({ success: false, message: e.message }); }
};

exports.addAssignee = async (req, res) => {
  try {
    const { user_id, role='main' } = req.body;
    await db.query('INSERT IGNORE INTO request_task_assignees (task_id,user_id,role) VALUES (?,?,?)',
      [req.params.id, user_id, role]);
    await db.query("UPDATE request_tasks SET status='assigned' WHERE id=? AND status='pending'", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.removeAssignee = async (req, res) => {
  try {
    await db.query('DELETE FROM request_task_assignees WHERE task_id=? AND user_id=?',
      [req.params.id, req.params.userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.addComment = async (req, res) => {
  try {
    const { content, message } = req.body; // hỗ trợ cả 2 field
    const text = content || message;
    if (!text) return res.status(400).json({ success: false, message: 'content required' });

    // Thêm cột content nếu cần
    const [r] = await db.query(
      'INSERT INTO request_task_comments (task_id,user_id,content,type) VALUES (?,?,?,?)',
      [req.params.id, req.user.id, text, 'comment']
    );
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (e) {
    // Fallback nếu cột content/type chưa có
    try {
      const { content, message } = req.body;
      const [r] = await db.query(
        'INSERT INTO request_task_comments (task_id,user_id,message) VALUES (?,?,?)',
        [req.params.id, req.user.id, content || message]
      );
      res.status(201).json({ success: true, data: { id: r.insertId } });
    } catch(e2) { res.status(500).json({ success: false, message: e2.message }); }
  }
};

exports.score = async (req, res) => {
  try {
    const { score } = req.body;
    if (score === undefined) return res.status(400).json({ success: false, message: 'score required' });
    await db.query('UPDATE request_tasks SET score=?,scored_by=?,scored_at=NOW() WHERE id=?',
      [score, req.user.id, req.params.id]);
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