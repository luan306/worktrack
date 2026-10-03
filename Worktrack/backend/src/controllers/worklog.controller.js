// ══════════════════════════════════════════════════════════════════
// Công việc hằng ngày (thay cho Daily cũ)
//   - Nhân viên ghi chú từng việc mình làm trong ngày (không cần giờ).
//   - Leader (của nhóm) / Manager / Admin xem và CHẤM ĐIỂM CẢ NGÀY (0–10).
//   - Ngày đã chấm thì bị khóa: nhân viên không thêm/sửa/xóa việc của ngày đó.
// ══════════════════════════════════════════════════════════════════
const ExcelJS = require('exceljs');
const db    = require('../config/db');
const cache = require('../config/cache');
const { logActivity, fmtScore } = require('../services/activityLogService');
const { notifyMany } = require('../services/notificationService');
const { localDate, parseLocalDate, addDays, mondayOf } = require('../utils/date');
const { styleHeader, sendXlsx, xlsxError } = require('../utils/excel');
const { pendingScoreDays } = require('../services/worklogService');

const MAX_SCORE = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isPrivileged = (req) => ['admin', 'manager'].includes(req.user.role);
const actorOf = (req) => req.user.full_name || req.user.username;
const fail = (res, status, message) => res.status(status).json({ success: false, message });

// Leader xem/chấm được người cùng nhóm; Admin/Manager: mọi người; ai cũng xem được chính mình
async function canView(req, userId) {
  if (+userId === req.user.id || isPrivileged(req)) return true;
  if (req.user.role !== 'leader') return false;
  const [[row]] = await db.query(
    `SELECT 1 AS x FROM group_members a JOIN group_members b ON b.group_id=a.group_id
      WHERE a.user_id=? AND b.user_id=? LIMIT 1`, [req.user.id, userId]);
  return !!row;
}
// Quyền chấm khi ĐÃ biết xem được: không ai tự chấm cho chính mình, nhân viên thường không chấm
const scoresVisible = (req, userId) => +userId !== req.user.id && req.user.role !== 'user';
const canScore = async (req, userId) => scoresVisible(req, userId) && canView(req, userId);

const dayScoreOf = async (userId, date) =>
  (await db.query('SELECT id, score, scored_by FROM daily_day_scores WHERE user_id=? AND work_date=?', [userId, date]))[0][0];

const dayOffOf = async (userId, date) =>
  (await db.query('SELECT kind, reason FROM daily_day_offs WHERE user_id=? AND work_date=?', [userId, date]))[0][0];
const OFF_LABEL = { full: 'Nghỉ cả ngày', am: 'Nghỉ buổi sáng', pm: 'Nghỉ buổi chiều' };
// Công ty làm T2–T6
const isWeekend = (dateStr) => [0, 6].includes(parseLocalDate(dateStr).getDay());

const broadcast = (req, userId, workDate) => req.app.get('io')?.emit('worklog:updated', { userId: +userId, workDate });

// GET /worklog/members — danh sách người mình được xem công việc hằng ngày
exports.members = async (req, res) => {
  try {
    const rows = await viewableUsers(req);
    // Chính mình lên đầu, còn lại theo tên (viewableUsers đã sắp theo tên)
    rows.sort((a, b) => (b.id === req.user.id) - (a.id === req.user.id));
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /worklog?user_id=&week=YYYY-MM-DD — việc + điểm 7 ngày của tuần chứa `week`
exports.week = async (req, res) => {
  try {
    const userId = +(req.query.user_id || req.user.id);
    const ref = DATE_RE.test(req.query.week || '') ? req.query.week : localDate();
    if (!(await canView(req, userId))) return fail(res, 403, 'Bạn không có quyền xem công việc hằng ngày của người này');

    // ?month=YYYY-MM → cả tháng (từ Thứ 2 của tuần đầu đến Chủ nhật của tuần cuối, để vẽ lưới lịch)
    // ?week=YYYY-MM-DD → 1 tuần chứa ngày đó (giữ cho tương thích)
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : null;
    let start, end;
    if (month) {
      const [y, m] = month.split('-').map(Number);
      start = mondayOf(`${month}-01`);
      end = addDays(mondayOf(localDate(new Date(y, m, 0))), 6);
    } else {
      start = mondayOf(ref);
      end = addDays(start, 6);
    }

    const [[[user]], [entries], [scores], [offs]] = await Promise.all([
      db.query(
        `SELECT u.id, u.full_name, u.username, u.avatar_color, u.role,
                (SELECT GROUP_CONCAT(g.name ORDER BY g.name SEPARATOR ', ') FROM group_members gm
                   JOIN \`groups\` g ON g.id=gm.group_id AND g.is_active=1 WHERE gm.user_id=u.id) AS group_names
           FROM users u WHERE u.id=?`, [userId]),
      db.query(
        `SELECT id, DATE_FORMAT(work_date,'%Y-%m-%d') AS work_date, title, description,
                DATE_FORMAT(created_at,'%Y-%m-%d %H:%i') AS created_at
           FROM daily_entries WHERE user_id=? AND work_date BETWEEN ? AND ?
          ORDER BY work_date, id`, [userId, start, end]),
      db.query(
        `SELECT DATE_FORMAT(s.work_date,'%Y-%m-%d') AS work_date, s.score, s.comment,
                s.scored_by, u.full_name AS scorer_name, s.scored_at
           FROM daily_day_scores s LEFT JOIN users u ON u.id=s.scored_by
          WHERE s.user_id=? AND s.work_date BETWEEN ? AND ?`, [userId, start, end]),
      db.query(
        `SELECT DATE_FORMAT(o.work_date,'%Y-%m-%d') AS work_date, o.kind, o.reason, u.full_name AS created_by_name
           FROM daily_day_offs o LEFT JOIN users u ON u.id=o.created_by
          WHERE o.user_id=? AND o.work_date BETWEEN ? AND ?`, [userId, start, end]),
    ]);
    if (!user) return fail(res, 404, 'Không tìm thấy người dùng');
    const scorer = scoresVisible(req, userId);
    res.json({ success: true, data: {
      user, week_start: start, week_end: end, today: localDate(),
      entries, scores, offs, can_edit: userId === req.user.id, can_score: scorer,
      can_mark_off: userId === req.user.id || scorer, max_score: MAX_SCORE,
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Kiểm tra dữ liệu 1 việc; trả về thông báo lỗi hoặc null
async function validateEntry(req, { work_date, title }) {
  if (!DATE_RE.test(work_date || '')) return 'Ngày không hợp lệ';
  if (!title || !String(title).trim()) return 'Vui lòng nhập công việc';
  if (String(title).length > 200) return 'Tên công việc tối đa 200 ký tự';
  if (work_date > addDays(localDate(), 7)) return 'Chỉ được ghi việc trước tối đa 7 ngày';
  const [scored, off] = await Promise.all([dayScoreOf(req.user.id, work_date), dayOffOf(req.user.id, work_date)]);
  if (scored) return 'Ngày này đã được Leader chấm điểm — không thể thay đổi';
  if (off?.kind === 'full') return 'Ngày này bạn đã báo nghỉ cả ngày — hủy ngày nghỉ trước khi ghi việc';
  return null;
}

// POST /worklog/entries — chỉ ghi cho CHÍNH MÌNH
exports.createEntry = async (req, res) => {
  try {
    const body = { ...req.body, title: (req.body.title || '').trim() };
    const err = await validateEntry(req, body);
    if (err) return fail(res, 400, err);
    const [r] = await db.query(
      'INSERT INTO daily_entries (user_id, work_date, title, description) VALUES (?,?,?,?)',
      [req.user.id, body.work_date, body.title, body.description || null]);
    broadcast(req, req.user.id, body.work_date);
    res.status(201).json({ success: true, data: { id: r.insertId } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

async function ownEntry(req, res) {
  const [[entry]] = await db.query(
    `SELECT id, user_id, DATE_FORMAT(work_date,'%Y-%m-%d') AS work_date FROM daily_entries WHERE id=?`, [req.params.id]);
  if (!entry) { fail(res, 404, 'Không tìm thấy công việc'); return null; }
  if (entry.user_id !== req.user.id) { fail(res, 403, 'Chỉ người ghi mới được sửa/xóa công việc này'); return null; }
  return entry;
}

// PUT /worklog/entries/:id
exports.updateEntry = async (req, res) => {
  try {
    const entry = await ownEntry(req, res); if (!entry) return;
    // Không cho chuyển việc ra khỏi ngày đã chấm (kiểm tra cả ngày cũ lẫn ngày mới)
    if (await dayScoreOf(req.user.id, entry.work_date)) return fail(res, 400, 'Ngày này đã được Leader chấm điểm — không thể thay đổi');
    const body = { ...req.body, title: (req.body.title || '').trim() };
    const err = await validateEntry(req, body);
    if (err) return fail(res, 400, err);
    await db.query(
      'UPDATE daily_entries SET work_date=?, title=?, description=? WHERE id=?',
      [body.work_date, body.title, body.description || null, entry.id]);
    broadcast(req, req.user.id, body.work_date);
    if (body.work_date !== entry.work_date) broadcast(req, req.user.id, entry.work_date);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DELETE /worklog/entries/:id
exports.deleteEntry = async (req, res) => {
  try {
    const entry = await ownEntry(req, res); if (!entry) return;
    if (await dayScoreOf(req.user.id, entry.work_date)) return fail(res, 400, 'Ngày này đã được Leader chấm điểm — không thể thay đổi');
    await db.query('DELETE FROM daily_entries WHERE id=?', [entry.id]);
    broadcast(req, req.user.id, entry.work_date);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// PUT /worklog/scores — Leader/Manager/Admin chấm điểm CẢ NGÀY cho 1 người
// { user_id, work_date, score (0–10), comment, edit_reason (bắt buộc khi sửa điểm đã chấm) }
exports.scoreDay = async (req, res) => {
  try {
    const { user_id, work_date, comment, edit_reason } = req.body;
    const score = Number(req.body.score);
    if (!user_id || !DATE_RE.test(work_date || '')) return fail(res, 400, 'Thiếu người hoặc ngày cần chấm');
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return fail(res, 400, `Điểm phải từ 0 đến ${MAX_SCORE}`);
    if (work_date > localDate()) return fail(res, 400, 'Không thể chấm điểm cho ngày chưa tới');
    if (+user_id === req.user.id) return fail(res, 403, 'Không thể tự chấm điểm cho chính mình');
    const [allowed, off, old] = await Promise.all([canScore(req, user_id), dayOffOf(user_id, work_date), dayScoreOf(user_id, work_date)]);
    if (!allowed) return fail(res, 403, 'Bạn chỉ chấm điểm được thành viên nhóm mình');
    if (off?.kind === 'full') return fail(res, 400, 'Người này nghỉ cả ngày — không cần chấm điểm');

    const changed = old && (+old.score !== +score);
    if (changed && !(edit_reason && String(edit_reason).trim()))
      return fail(res, 400, 'Cần ghi lý do khi sửa điểm đã chấm trước đó');

    await db.query(
      `INSERT INTO daily_day_scores (user_id, work_date, score, comment, scored_by, scored_at)
       VALUES (?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE score=VALUES(score), comment=VALUES(comment), scored_by=VALUES(scored_by), scored_at=NOW()`,
      [user_id, work_date, score, comment || null, req.user.id]);
    cache.clear('dash:');
    broadcast(req, user_id, work_date);

    // 📝 Lịch sử thay đổi + 🔔 thông báo
    const [[[target]], [[stats]], [[prevScorer]]] = await Promise.all([
      db.query('SELECT full_name FROM users WHERE id=?', [user_id]),
      db.query('SELECT COUNT(*) AS n FROM daily_entries WHERE user_id=? AND work_date=?', [user_id, work_date]),
      old?.scored_by ? db.query('SELECT full_name FROM users WHERE id=?', [old.scored_by]) : [[null]],
    ]);
    const where = `ngày ${work_date} của ${target?.full_name} (${stats.n} việc)`;
    await logActivity({
      actorId: req.user.id, actionType: old ? 'worklog_score_edited' : 'worklog_scored', entityType: 'worklog', entityId: +user_id,
      description: old
        ? `${actorOf(req)} đã SỬA điểm ${where}: ${fmtScore(old.score)} → ${fmtScore(score)}${prevScorer ? ` (điểm cũ do ${prevScorer.full_name} chấm)` : ''}. Lý do: ${edit_reason || '—'}`
        : `${actorOf(req)} đã chấm điểm ${where}: ${fmtScore(score)}${comment ? `. Nhận xét: ${comment}` : ''}`,
      metadata: { user_id: +user_id, work_date, old_score: old?.score ?? null, new_score: score, comment: comment || null, reason: edit_reason || null },
    });
    if (!old || changed || comment) {
      const targets = [+user_id, ...(changed && old.scored_by ? [old.scored_by] : [])];
      notifyMany(req.app.get('io'), targets, {
        actorId: req.user.id, type: old ? 'worklog_score_edited' : 'worklog_scored', entityType: 'worklog', entityId: +user_id,
        payload: { workDate: work_date, score, oldScore: old?.score ?? null, targetName: target?.full_name, actorName: actorOf(req), comment: comment || null },
      }).catch(err => console.error('[notify worklog]', err.message));
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /worklog/history?user_id=&date= — lịch sử chấm / sửa điểm của 1 ngày:
// ai chấm, điểm cũ → mới, lý do sửa, nhận xét, lúc nào. Ai xem được ghi chú
// ngày đó thì xem được lịch sử (nhân viên biết vì sao mình bị sửa điểm).
exports.history = async (req, res) => {
  try {
    const userId = +req.query.user_id;
    const date = req.query.date;
    if (!userId || !DATE_RE.test(date || '')) return fail(res, 400, 'Thiếu người hoặc ngày');
    if (!(await canView(req, userId))) return fail(res, 403, 'Bạn không có quyền xem');
    const [rows] = await db.query(
      `SELECT al.id, al.action_type, DATE_FORMAT(al.created_at,'%Y-%m-%d %H:%i') AS at,
              u.full_name AS actor_name, u.avatar_color AS actor_color,
              JSON_UNQUOTE(JSON_EXTRACT(al.metadata,'$.old_score')) AS old_score,
              JSON_UNQUOTE(JSON_EXTRACT(al.metadata,'$.new_score')) AS new_score,
              JSON_UNQUOTE(JSON_EXTRACT(al.metadata,'$.reason'))    AS reason,
              JSON_UNQUOTE(JSON_EXTRACT(al.metadata,'$.comment'))   AS comment
         FROM activity_logs al LEFT JOIN users u ON u.id=al.actor_id
        WHERE al.entity_type='worklog' AND al.entity_id=?
          AND al.action_type IN ('worklog_scored','worklog_score_edited')
          AND JSON_UNQUOTE(JSON_EXTRACT(al.metadata,'$.work_date'))=?
        ORDER BY al.id DESC`, [userId, date]);
    const clean = (v) => (v === null || v === 'null' ? null : v);
    res.json({ success: true, data: rows.map(r => ({ ...r, old_score: clean(r.old_score), reason: clean(r.reason), comment: clean(r.comment) })) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Ngày nghỉ ─────────────────────────────────────────────────────
// Nhân viên tự báo nghỉ cho mình; Leader/Manager/Admin đánh dấu nghỉ cho người mình chấm được.
// Ngày đã chấm điểm thì khóa (không đổi trạng thái nghỉ nữa).
async function checkOffAccess(req, res, userId, date) {
  if (!userId || !DATE_RE.test(date || '')) { fail(res, 400, 'Thiếu người hoặc ngày'); return false; }
  if (isWeekend(date)) { fail(res, 400, 'Thứ 7, Chủ nhật công ty đã nghỉ sẵn'); return false; }
  const [allowed, scored] = await Promise.all([userId === req.user.id || canScore(req, userId), dayScoreOf(userId, date)]);
  if (!allowed) { fail(res, 403, 'Bạn không có quyền đánh dấu nghỉ cho người này'); return false; }
  if (scored) { fail(res, 400, 'Ngày này đã được chấm điểm — không thể đổi trạng thái nghỉ'); return false; }
  return true;
}

async function logOff(req, userId, date, text, meta) {
  const [[target]] = await db.query('SELECT full_name FROM users WHERE id=?', [userId]);
  await logActivity({
    actorId: req.user.id, actionType: 'worklog_day_off', entityType: 'worklog', entityId: userId,
    description: `${actorOf(req)} ${text} ngày ${date} của ${target?.full_name}`,
    metadata: { user_id: userId, work_date: date, ...meta },
  });
}

// PUT /worklog/offs { user_id, work_date, kind: full|am|pm, reason }
exports.setDayOff = async (req, res) => {
  try {
    const userId = +(req.body.user_id || req.user.id);
    const { work_date } = req.body;
    const kind = ['full', 'am', 'pm'].includes(req.body.kind) ? req.body.kind : 'full';
    const reason = String(req.body.reason || '').trim().slice(0, 255) || null;
    if (!(await checkOffAccess(req, res, userId, work_date))) return;
    if (kind === 'full') {
      const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM daily_entries WHERE user_id=? AND work_date=?', [userId, work_date]);
      if (n) return fail(res, 400, `Ngày này đã ghi ${n} việc — nghỉ cả ngày thì phải xóa các việc đó trước (hoặc chọn nghỉ nửa buổi)`);
    }
    await db.query(
      `INSERT INTO daily_day_offs (user_id, work_date, kind, reason, created_by) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE kind=VALUES(kind), reason=VALUES(reason), created_by=VALUES(created_by), created_at=NOW()`,
      [userId, work_date, kind, reason, req.user.id]);
    await logOff(req, userId, work_date, `đã đánh dấu ${OFF_LABEL[kind].toUpperCase()}${reason ? ` (${reason})` : ''} cho`, { kind, reason });
    broadcast(req, userId, work_date);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DELETE /worklog/offs?user_id=&date=
exports.removeDayOff = async (req, res) => {
  try {
    const userId = +(req.query.user_id || req.user.id);
    const date = req.query.date;
    if (!(await checkOffAccess(req, res, userId, date))) return;
    const [r] = await db.query('DELETE FROM daily_day_offs WHERE user_id=? AND work_date=?', [userId, date]);
    if (r.affectedRows) await logOff(req, userId, date, 'đã HỦY ngày nghỉ', { kind: null });
    broadcast(req, userId, date);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Xuất báo cáo Excel ────────────────────────────────────────────
// GET /worklog/export?from=&to=&user_id=  (user_id='all' → mọi người mình được xem)
// Sheet "Tổng hợp": mỗi người 1 dòng; sheet "Chi tiết": mỗi người × mỗi ngày làm việc (T2–T6).
const WD_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MAX_EXPORT_DAYS = 186;
const vnDate = (s) => s.split('-').reverse().join('/');
// Kiểm tra ?from=&to= — trả về thông báo lỗi hoặc null
const rangeError = ({ from, to }, maxDays) =>
  !DATE_RE.test(from || '') || !DATE_RE.test(to || '') || from > to ? 'Khoảng ngày không hợp lệ'
  : (parseLocalDate(to) - parseLocalDate(from)) / 864e5 > maxDays ? `Chỉ xem / xuất tối đa ${maxDays} ngày mỗi lần` : null;

// Danh sách người `req.user` được xem (giống /worklog/members), có thể lọc 1 người
async function viewableUsers(req, onlyId) {
  let sql = `SELECT u.id, u.full_name, u.username, u.avatar_color, u.role,
                    GROUP_CONCAT(g.name ORDER BY g.name SEPARATOR ', ') AS group_names
               FROM users u
               LEFT JOIN group_members gm ON gm.user_id=u.id
               LEFT JOIN \`groups\` g ON g.id=gm.group_id AND g.is_active=1
              WHERE u.is_active=1`;
  const p = [];
  if (onlyId) { sql += ' AND u.id=?'; p.push(onlyId); }
  else if (req.user.role === 'leader') {
    sql += ` AND (u.id=? OR u.id IN (SELECT b.user_id FROM group_members a
                                      JOIN group_members b ON b.group_id=a.group_id WHERE a.user_id=?))`;
    p.push(req.user.id, req.user.id);
  } else if (!isPrivileged(req)) { sql += ' AND u.id=?'; p.push(req.user.id); }
  sql += ' GROUP BY u.id ORDER BY u.full_name';
  return (await db.query(sql, p))[0];
}

exports.exportReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    const bad = rangeError(req.query, MAX_EXPORT_DAYS);
    if (bad) return fail(res, 400, bad);
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);   // gồm T7/CN để ghi nhận tăng ca
    const workdays = days.filter(d => !isWeekend(d));

    let users;
    if (req.query.user_id === 'all') users = await viewableUsers(req);
    else {
      const uid = +(req.query.user_id || req.user.id);
      if (!(await canView(req, uid))) return fail(res, 403, 'Bạn không có quyền xem người này');
      users = await viewableUsers(req, uid);
    }
    if (!users.length) return fail(res, 404, 'Không có ai để xuất báo cáo');
    const ids = users.map(u => u.id);

    const [[entries], [scores], [offs]] = await Promise.all([
      db.query(`SELECT user_id, DATE_FORMAT(work_date,'%Y-%m-%d') AS d, title, description FROM daily_entries
                 WHERE user_id IN (?) AND work_date BETWEEN ? AND ? ORDER BY work_date, id`, [ids, from, to]),
      db.query(`SELECT s.user_id, DATE_FORMAT(s.work_date,'%Y-%m-%d') AS d, s.score, s.comment, u.full_name AS scorer
                  FROM daily_day_scores s LEFT JOIN users u ON u.id=s.scored_by
                 WHERE s.user_id IN (?) AND s.work_date BETWEEN ? AND ?`, [ids, from, to]),
      db.query(`SELECT user_id, DATE_FORMAT(work_date,'%Y-%m-%d') AS d, kind, reason FROM daily_day_offs
                 WHERE user_id IN (?) AND work_date BETWEEN ? AND ?`, [ids, from, to]),
    ]);
    const key = (u, d) => `${u}|${d}`;
    const entMap = new Map(), scMap = new Map(), offMap = new Map();
    entries.forEach(e => { const k = key(e.user_id, e.d); if (!entMap.has(k)) entMap.set(k, []); entMap.get(k).push(e); });
    scores.forEach(s => scMap.set(key(s.user_id, s.d), s));
    offs.forEach(o => offMap.set(key(o.user_id, o.d), o));
    const today = localDate();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Worktrack';
    const fillOf = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const scoreFill = (v) => fillOf(v >= MAX_SCORE * .8 ? 'FFD9F7E7' : v >= MAX_SCORE * .5 ? 'FFFEF0D5' : 'FFFBDDE1');

    const sum = wb.addWorksheet('Tổng hợp');
    sum.columns = [
      { header: 'STT', key: 'i', width: 6 },
      { header: 'Họ tên', key: 'name', width: 26 },
      { header: 'MSNV', key: 'msnv', width: 12 },
      { header: 'Bộ phận', key: 'group', width: 22 },
      { header: 'Ngày làm việc\n(T2–T6)', key: 'wd', width: 13 },
      { header: 'Nghỉ\n(ngày)', key: 'off', width: 9 },
      { header: 'Tăng ca\n(ngày)', key: 'ot', width: 10 },
      { header: 'Ngày có\nghi việc', key: 'logged', width: 11 },
      { header: 'Chưa ghi\nviệc', key: 'missing', width: 10 },
      { header: 'Tổng số\nviệc', key: 'tasks', width: 10 },
      { header: 'Đã chấm', key: 'scored', width: 10 },
      { header: 'Chưa chấm', key: 'unscored', width: 11 },
    ];
    styleHeader(sum, { autoFilter: true, height: 32 });

    const det = wb.addWorksheet('Chi tiết');
    det.columns = [
      { header: 'Ngày', key: 'date', width: 12 },
      { header: 'Thứ', key: 'wd', width: 6 },
      { header: 'Họ tên', key: 'name', width: 24 },
      { header: 'MSNV', key: 'msnv', width: 12 },
      { header: 'Bộ phận', key: 'group', width: 18 },
      { header: 'Trạng thái', key: 'status', width: 18 },
      { header: 'Công việc đã làm', key: 'tasks', width: 60 },
      { header: 'Số việc', key: 'n', width: 8 },
      { header: 'Điểm', key: 'score', width: 8 },
      { header: 'Nhận xét', key: 'comment', width: 30 },
      { header: 'Người chấm', key: 'scorer', width: 20 },
    ];
    styleHeader(det, { autoFilter: true, height: 32 });

    users.forEach((u, idx) => {
      let off = 0, ot = 0, logged = 0, missing = 0, tasks = 0, scored = 0, unscored = 0;
      days.forEach(d => {
        const k = key(u.id, d), list = entMap.get(k) || [], sc = scMap.get(k), o = offMap.get(k);
        const past = d <= today, fullOff = o?.kind === 'full', weekend = isWeekend(d);
        if (weekend && !list.length && !sc) return;   // T7/CN không tăng ca → ngày nghỉ, không ghi dòng
        if (weekend) ot++;
        if (o) off += fullOff ? 1 : .5;
        if (list.length) logged++;
        tasks += list.length;
        if (sc) scored++;
        let status = weekend ? 'Tăng ca' : past ? 'Làm việc' : 'Chưa tới';
        if (o) status = OFF_LABEL[o.kind];
        else if (past && !list.length) { status = 'Chưa ghi việc'; missing++; }
        if (past && !fullOff && list.length && !sc) unscored++;

        const row = det.addRow({
          date: vnDate(d), wd: WD_VI[parseLocalDate(d).getDay()], name: u.full_name, msnv: u.username, group: u.group_names || '',
          status: o?.reason ? `${status} (${o.reason})` : status,
          tasks: list.map((e, i) => `${i + 1}. ${e.title}${e.description ? ` — ${e.description}` : ''}`).join('\n'),
          n: list.length || '', score: sc ? +sc.score : '', comment: sc?.comment || '', scorer: sc?.scorer || '',
        });
        row.alignment = { vertical: 'top', wrapText: true };
        if (o) row.getCell('status').fill = fillOf('FFDDF3F1');
        else if (weekend) row.getCell('status').fill = fillOf('FFEDE5FD');
        else if (status === 'Chưa ghi việc') row.getCell('status').fill = fillOf('FFFBDDE1');
        if (sc) row.getCell('score').fill = scoreFill(+sc.score);
      });
      if (idx < users.length - 1) det.addRow({}); // dòng trống tách từng người

      const r = sum.addRow({ i: idx + 1, name: u.full_name, msnv: u.username, group: u.group_names || '', wd: workdays.length, off, ot, logged, missing, tasks, scored, unscored });
      if (missing) r.getCell('missing').font = { color: { argb: 'FFE5384D' }, bold: true };
    });
    ['i', 'wd', 'off', 'ot', 'logged', 'missing', 'tasks', 'scored', 'unscored'].forEach(k => { sum.getColumn(k).alignment = { horizontal: 'center', vertical: 'middle' }; });
    sum.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; // getColumn().alignment ghi đè dòng tiêu đề

    const who = users.length === 1 ? (users[0].username || users[0].id) : 'nhom';
    const filename = `baocao_congviec_${who}_${from}_${to}.xlsx`.replace(/[^\w.-]/g, '_');
    await sendXlsx(res, wb, filename);
  } catch (e) { xlsxError(res, e); }
};

// GET /worklog/overview?from=&to= — bảng tổng hợp: mọi người mình được xem × từng ngày T2–T6
// Mỗi ô: số việc, điểm, nghỉ — giao diện tự tô màu (trắng: chưa tới, đỏ: chưa ghi, vàng: chờ chấm)
const MAX_OVERVIEW_DAYS = 93;
exports.overview = async (req, res) => {
  try {
    const { from, to } = req.query;
    const bad = rangeError(req.query, MAX_OVERVIEW_DAYS);
    if (bad) return fail(res, 400, bad);
    const users = await viewableUsers(req);
    const ids = users.map(u => u.id);
    const [[counts], [scores], [offs]] = ids.length ? await Promise.all([
      db.query(`SELECT user_id, DATE_FORMAT(work_date,'%Y-%m-%d') AS d, COUNT(*) AS n FROM daily_entries
                 WHERE user_id IN (?) AND work_date BETWEEN ? AND ? GROUP BY user_id, work_date`, [ids, from, to]),
      db.query(`SELECT user_id, DATE_FORMAT(work_date,'%Y-%m-%d') AS d, score FROM daily_day_scores
                 WHERE user_id IN (?) AND work_date BETWEEN ? AND ?`, [ids, from, to]),
      db.query(`SELECT user_id, DATE_FORMAT(work_date,'%Y-%m-%d') AS d, kind, reason FROM daily_day_offs
                 WHERE user_id IN (?) AND work_date BETWEEN ? AND ?`, [ids, from, to]),
    ]) : [[[]], [[]], [[]]];
    // cells[user_id][date] = { n, score, off, reason }
    const cells = {};
    const cell = (u, d) => ((cells[u] ||= {})[d] ||= {});
    counts.forEach(r => { cell(r.user_id, r.d).n = r.n; });
    scores.forEach(r => { cell(r.user_id, r.d).score = +r.score; });
    offs.forEach(r => { Object.assign(cell(r.user_id, r.d), { off: r.kind, reason: r.reason }); });
    res.json({ success: true, data: {
      from, to, today: localDate(), max_score: MAX_SCORE,
      users, cells,
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /worklog/pending?count=1 — HỘP "CHỜ CHẤM": các ngày người mình chấm được đã ghi việc
// nhưng chưa có điểm (30 ngày gần nhất, tới hôm nay). count=1 → chỉ trả số lượng (badge menu).
const PENDING_DAYS = 30;
exports.pending = async (req, res) => {
  try {
    if (req.user.role === 'user') return res.json({ success: true, data: req.query.count ? { total: 0 } : { total: 0, items: [] } });
    const people = (await viewableUsers(req)).filter(u => scoresVisible(req, u.id));
    const today = localDate();
    const days = await pendingScoreDays({ from: addDays(today, -PENDING_DAYS), to: today, userIds: people.map(u => u.id) });
    if (req.query.count) return res.json({ success: true, data: { total: days.length } });

    // 2 việc đầu của mỗi ngày để leader xem nhanh không cần mở
    const titles = new Map();
    if (days.length) {
      const [entries] = await db.query(
        `SELECT user_id, DATE_FORMAT(work_date,'%Y-%m-%d') AS d, title FROM daily_entries
          WHERE user_id IN (?) AND work_date BETWEEN ? AND ? ORDER BY work_date, id`,
        [[...new Set(days.map(d => d.user_id))], days[0].work_date, today]);
      for (const e of entries) {
        const k = `${e.user_id}|${e.d}`;
        if (!titles.has(k)) titles.set(k, []);
        if (titles.get(k).length < 2) titles.get(k).push(e.title);
      }
    }
    const byId = new Map(people.map(u => [u.id, u]));
    res.json({ success: true, data: {
      total: days.length, today,
      items: days.map(d => {
        const u = byId.get(d.user_id);
        return { user: { id: u.id, full_name: u.full_name, username: u.username, avatar_color: u.avatar_color, group_names: u.group_names },
                 work_date: d.work_date, n: d.n, titles: titles.get(`${d.user_id}|${d.work_date}`) || [] };
      }),
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
