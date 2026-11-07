// Công việc hằng ngày (thay cho Daily cũ) - Nhân viên ghi chú từng việc mình làm trong ngày
const { hasPerm } = require('../config/permissions');
const settings = require('../config/settings');
const ExcelJS = require('exceljs');
const db    = require('../config/db');
const cache = require('../config/cache');
const { logActivity, fmtScore } = require('../services/activityLogService');
const { notifyMany } = require('../services/notificationService');
const { localDate, parseLocalDate, addDays, mondayOf, isWeekend } = require('../utils/date');
const { styleHeader, sendXlsx, xlsxError } = require('../utils/excel');
const { pendingScoreDays, holidayMap, holidaysBetween, clearHolidayCache, isRestDay, leaderGated, leaderFirstSet, membersWithLeader } = require('../services/worklogService');
const workflow = require('../config/workflow'); // Quản trị → 🔀 Quy trình
const REVIEWERS = ['admin', 'manager'];          // bước "Manager duyệt"
const REVIEWED_LOCK = 'Manager đã duyệt điểm ngày này — chỉ Manager / Admin sửa được nữa';
const WAIT_LEADER = 'Leader chưa chấm ngày này — Manager chỉ xem và chấm sau khi Leader chấm xong';

const access = require('../config/access'); // bộ phân quyền mới — đang CHẠY SONG SONG (chỉ so sánh, không quyết định)

const MAX_SCORE = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isPrivileged = (req) => ['admin', 'manager'].includes(req.user.role);
const actorOf = (req) => req.user.full_name || req.user.username;
const fail = (res, status, message) => res.status(status).json({ success: false, message });

// Leader xem/chấm được người cùng nhóm; Admin/Manager: mọi người; ai cũng xem được chính mình
async function canViewLegacy(req, userId) {
  if (+userId === req.user.id || (isPrivileged(req) && hasPerm(req.user, 'wl.score'))) return true;
  if (!hasPerm(req.user, 'wl.score')) return false;
  const [[row]] = await db.query(
    `SELECT 1 AS x FROM group_members a JOIN group_members b ON b.group_id=a.group_id
      WHERE a.user_id=? AND b.user_id=? LIMIT 1`, [req.user.id, userId]);
  return !!row;
}
// Admin chưa chỉnh "Xem công việc hằng ngày" → như cũ; đã chỉnh → theo phạm vi Admin chọn
async function canView(req, userId) {
  if (access.isTuned(req.user, 'wl.view')) return access.decide('wl.view', req.user, { targetUserId: +userId }, false);
  const ok = await canViewLegacy(req, userId);
  access.shadow('wl.view', req.user, { targetUserId: +userId }, ok);
  return ok;
}
// 🔔 Nhân viên vừa ghi việc → báo người chấm của nhóm (Admin bật "Báo ngay khi nhân viên ghi công việc")
async function notifyNewEntry(req, workDate, title) {
  if (!settings.on('notif.entry_instant')) return;
  const roles = ['leader', ...(settings.on('notif.manager_group') ? ['manager'] : [])];
  let [rows] = await db.query(
    `SELECT DISTINCT l.id, l.role FROM group_members a
       JOIN group_members b ON b.group_id=a.group_id
       JOIN users l ON l.id=b.user_id AND l.role IN (?) AND l.is_active=1
      WHERE a.user_id=? AND l.id<>?`, [roles, req.user.id, req.user.id]);
  // Manager chỉ thấy sau khi Leader chấm → không báo Manager khi nhân viên có Leader
  if (roles.includes('manager') && workflow.dailyFlags().leaderFirst && (await membersWithLeader([req.user.id])).size)
    rows = rows.filter(r => r.role !== 'manager');
  if (!rows.length) return;
  // chống ngập chuông: mỗi người nhận chỉ 1 thông báo / nhân viên / ngày
  const [sent] = await db.query(
    `SELECT user_id FROM notifications WHERE type='worklog_entry_new' AND entity_id=? AND created_at >= CURDATE()`, [req.user.id]);
  const done = new Set(sent.map(r => r.user_id));
  const ids = rows.map(r => r.id).filter(id => !done.has(id));
  if (!ids.length) return;
  await notifyMany(req.app.get('io'), ids, {
    actorId: req.user.id, type: 'worklog_entry_new', entityType: 'worklog', entityId: req.user.id,
    payload: { workDate, title: String(title || '').slice(0, 80), actorName: actorOf(req) },
  });
}

// Quyền chấm khi ĐÃ biết xem được: không ai tự chấm cho chính mình, nhân viên thường không chấm
const scoresVisible = (req, userId) => +userId !== req.user.id && hasPerm(req.user, 'wl.score');
const canScoreLegacy = async (req, userId) => scoresVisible(req, userId) && canViewLegacy(req, userId);
// key: 'wl.score' (chấm) | 'wl.score_edit' (sửa điểm) | 'wl.dayoff_others' (đánh dấu nghỉ) — mặc định cả 3 như quyền chấm cũ
const canScore = async (req, userId, key = 'wl.score') => {
  if (access.isTuned(req.user, key)) return access.decide(key, req.user, { targetUserId: +userId }, false);
  const ok = await canScoreLegacy(req, userId);
  if (key === 'wl.score') access.shadow('wl.score', req.user, { targetUserId: +userId }, ok);
  return ok;
};
// Có quyền chấm ai đó không (hiện nút / hộp "Chờ chấm")
const scorerAny = (req) => access.isTuned(req.user, 'wl.score') ? access.hasAny(req.user, 'wl.score') : hasPerm(req.user, 'wl.score');

const dayScoreOf = async (userId, date) =>
  (await db.query('SELECT id, score, scored_by, reviewed_by FROM daily_day_scores WHERE user_id=? AND work_date=?', [userId, date]))[0][0];

const dayOffOf = async (userId, date) =>
  (await db.query('SELECT kind, reason FROM daily_day_offs WHERE user_id=? AND work_date=?', [userId, date]))[0][0];
const OFF_LABEL = { full: 'Nghỉ cả ngày', am: 'Nghỉ buổi sáng', pm: 'Nghỉ buổi chiều' };

// off=true: thay đổi NGÀY NGHỈ — mọi người đang mở lịch đều cần cập nhật (dải "ai nghỉ hôm nay")
const broadcast = (req, userId, workDate, off = false) => {
  if (off) cache.clear('wl:offs:'); // xóa TRƯỚC khi báo để mọi máy tải lại đều nhận danh sách mới
  req.app.get('io')?.emit('worklog:updated', { userId: +userId, workDate, off });
};

// Ai nghỉ ngày nào trong 1 khoảng
const teamOffsOf = (start, end) => cache.wrap(`wl:offs:${start}:${end}`, 60000, async () => (await db.query(
  `SELECT DATE_FORMAT(o.work_date,'%Y-%m-%d') AS work_date, o.kind, o.reason,
          u.id AS user_id, u.full_name, u.avatar_color
     FROM daily_day_offs o JOIN users u ON u.id=o.user_id AND u.is_active=1
    WHERE o.work_date BETWEEN ? AND ?
    ORDER BY o.work_date, u.full_name`, [start, end]))[0]);

// GET /worklog/members — danh sách người mình được xem công việc hằng ngày
// Cho ô "Kiểm tra quyền" ở trang Quản trị: kết quả của CODE CŨ để so với bộ mới
exports._legacy = { 'wl.view': canViewLegacy, 'wl.score': canScoreLegacy };

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

    // ?month=YYYY-MM → cả tháng (từ Thứ 2 của tuần đầu đến Chủ nhật của tuần cuối, để vẽ lưới lịch) ?week=YYYY-MM-DD
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

    let [[[user]], [entries], [scores], [offs], teamOffs, holidays] = await Promise.all([
      db.query(
        `SELECT u.id, u.full_name, u.username, u.avatar_color, u.role,
                (SELECT GROUP_CONCAT(g.name ORDER BY g.name SEPARATOR ', ') FROM group_members gm
                   JOIN \`groups\` g ON g.id=gm.group_id AND g.is_active=1 WHERE gm.user_id=u.id) AS group_names
           FROM users u WHERE u.id=?`, [userId]),
      db.query(
        `SELECT id, DATE_FORMAT(work_date,'%Y-%m-%d') AS work_date, title, description,
                DATE_FORMAT(span_start,'%Y-%m-%d') AS span_start, DATE_FORMAT(span_end,'%Y-%m-%d') AS span_end,
                DATE_FORMAT(created_at,'%Y-%m-%d %H:%i') AS created_at
           FROM daily_entries WHERE user_id=? AND work_date BETWEEN ? AND ?
          ORDER BY work_date, id`, [userId, start, end]),
      db.query(
        `SELECT DATE_FORMAT(s.work_date,'%Y-%m-%d') AS work_date, s.score, s.comment,
                s.scored_by, u.full_name AS scorer_name, s.scored_at,
                s.reviewed_by, (SELECT full_name FROM users WHERE id=s.reviewed_by) AS reviewer_name, DATE_FORMAT(s.reviewed_at,'%Y-%m-%d %H:%i') AS reviewed_at
           FROM daily_day_scores s LEFT JOIN users u ON u.id=s.scored_by
          WHERE s.user_id=? AND s.work_date BETWEEN ? AND ?`, [userId, start, end]),
      db.query(
        `SELECT DATE_FORMAT(o.work_date,'%Y-%m-%d') AS work_date, o.kind, o.reason, u.full_name AS created_by_name
           FROM daily_day_offs o LEFT JOIN users u ON u.id=o.created_by
          WHERE o.user_id=? AND o.work_date BETWEEN ? AND ?`, [userId, start, end]),
      teamOffsOf(start, end), // ai nghỉ ngày nào — MỌI NGƯỜI đều thấy toàn bộ (không chia nhóm/quyền)
      holidaysBetween(start, end),
    ]);
    if (!user) return fail(res, 404, 'Không tìm thấy người dùng');
    // Manager chỉ thấy ngày Leader đã chấm (Admin bật) → ngày chưa chấm: ẩn nội dung, chỉ báo "chờ Leader chấm"
    let waiting_days = [];
    if ((await leaderGated(req.user, [userId])).has(userId)) {
      const scoredSet = new Set(scores.map(s => s.work_date));
      waiting_days = [...new Set(entries.filter(e => !scoredSet.has(e.work_date)).map(e => e.work_date))];
      entries = entries.filter(e => scoredSet.has(e.work_date));
    }
    // Quy trình: có bước Manager duyệt không (chỉ với người có Leader — người không có Leader do Manager chấm thẳng)
    const wf = workflow.dailyFlags();
    const needsReview = wf.approve && (await membersWithLeader([userId])).has(userId);
    const flow = { review: wf.review, approve: wf.approve, needs_review: needsReview,
      can_review: needsReview && REVIEWERS.includes(req.user.role) && userId !== req.user.id };
    // Lý do nghỉ là thông tin riêng → chỉ Leader/Manager/Admin thấy; nhân viên chỉ thấy tên + loại nghỉ
    const seeReason = await access.decide('wl.off_reason', req.user, {}, hasPerm(req.user, 'wl.score'));
    access.shadow('wl.off_reason', req.user, {}, seeReason);
    // trừ người đang xem (ngày nghỉ của họ đã có ở `offs`)
    const team_offs = teamOffs.filter(o => o.user_id !== userId).map(o => ({ ...o, reason: seeReason ? o.reason : null }));
    const scorer = access.isTuned(req.user, 'wl.score') ? await canScore(req, userId) : scoresVisible(req, userId);
    res.json({ success: true, data: {
      user, week_start: start, week_end: end, today: localDate(),
      entries, scores, offs, team_offs, holidays, can_manage_holidays: hasPerm(req.user, 'wl.holidays'), waiting_days, flow,
      can_edit: userId === req.user.id, can_score: scorer,
      can_mark_off: userId === req.user.id || (access.isTuned(req.user, 'wl.dayoff_others') ? await canScore(req, userId, 'wl.dayoff_others') : scorer), max_score: MAX_SCORE,
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Kiểm tra dữ liệu 1 việc; trả về thông báo lỗi hoặc null
async function validateEntry(req, { work_date, title }, scoredOk = false) {
  if (!DATE_RE.test(work_date || '')) return 'Ngày không hợp lệ';
  if (!title || !String(title).trim()) return 'Vui lòng nhập công việc';
  if (String(title).length > 200) return 'Tên công việc tối đa 200 ký tự';
  if (work_date > addDays(localDate(), 7)) return 'Chỉ được ghi việc trước tối đa 7 ngày';
  const [scored, off] = await Promise.all([dayScoreOf(req.user.id, work_date), dayOffOf(req.user.id, work_date)]);
  if (scored && !scoredOk) return 'Ngày này đã được Leader chấm điểm — không thể thay đổi';
  if (off?.kind === 'full') return 'Ngày này bạn đã báo nghỉ cả ngày — hủy ngày nghỉ trước khi ghi việc';
  return null;
}

const MAX_SPAN_DAYS = 31; // việc làm nhiều ngày: tối đa 1 tháng / lần ghi

// POST /worklog/entries — chỉ ghi cho CHÍNH MÌNH Có `end_date`
exports.createEntry = async (req, res) => {
  try {
    const body = { ...req.body, title: (req.body.title || '').trim() };
    const err = await validateEntry(req, body);
    if (err) return fail(res, 400, err);
    const start = body.work_date, end = body.end_date || start;
    const spanErr = checkSpan(start, end);
    if (spanErr) return fail(res, 400, spanErr);

    if (end === start) {
      const [r] = await db.query(
        'INSERT INTO daily_entries (user_id, work_date, title, description) VALUES (?,?,?,?)',
        [req.user.id, start, body.title, body.description || null]);
      broadcast(req, req.user.id, start);
      notifyNewEntry(req, start, body.title).catch(e => console.error('[notify entry]', e.message));
      return res.status(201).json({ success: true, data: { id: r.insertId, created: 1, skipped: 0 } });
    }

    const { days, skipped } = await planSpanDays(req.user.id, start, end);
    const [r] = await db.query(
      'INSERT INTO daily_entries (user_id, work_date, title, description, span_start, span_end) VALUES ?',
      [days.map(d => [req.user.id, d, body.title, body.description || null, start, end])]);
    broadcast(req, req.user.id, start);
    notifyNewEntry(req, start, body.title).catch(e => console.error('[notify entry]', e.message));
    res.status(201).json({ success: true, data: { id: r.insertId, created: days.length, skipped } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Những ngày sẽ ghi của 1 việc nhiều ngày: ngày đầu (đã qua validateEntry) + các ngày làm việc sau đó,
// bỏ cuối tuần / lễ; ngày đã chấm hoặc nghỉ cả ngày thì bỏ qua và đếm vào `skipped`; `taken`: ngày đã có sẵn
async function planSpanDays(userId, start, end, taken = new Set(), q = db) {
  const [[scored], [offs]] = await Promise.all([
    q.query(`SELECT DATE_FORMAT(work_date,'%Y-%m-%d') AS d FROM daily_day_scores WHERE user_id=? AND work_date BETWEEN ? AND ?`, [userId, start, end]),
    q.query(`SELECT DATE_FORMAT(work_date,'%Y-%m-%d') AS d FROM daily_day_offs WHERE user_id=? AND kind='full' AND work_date BETWEEN ? AND ?`, [userId, start, end]),
  ]);
  const blocked = new Set([...scored, ...offs].map(r => r.d));
  const hol = await holidayMap();
  const days = taken.has(start) || blocked.has(start) ? [] : [start];
  let skipped = 0;
  for (let d = addDays(start, 1); d <= end; d = addDays(d, 1)) {
    if (taken.has(d) || isRestDay(d, hol)) continue;
    if (blocked.has(d)) skipped++; else days.push(d);
  }
  return { days, skipped };
}

const checkSpan = (start, end) =>
  !DATE_RE.test(end) || end < start ? 'Ngày kết thúc phải từ ngày bắt đầu trở đi'
  : end > addDays(start, MAX_SPAN_DAYS - 1) ? `Một việc chỉ kéo dài tối đa ${MAX_SPAN_DAYS} ngày` : null;

async function ownEntry(req, res) {
  const [[entry]] = await db.query(
    `SELECT id, user_id, title, description, DATE_FORMAT(work_date,'%Y-%m-%d') AS work_date,
            DATE_FORMAT(span_start,'%Y-%m-%d') AS span_start, DATE_FORMAT(span_end,'%Y-%m-%d') AS span_end
       FROM daily_entries WHERE id=?`, [req.params.id]);
  if (!entry) { fail(res, 404, 'Không tìm thấy công việc'); return null; }
  if (entry.user_id !== req.user.id) { fail(res, 403, 'Chỉ người ghi mới được sửa/xóa công việc này'); return null; }
  return entry;
}

// Log sửa / xóa việc hằng ngày (thêm mới không ghi log: mỗi người ghi nhiều việc mỗi ngày)
const dm = (d) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
const rangeOf = (a, b) => !a || !b || a === b ? dm(a || b) : `${dm(a)}–${dm(b)}`;
function logEntryChange(req, actionType, entry, next = null) {
  const oldRange = rangeOf(entry.span_start || entry.work_date, entry.span_end || entry.work_date);
  let text;
  if (!next) text = `${actorOf(req)} đã xóa công việc hằng ngày ngày ${dm(entry.work_date)}: “${entry.title}”`;
  else {
    const changes = [];
    if (next.title !== entry.title) changes.push(`tên: “${entry.title}” → “${next.title}”`);
    if ((next.description || '') !== (entry.description || '')) changes.push('sửa chi tiết');
    const newRange = rangeOf(next.start, next.end);
    if (newRange !== oldRange) changes.push(`ngày: ${oldRange} thành ${newRange}${next.created != null ? ` (ghi ${next.created} ngày)` : ''}`);
    if (!changes.length) return;
    text = `${actorOf(req)} đã sửa công việc hằng ngày “${next.title}” (${newRange}): ${changes.join('; ')}`;
  }
  logActivity({
    actorId: req.user.id, actionType, entityType: 'worklog', entityId: req.user.id, description: text,
    metadata: { work_date: entry.work_date, old: { title: entry.title, range: oldRange }, new: next && { title: next.title, start: next.start, end: next.end } },
  }).catch(e => console.error('[log worklog entry]', e.message));
}

// PUT /worklog/entries/:id — { work_date (ngày bắt đầu), end_date?, title, description }
// Việc nhiều ngày: sửa CẢ ĐỢT (tên, chi tiết, khoảng ngày); ngày đã chấm giữ nguyên
exports.updateEntry = async (req, res) => {
  try {
    const entry = await ownEntry(req, res); if (!entry) return;
    // Không cho chuyển việc ra khỏi ngày đã chấm (kiểm tra cả ngày cũ lẫn ngày mới)
    if (await dayScoreOf(req.user.id, entry.work_date)) return fail(res, 400, 'Ngày này đã được Leader chấm điểm — không thể thay đổi');
    const body = { ...req.body, title: (req.body.title || '').trim() };
    const wasSpan = !!(entry.span_start && entry.span_end && entry.span_start !== entry.span_end);
    // Đợt nhiều ngày giữ nguyên ngày đầu đã chấm: ngày đó không đổi, chỉ cập nhật các ngày còn lại
    const err = await validateEntry(req, body, wasSpan && body.work_date === entry.span_start);
    if (err) return fail(res, 400, err);
    const start = body.work_date, end = body.end_date || start;
    const spanErr = checkSpan(start, end);
    if (spanErr) return fail(res, 400, spanErr);

    if (!wasSpan && end === start) {
      await db.query(
        'UPDATE daily_entries SET work_date=?, title=?, description=? WHERE id=?',
        [start, body.title, body.description || null, entry.id]);
      broadcast(req, req.user.id, start);
      if (start !== entry.work_date) broadcast(req, req.user.id, entry.work_date);
      logEntryChange(req, 'worklog_entry_updated', entry, { title: body.title, description: body.description, start, end });
      return res.json({ success: true, data: { created: 1, skipped: 0 } });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      // Cả đợt cũ: cùng người, cùng khoảng ngày, cùng tên
      const [series] = wasSpan
        ? await conn.query(
          `SELECT d.id, DATE_FORMAT(d.work_date,'%Y-%m-%d') AS work_date, s.id AS scored
             FROM daily_entries d LEFT JOIN daily_day_scores s ON s.user_id=d.user_id AND s.work_date=d.work_date
            WHERE d.user_id=? AND d.span_start=? AND d.span_end=? AND d.title=? FOR UPDATE`,
          [req.user.id, entry.span_start, entry.span_end, entry.title])
        : [[{ id: entry.id, work_date: entry.work_date, scored: null }]];
      const kept = series.filter(r => r.scored); // ngày đã chấm: không đụng tới
      const drop = series.filter(r => !r.scored).map(r => r.id);
      if (drop.length) await conn.query('DELETE FROM daily_entries WHERE id IN (?)', [drop]);
      const { days, skipped } = await planSpanDays(req.user.id, start, end, new Set(kept.map(r => r.work_date)), conn);
      const span = end === start ? [null, null] : [start, end];
      if (days.length) await conn.query(
        'INSERT INTO daily_entries (user_id, work_date, title, description, span_start, span_end) VALUES ?',
        [days.map(d => [req.user.id, d, body.title, body.description || null, ...span])]);
      await conn.commit();
      broadcast(req, req.user.id, start);
      if (start !== entry.work_date) broadcast(req, req.user.id, entry.work_date);
      logEntryChange(req, 'worklog_entry_updated', entry, { title: body.title, description: body.description, start, end, created: days.length + kept.length });
      res.json({ success: true, data: { created: days.length, skipped: skipped + kept.length } });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DELETE /worklog/entries/:id
exports.deleteEntry = async (req, res) => {
  try {
    const entry = await ownEntry(req, res); if (!entry) return;
    if (await dayScoreOf(req.user.id, entry.work_date)) return fail(res, 400, 'Ngày này đã được Leader chấm điểm — không thể thay đổi');
    await db.query('DELETE FROM daily_entries WHERE id=?', [entry.id]);
    broadcast(req, req.user.id, entry.work_date);
    logEntryChange(req, 'worklog_entry_deleted', entry);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// PUT /worklog/scores — Leader/Manager/Admin chấm điểm CẢ NGÀY cho 1 người { user_id, work_date, score
exports.scoreDay = async (req, res) => {
  try {
    const { user_id, work_date, comment, edit_reason } = req.body;
    const score = Number(req.body.score);
    if (!user_id || !DATE_RE.test(work_date || '')) return fail(res, 400, 'Thiếu người hoặc ngày cần chấm');
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return fail(res, 400, `Điểm phải từ 0 đến ${MAX_SCORE}`);
    if (work_date > localDate()) return fail(res, 400, 'Không thể chấm điểm cho ngày chưa tới');
    if (+user_id === req.user.id) return fail(res, 403, 'Không thể tự chấm điểm cho chính mình');
    const [off, old] = await Promise.all([dayOffOf(user_id, work_date), dayScoreOf(user_id, work_date)]);
    const allowed = await canScore(req, user_id, old ? 'wl.score_edit' : 'wl.score'); // đã có điểm → quyền "sửa điểm"
    if (!allowed) return fail(res, 403, 'Bạn chỉ chấm điểm được thành viên nhóm mình');
    if (off?.kind === 'full') return fail(res, 400, 'Người này nghỉ cả ngày — không cần chấm điểm');
    if (!old && (await leaderFirstSet(req.user, [+user_id])).has(+user_id)) return fail(res, 403, WAIT_LEADER);
    if (old?.reviewed_by && !REVIEWERS.includes(req.user.role)) return fail(res, 403, REVIEWED_LOCK);

    const changed = old && (+old.score !== +score);
    if (changed && !(edit_reason && String(edit_reason).trim()))
      return fail(res, 400, 'Cần ghi lý do khi sửa điểm đã chấm trước đó');

    await db.query(
      `INSERT INTO daily_day_scores (user_id, work_date, score, comment, scored_by, scored_at)
       VALUES (?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE score=VALUES(score), comment=VALUES(comment), scored_by=VALUES(scored_by), scored_at=NOW()`,
      [user_id, work_date, score, comment || null, req.user.id]);
    // Quy trình có bước duyệt: Manager / Admin tự chấm hoặc sửa điểm = đã duyệt luôn
    if (workflow.dailyFlags().approve && REVIEWERS.includes(req.user.role) && (await membersWithLeader([+user_id])).has(+user_id))
      await db.query('UPDATE daily_day_scores SET reviewed_by=?, reviewed_at=NOW() WHERE user_id=? AND work_date=?', [req.user.id, user_id, work_date]);
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

// PUT /worklog/review { user_id, work_date } — Bước 2: Manager DUYỆT điểm Leader đã chấm (quy trình bật "phải bấm Duyệt")
exports.reviewDay = async (req, res) => {
  try {
    const { user_id, work_date } = req.body;
    if (!user_id || !DATE_RE.test(work_date || '')) return fail(res, 400, 'Thiếu người hoặc ngày');
    if (!workflow.dailyFlags().approve) return fail(res, 400, 'Quy trình hiện tại không có bước Manager duyệt');
    if (!REVIEWERS.includes(req.user.role)) return fail(res, 403, 'Chỉ Manager / Admin duyệt được điểm');
    if (+user_id === req.user.id) return fail(res, 403, 'Không tự duyệt điểm của chính mình');
    if (!(await canView(req, +user_id))) return fail(res, 403, 'Bạn không có quyền xem người này');
    const sc = await dayScoreOf(user_id, work_date);
    if (!sc) return fail(res, 400, 'Leader chưa chấm ngày này — chưa có gì để duyệt');
    if (sc.reviewed_by) return res.json({ success: true }); // đã duyệt rồi
    await db.query('UPDATE daily_day_scores SET reviewed_by=?, reviewed_at=NOW() WHERE id=? AND reviewed_by IS NULL', [req.user.id, sc.id]);
    cache.clear('dash:'); // điểm có thể vừa được tính vào Bảng điều khiển
    broadcast(req, user_id, work_date);
    const [[target]] = await db.query('SELECT full_name FROM users WHERE id=?', [user_id]);
    await logActivity({
      actorId: req.user.id, actionType: 'worklog_reviewed', entityType: 'worklog', entityId: +user_id,
      description: `${actorOf(req)} đã DUYỆT điểm ngày ${work_date} của ${target?.full_name}: ${fmtScore(sc.score)}`,
      metadata: { user_id: +user_id, work_date, new_score: sc.score, scored_by: sc.scored_by },
    });
    notifyMany(req.app.get('io'), [+user_id, ...(sc.scored_by && sc.scored_by !== req.user.id ? [sc.scored_by] : [])], {
      actorId: req.user.id, type: 'worklog_reviewed', entityType: 'worklog', entityId: +user_id,
      payload: { workDate: work_date, score: +sc.score, targetName: target?.full_name, actorName: actorOf(req) },
    }).catch(err => console.error('[notify reviewed]', err.message));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /worklog/history?user_id=&date=
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
          AND al.action_type IN ('worklog_scored','worklog_score_edited','worklog_reviewed')
          AND JSON_UNQUOTE(JSON_EXTRACT(al.metadata,'$.work_date'))=?
        ORDER BY al.id DESC`, [userId, date]);
    const clean = (v) => (v === null || v === 'null' ? null : v);
    res.json({ success: true, data: rows.map(r => ({ ...r, old_score: clean(r.old_score), reason: clean(r.reason), comment: clean(r.comment) })) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Ngày nghỉ ───────────────────────────────────────────────────── Nhân viên tự báo nghỉ cho mình
async function checkOffAccess(req, res, userId, date) {
  if (!userId || !DATE_RE.test(date || '')) { fail(res, 400, 'Thiếu người hoặc ngày'); return false; }
  if (isWeekend(date)) { fail(res, 400, 'Thứ 7, Chủ nhật công ty đã nghỉ sẵn'); return false; }
  const holiday = (await holidayMap()).get(date);
  if (holiday) { fail(res, 400, `Ngày này công ty nghỉ lễ (${holiday}) — không cần báo nghỉ`); return false; }
  const [allowed, scored] = await Promise.all([userId === req.user.id || canScore(req, userId, 'wl.dayoff_others'), dayScoreOf(userId, date)]);
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
    broadcast(req, userId, work_date, true);
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
    broadcast(req, userId, date, true);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Xuất báo cáo Excel ──────────────────────────────────────────── GET /worklog/export?from=&to=&user_id=
const WD_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MAX_EXPORT_DAYS = 186;
const vnDate = (s) => s.split('-').reverse().join('/');
// Kiểm tra ?from=&to= — trả về thông báo lỗi hoặc null
const validRange = (from, to) => DATE_RE.test(from || '') && DATE_RE.test(to || '') && from <= to;
const rangeError = ({ from, to }, maxDays) =>
  !validRange(from, to) ? 'Khoảng ngày không hợp lệ'
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
  const tuned = !onlyId && access.isTuned(req.user, 'wl.view');
  if (onlyId) { sql += ' AND u.id=?'; p.push(onlyId); }
  else if (tuned) { // Admin đã chỉnh phạm vi xem → lấy danh sách theo bộ phân quyền
    const ids = await access.usersInScope(req.user, 'wl.view');
    sql += ' AND u.id IN (?)'; p.push(ids.length ? ids : [0]);
  }
  else if (hasPerm(req.user, 'wl.score') && !isPrivileged(req)) {
    sql += ` AND (u.id=? OR u.id IN (SELECT b.user_id FROM group_members a
                                      JOIN group_members b ON b.group_id=a.group_id WHERE a.user_id=?))`;
    p.push(req.user.id, req.user.id);
  } else if (!(isPrivileged(req) && hasPerm(req.user, 'wl.score'))) { sql += ' AND u.id=?'; p.push(req.user.id); }
  sql += ' GROUP BY u.id ORDER BY u.full_name';
  const rows = (await db.query(sql, p))[0];
  if (!onlyId && !tuned) access.shadowList('wl.view', req.user, rows.map(r => r.id));
  return rows;
}

exports.exportReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    const bad = rangeError(req.query, MAX_EXPORT_DAYS);
    if (bad) return fail(res, 400, bad);
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);   // gồm T7/CN để ghi nhận tăng ca
    const hol = await holidayMap();
    const workdays = days.filter(d => !isRestDay(d, hol)); // ngày lễ không tính là ngày làm việc

    let users, groupName = null;
    if (req.query.user_id === 'all') {
      users = await viewableUsers(req);
      // ?group_id= → chỉ thành viên nhóm đó (trong số người mình được xem)
      if (req.query.group_id) {
        const [[[g]], [mem]] = await Promise.all([
          db.query('SELECT name FROM `groups` WHERE id=?', [req.query.group_id]),
          db.query('SELECT user_id FROM group_members WHERE group_id=?', [req.query.group_id]),
        ]);
        if (!g) return fail(res, 404, 'Không tìm thấy nhóm');
        const inGroup = new Set(mem.map(m => m.user_id));
        users = users.filter(u => inGroup.has(u.id));
        groupName = g.name;
      }
    } else {
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
    const gated = await leaderGated(req.user, ids); // Manager: ngày Leader chưa chấm → không xuất nội dung

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
        const k = key(u.id, d), sc = scMap.get(k), o = offMap.get(k);
        const waiting = !sc && gated.has(u.id) && (entMap.get(k) || []).length > 0;
        const list = waiting ? [] : entMap.get(k) || [];
        const past = d <= today, fullOff = o?.kind === 'full', weekend = isRestDay(d, hol);
        if (weekend && !list.length && !sc && !waiting) return;   // T7/CN không tăng ca → ngày nghỉ, không ghi dòng
        if (weekend) ot++;
        if (o) off += fullOff ? 1 : .5;
        if (list.length || waiting) logged++;
        tasks += list.length;
        if (sc) scored++;
        let status = weekend ? 'Tăng ca' : past ? 'Làm việc' : 'Chưa tới';
        if (o) status = OFF_LABEL[o.kind];
        else if (waiting) status = '⏳ Chờ Leader chấm';
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

    const noMark = (x) => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    const who = groupName ? `nhom_${noMark(groupName).trim().replace(/\s+/g, '-')}` : users.length === 1 ? (users[0].username || users[0].id) : 'nhom';
    const filename = `baocao_congviec_${who}_${from}_${to}.xlsx`.replace(/[^\w.-]/g, '_');
    await sendXlsx(res, wb, filename);
  } catch (e) { xlsxError(res, e); }
};

// GET /worklog/overview?from=&to=
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
    // Manager: ngày Leader chưa chấm → không đếm số việc, chỉ đánh dấu chờ Leader
    const gated = await leaderGated(req.user, ids);
    for (const uid of gated) for (const c of Object.values(cells[uid] || {})) if (c.n && c.score == null) { delete c.n; c.wait = 1; }
    res.json({ success: true, data: {
      from, to, today: localDate(), max_score: MAX_SCORE,
      users, cells, holidays: await holidaysBetween(from, to),
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /worklog/pending?count=1 — HỘP "CHỜ CHẤM"
const PENDING_DAYS = 30;
exports.pending = async (req, res) => {
  try {
    if (!scorerAny(req)) return res.json({ success: true, data: req.query.count ? { total: 0 } : { total: 0, items: [] } });
    let people = await viewableUsers(req);
    if (access.isTuned(req.user, 'wl.score')) { // Admin đã chỉnh quyền chấm → chỉ người mình chấm được
      const ok = await Promise.all(people.map(u => access.decide('wl.score', req.user, { targetUserId: u.id }, false)));
      people = people.filter((_, i) => ok[i]);
    } else people = people.filter(u => scoresVisible(req, u.id));
    if (req.query.scope === 'group') {
      const [mates] = await db.query(
        'SELECT DISTINCT b.user_id FROM group_members a JOIN group_members b ON b.group_id=a.group_id WHERE a.user_id=?', [req.user.id]);
      const ok = new Set(mates.map(m => m.user_id));
      people = people.filter(u => ok.has(u.id));
    }
    const gated = await leaderFirstSet(req.user, people.map(u => u.id)); // Manager: người có Leader → Leader chấm trước
    const peopleBefore = people;
    if (gated.size) people = people.filter(u => !gated.has(u.id));
    const today = localDate();
    // kèm 2 việc đầu của mỗi ngày để leader xem nhanh không cần mở
    const days = await pendingScoreDays({ from: addDays(today, -PENDING_DAYS), to: today, userIds: people.map(u => u.id), titles: !req.query.count });
    // Bước 2 "Manager duyệt": Manager thấy thêm các ngày Leader đã chấm, chờ mình duyệt
    let reviews = [];
    const allPeople = gated.size ? [...people, ...peopleBefore.filter(u => gated.has(u.id))] : people;
    if (workflow.dailyFlags().approve && req.user.role === 'manager' && allPeople.length) {
      const led = await membersWithLeader(allPeople.map(u => u.id).filter(id => id !== req.user.id));
      if (led.size) [reviews] = await db.query(
        `SELECT s.user_id, DATE_FORMAT(s.work_date,'%Y-%m-%d') AS work_date, s.score, u.full_name AS scorer_name,
                (SELECT COUNT(*) FROM daily_entries e WHERE e.user_id=s.user_id AND e.work_date=s.work_date) AS n
           FROM daily_day_scores s LEFT JOIN users u ON u.id=s.scored_by
          WHERE s.user_id IN (?) AND s.reviewed_by IS NULL AND s.work_date BETWEEN ? AND ?
          ORDER BY s.work_date, s.user_id`, [[...led], addDays(today, -PENDING_DAYS), today]);
    }
    if (req.query.count) return res.json({ success: true, data: { total: days.length + reviews.length } });
    const byId = new Map(allPeople.map(u => [u.id, u]));
    res.json({ success: true, data: {
      total: days.length + reviews.length, today,
      items: [
        ...days.map(d => ({ ...d, stage: 'score' })),
        ...reviews.map(r => ({ user_id: r.user_id, work_date: r.work_date, n: Number(r.n), titles: [], stage: 'review', score: +r.score, scorer_name: r.scorer_name })),
      ].sort((a, b) => (a.work_date < b.work_date ? -1 : a.work_date > b.work_date ? 1 : a.user_id - b.user_id)).map(d => {
        const u = byId.get(d.user_id);
        return { user: { id: u.id, full_name: u.full_name, username: u.username, avatar_color: u.avatar_color, group_names: u.group_names },
                 work_date: d.work_date, n: d.n, titles: d.titles, stage: d.stage, score: d.score, scorer_name: d.scorer_name };
      }),
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Ngày nghỉ lễ của công ty ──────────────────────────────────────
const MAX_HOLIDAY_SPAN = 31;

// GET /worklog/holidays?year=YYYY — ai đăng nhập cũng xem được
exports.listHolidays = async (req, res) => {
  try {
    const year = /^\d{4}$/.test(req.query.year || '') ? req.query.year : localDate().slice(0, 4);
    res.json({ success: true, data: await holidaysBetween(`${year}-01-01`, `${year}-12-31`) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Báo cho mọi máy đang mở lịch tải lại (off=true = thay đổi ảnh hưởng tất cả mọi người)
const holidaysChanged = (req, from) => { clearHolidayCache(); broadcast(req, 0, from, true); };

// PUT /worklog/holidays { from, to, name } hoặc { items
const MAX_HOLIDAY_ITEMS = 20;
exports.setHolidays = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
    if (!items.length || items.length > MAX_HOLIDAY_ITEMS) return fail(res, 400, `Mỗi lần thêm từ 1 đến ${MAX_HOLIDAY_ITEMS} đợt nghỉ lễ`);
    const rows = [], summary = [];
    for (const it of items) {
      const from = it?.from, to = it?.to || from;
      const name = String(it?.name || '').trim().slice(0, 120);
      if (!validRange(from, to)) return fail(res, 400, 'Khoảng ngày không hợp lệ');
      if (!name) return fail(res, 400, 'Vui lòng nhập tên ngày lễ');
      if (to > addDays(from, MAX_HOLIDAY_SPAN - 1)) return fail(res, 400, `Một đợt nghỉ lễ tối đa ${MAX_HOLIDAY_SPAN} ngày`);
      for (let d = from; d <= to; d = addDays(d, 1)) rows.push([d, name, req.user.id]);
      summary.push({ from, to, name });
    }
    await db.query('INSERT INTO company_holidays (work_date, name, created_by) VALUES ? ON DUPLICATE KEY UPDATE name=VALUES(name), created_by=VALUES(created_by)', [rows]);
    await logActivity({
      actorId: req.user.id, actionType: 'holiday_set', entityType: 'holiday', entityId: 0,
      description: `${actorOf(req)} đã đặt ngày nghỉ lễ: ${summary.map(x => `"${x.name}" ${x.from}${x.to !== x.from ? ` → ${x.to}` : ''}`).join('; ')}`,
      metadata: { items: summary },
    });
    holidaysChanged(req, summary[0].from);
    res.json({ success: true, data: { days: rows.length } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DELETE /worklog/holidays?from=&to= — CHỈ Admin
exports.removeHolidays = async (req, res) => {
  try {
    const { from } = req.query, to = req.query.to || from;
    if (!validRange(from, to)) return fail(res, 400, 'Khoảng ngày không hợp lệ');
    const [r] = await db.query('DELETE FROM company_holidays WHERE work_date BETWEEN ? AND ?', [from, to]);
    if (r.affectedRows) {
      await logActivity({
        actorId: req.user.id, actionType: 'holiday_removed', entityType: 'holiday', entityId: 0,
        description: `${actorOf(req)} đã xóa ngày nghỉ lễ: ${from}${to !== from ? ` → ${to}` : ''}`,
        metadata: { from, to },
      });
      holidaysChanged(req, from);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
