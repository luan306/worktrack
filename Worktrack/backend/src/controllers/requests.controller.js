const db = require('../config/db');

exports.list = async (req, res) => {
  try {
    const { status, group_id, assigned_to, created_by, search } = req.query;
    let sql = `
      SELECT rt.*, u.full_name as creator_name, u.avatar_color as creator_color,
             g.name as group_name,
             GROUP_CONCAT(DISTINCT CONCAT(a.user_id,':',a.role,':',au.full_name) SEPARATOR '|') as assignees_raw
      FROM request_tasks rt
      JOIN users u ON u.id=rt.created_by
      LEFT JOIN \`groups\` g ON g.id=rt.group_id
      LEFT JOIN request_task_assignees a ON a.task_id=rt.id
      LEFT JOIN users au ON au.id=a.user_id
      WHERE 1=1
    `;
    const p = [];
    if (status)     { sql += ' AND rt.status=?'; p.push(status); }
    if (group_id)   { sql += ' AND rt.group_id=?'; p.push(group_id); }
    if (created_by) { sql += ' AND rt.created_by=?'; p.push(created_by); }
    if (search)     { sql += ' AND rt.title LIKE ?'; p.push(`%${search}%`); }
    if (assigned_to) { sql += ' AND EXISTS (SELECT 1 FROM request_task_assignees WHERE task_id=rt.id AND user_id=?)'; p.push(assigned_to); }
    sql += ' GROUP BY rt.id ORDER BY rt.created_at DESC';

    const [rows] = await db.query(sql, p);
    const data = rows.map(r => ({
      ...r,
      assignees: r.assignees_raw ? r.assignees_raw.split('|').map(s => {
        const [id, role, name] = s.split(':');
        return { user_id: +id, role, full_name: name };
      }) : [],
      assignees_raw: undefined,
    }));
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.getOne = async (req, res) => {
  try {
    const [[task]] = await db.query(
      `SELECT rt.*, u.full_name as creator_name, g.name as group_name
       FROM request_tasks rt JOIN users u ON u.id=rt.created_by
       LEFT JOIN \`groups\` g ON g.id=rt.group_id WHERE rt.id=?`, [req.params.id]
    );
    if (!task) return res.status(404).json({ success: false, message: 'Not found' });

    const [assignees] = await db.query(
      `SELECT a.*, u.full_name, u.avatar_color FROM request_task_assignees a JOIN users u ON u.id=a.user_id WHERE a.task_id=?`,
      [req.params.id]
    );
    const [files]    = await db.query('SELECT * FROM request_task_files WHERE task_id=?', [req.params.id]);
    const [comments] = await db.query(
      `SELECT c.*, u.full_name, u.avatar_color FROM request_task_comments c JOIN users u ON u.id=c.user_id
       WHERE c.task_id=? ORDER BY c.created_at`, [req.params.id]
    );
    res.json({ success: true, data: { ...task, assignees, files, comments } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const { title, description, tools, priority='medium', group_id, deadline, assignees=[] } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'title required' });

    const [r] = await db.query(
      `INSERT INTO request_tasks (title,description,tools,priority,status,created_by,group_id,deadline)
       VALUES (?,?,?,?,?,?,?,?)`,
      [title, description, tools, priority, assignees.length ? 'assigned' : 'pending',
       req.user.id, group_id||null, deadline||null]
    );
    const taskId = r.insertId;

    for (const a of assignees) {
      await db.query('INSERT IGNORE INTO request_task_assignees (task_id,user_id,role) VALUES (?,?,?)',
        [taskId, a.user_id, a.role||'main']);
    }

    res.status(201).json({ success: true, data: { id: taskId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.update = async (req, res) => {
  try {
    const { title, description, tools, priority, status, deadline, started_at, completed_at, score, scored_by } = req.body;
    // auto set is_late
    let is_late = undefined;
    if (status === 'done' && completed_at) {
      const [[task]] = await db.query('SELECT deadline FROM request_tasks WHERE id=?', [req.params.id]);
      if (task?.deadline) is_late = new Date(completed_at) > new Date(task.deadline) ? 1 : 0;
    }
    await db.query(
      `UPDATE request_tasks SET
        title=COALESCE(?,title), description=COALESCE(?,description), tools=COALESCE(?,tools),
        priority=COALESCE(?,priority), status=COALESCE(?,status), deadline=COALESCE(?,deadline),
        started_at=COALESCE(?,started_at), completed_at=COALESCE(?,completed_at),
        score=COALESCE(?,score), scored_by=COALESCE(?,scored_by),
        scored_at=IF(?IS NOT NULL,NOW(),scored_at),
        is_late=COALESCE(?,is_late)
       WHERE id=?`,
      [title,description,tools,priority,status,deadline,started_at,completed_at,
       score,scored_by,score,is_late,req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
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
    await db.query('DELETE FROM request_task_assignees WHERE task_id=? AND user_id=?', [req.params.id, req.params.userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.addComment = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'message required' });
    const [r] = await db.query('INSERT INTO request_task_comments (task_id,user_id,message) VALUES (?,?,?)',
      [req.params.id, req.user.id, message]);
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
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
