const db      = require('../config/db');
const ExcelJS = require('exceljs');
const path    = require('path');
const fs      = require('fs');

const { localDate, parseLocalDate } = require('../utils/date');
const cache = require('../config/cache');
const { sendCachedJson } = require('../utils/cachedJson');
const { logActivity } = require('../services/activityLogService');

const UPLOADS_DIR = path.join(__dirname, '../uploads');

// CV được tính điểm = đã duyệt hoàn thành. Sau 6 ngày CV 'done' bị tự chuyển
// sang 'archived' (xem requests.controller.js) nhưng VẪN phải giữ điểm — trước
// đây chỉ lọc status='done' nên điểm YC biến mất khỏi Dashboard sau 6 ngày.
const SCORED = "rt.status IN ('done','archived')";

const EPOCH = '2000-01-01 00:00:00'; // dự phòng khi chưa có kỳ nào đang mở

// Kỳ đang mở + mốc bắt đầu dạng chuỗi 'YYYY-MM-DD HH:MM:SS' (lấy thẳng từ
// MySQL để không bị lệch múi giờ khi Node chuyển Date qua lại).
async function getOpenPeriod(q = db, forUpdate = false) {
  const [[period]] = await q.query(
    `SELECT *, DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') AS started_at_str
       FROM score_periods WHERE is_locked=0 ORDER BY id DESC LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`
  );
  return period;
}

// ⚠️ LEFT JOIN group_members (không phải JOIN): user chưa được xếp nhóm vẫn
// hiện khi xem "Tất cả"; khi có group_id thì gm.group_id=NULL tự bị loại.
// Admin/Manager là người chấm & duyệt, không phải người được chấm → không xếp hạng.
async function getMembers(groupId, q = db) {
  let sql = `SELECT DISTINCT u.id, u.full_name, u.username, u.avatar_color, u.role
               FROM users u
               LEFT JOIN group_members gm ON gm.user_id = u.id
              WHERE u.is_active = 1 AND u.role NOT IN ('admin','manager')`;
  const p = [];
  if (groupId) { sql += ' AND gm.group_id = ?'; p.push(groupId); }
  const [rows] = await q.query(sql, p);
  return rows;
}

// Toàn bộ số liệu điểm của nhiều nhân viên trong 2 câu SQL chạy song song:
// điểm trong khoảng xem (range) + cộng dồn từ đầu kỳ (period) + số CV.
// Tốc độ không phụ thuộc số nhân viên. Trả về hàm tra cứu theo user_id.
async function getMemberStats(q, memberIds, { rangeStart, rangeEnd, periodStart, groupId }) {
  // Cùng định dạng 'YYYY-MM-DD HH:MM:SS' nên so sánh chuỗi = so sánh thời gian
  const lower = rangeStart < periodStart ? rangeStart : periodStart;
  const periodDay = periodStart.slice(0, 10);

  // Điểm Daily = điểm Leader chấm CẢ NGÀY trong Công việc hằng ngày (daily_day_scores)
  //   + điểm Daily kiểu cũ (daily_task_logs) còn lại trong kỳ lúc đổi giao diện.
  // "CV hằng ngày" = số việc đã ghi trong Công việc hằng ngày + việc Daily cũ đã làm.
  const lowerDay = lower.slice(0, 10);
  let oldDaily = `
        SELECT dtl.user_id, dtl.log_date AS d, dtl.score, dtl.is_done AS n
          FROM daily_task_logs dtl
          JOIN daily_tasks dt        ON dt.id  = dtl.daily_task_id
          JOIN daily_task_groups dtg ON dtg.id = dt.task_group_id
         WHERE dtl.user_id IN (?) AND dtl.log_date >= ?`;
  const od = [memberIds, lowerDay];
  if (groupId) { oldDaily += ' AND dtg.group_id = ?'; od.push(groupId); }
  const dailySql = `
    SELECT x.user_id,
           SUM(CASE WHEN x.d BETWEEN ? AND ? THEN x.score ELSE 0 END) AS range_score,
           SUM(CASE WHEN x.d >= ?            THEN x.score ELSE 0 END) AS period_score,
           SUM(CASE WHEN x.d >= ?            THEN x.n     ELSE 0 END) AS cv_done
      FROM (${oldDaily}
        UNION ALL
        SELECT ds.user_id, ds.work_date, ds.score, 0 FROM daily_day_scores ds WHERE ds.user_id IN (?) AND ds.work_date >= ?
        UNION ALL
        SELECT de.user_id, de.work_date, 0, 1 FROM daily_entries de WHERE de.user_id IN (?) AND de.work_date >= ?
      ) x
     GROUP BY x.user_id`;
  const dp = [rangeStart.slice(0, 10), rangeEnd.slice(0, 10), periodDay, periodDay, ...od, memberIds, lowerDay, memberIds, lowerDay];

  let reqSql = `
    SELECT rta.user_id,
           SUM(CASE WHEN rt.completed_at BETWEEN ? AND ? AND rta.role = 'main'    THEN COALESCE(rta.score, rt.score) ELSE 0 END) AS range_main,
           SUM(CASE WHEN rt.completed_at BETWEEN ? AND ? AND rta.role = 'support' THEN COALESCE(rta.score, rt.score) ELSE 0 END) AS range_support,
           SUM(CASE WHEN rt.completed_at >= ? THEN COALESCE(rta.score, rt.score) ELSE 0 END) AS period_score,
           SUM(rt.completed_at >= ? AND rta.role = 'main')    AS cv_main,
           SUM(rt.completed_at >= ? AND rta.role = 'support') AS cv_support,
           SUM(rt.completed_at >= ? AND rt.is_late = 0)       AS cv_ontime,
           SUM(rt.completed_at >= ? AND rt.is_late = 1)       AS cv_late
      FROM request_tasks rt
      JOIN request_task_assignees rta ON rta.task_id = rt.id
     WHERE rta.user_id IN (?) AND ${SCORED} AND rt.completed_at >= ?`;
  const rp = [rangeStart, rangeEnd, rangeStart, rangeEnd,
              periodStart, periodStart, periodStart, periodStart, periodStart,
              memberIds, lower];
  if (groupId) { reqSql += ' AND rt.group_id = ?'; rp.push(groupId); }
  reqSql += ' GROUP BY rta.user_id';

  const [[dailyRows], [reqRows]] = await Promise.all([q.query(dailySql, dp), q.query(reqSql, rp)]);

  const stats = {};
  const get = (id) => (stats[id] ??= {
    daily_range: 0, daily_period: 0, cv_daily: 0,
    req_main_range: 0, req_support_range: 0, req_period: 0,
    cv_main: 0, cv_support: 0, cv_ontime: 0, cv_late: 0,
  });
  for (const r of dailyRows) {
    Object.assign(get(r.user_id), { daily_range: +r.range_score, daily_period: +r.period_score, cv_daily: +r.cv_done });
  }
  for (const r of reqRows) {
    Object.assign(get(r.user_id), {
      req_main_range: +r.range_main, req_support_range: +r.range_support, req_period: +r.period_score,
      cv_main: +r.cv_main, cv_support: +r.cv_support, cv_ontime: +r.cv_ontime, cv_late: +r.cv_late,
    });
  }
  return get;
}

// Khoảng ngày [start, end] theo view: day / week (T2→CN) / month
function getRange(view, today) {
  const d = parseLocalDate(today);
  if (view === 'day') return [today, today];
  if (view === 'week') {
    const dow = (d.getDay() + 6) % 7; // T2=0 … CN=6
    const s = new Date(d); s.setDate(d.getDate() - dow);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return [localDate(s), localDate(e)];
  }
  return [`${today.slice(0, 7)}-01`, localDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
}

// GET /dashboard/scores
exports.getScores = async (req, res) => {
  try {
    const { group_id, view = 'week', date } = req.query;
    const [start, end] = getRange(view, date || localDate());

    // Bảng điểm giống nhau với mọi người xem → cache 30s + gộp request trùng.
    // Bị xóa ngay khi có chấm điểm Daily / đổi trạng thái CV / chốt kỳ.
    const cKey = 'dash:scores:' + JSON.stringify([group_id || '', view, start, end]);
    await sendCachedJson(req, res, cKey, 30000, async () => {
    const [openPeriod, members] = await Promise.all([getOpenPeriod(), getMembers(group_id)]);
    const { started_at_str, ...period } = openPeriod || {};
    if (!members.length) return { period: openPeriod && period, start, end, view, scores: [] };

    const statsOf = await getMemberStats(db, members.map(m => m.id), {
      rangeStart: `${start} 00:00:00`, rangeEnd: `${end} 23:59:59`,
      periodStart: started_at_str || EPOCH, groupId: group_id,
    });

    const scores = members.map(u => {
      const s = statsOf(u.id);
      return {
        user: u,
        range_score: {
          daily:   s.daily_range,
          request: s.req_main_range,
          support: s.req_support_range,
          total:   +(s.daily_range + s.req_main_range + s.req_support_range).toFixed(1),
        },
        period_score: {
          daily:   s.daily_period,
          request: s.req_period,
          total:   +(s.daily_period + s.req_period).toFixed(1),
        },
        cv_counts: {
          daily: s.cv_daily, main: s.cv_main, support: s.cv_support, ontime: s.cv_ontime, late: s.cv_late,
        },
      };
    });
    scores.sort((a, b) => b.period_score.total - a.period_score.total);

    return { period: openPeriod && period, start, end, view, scores };
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Chốt kỳ, xuất Excel, reset — dùng chung cho nút bấm tay và cron tự động.
// Toàn bộ chạy trong 1 transaction; SELECT ... FOR UPDATE để 2 lần bấm chốt
// cùng lúc không tạo ra 2 kỳ mới / 2 file Excel.
async function performLockAndReset(group_id, lockedByUserId) {
  const conn = await db.getConnection();
  let excelFile = null;
  try {
    await conn.beginTransaction();

    const period = await getOpenPeriod(conn, true);
    if (!period) {
      const err = new Error('No active period');
      err.statusCode = 400;
      throw err;
    }

    const now = new Date();
    const members = await getMembers(group_id, conn);
    // Điểm tính trên toàn công ty (không lọc theo nhóm), giống bản gốc
    const statsOf = members.length
      ? await getMemberStats(conn, members.map(m => m.id), {
          rangeStart: period.started_at_str, rangeEnd: `${localDate(now)} 23:59:59`,
          periodStart: period.started_at_str,
        })
      : null;

    const ranked = members
      .map(u => {
        const s = statsOf(u.id);
        return { ...u, s, total: +(s.daily_period + s.req_period).toFixed(1) };
      })
      .sort((a, b) => b.total - a.total);

    // ── Excel ──
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Score Summary');
    ws.columns = [
      { header: 'Rank',          key: 'rank',    width: 6  },
      { header: 'Họ tên',        key: 'name',    width: 25 },
      { header: 'Username',      key: 'uname',   width: 15 },
      { header: 'Role',          key: 'role',    width: 10 },
      { header: 'Điểm HN',      key: 'daily',   width: 12 },
      { header: 'Điểm YC',      key: 'req',     width: 12 },
      { header: 'Tổng điểm',    key: 'total',   width: 12 },
      { header: 'CV hằng ngày', key: 'cvd',     width: 14 },
      { header: 'CV chính',     key: 'cvm',     width: 10 },
      { header: 'CV hỗ trợ',   key: 'cvs',     width: 10 },
      { header: 'Đúng hạn',    key: 'ontime',  width: 10 },
      { header: 'Quá hạn',     key: 'late',    width: 10 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2A3A' } };
    ranked.forEach(({ s, ...u }, i) => ws.addRow({
      rank: i + 1, name: u.full_name, uname: u.username, role: u.role,
      daily: s.daily_period, req: s.req_period, total: u.total,
      cvd: s.cv_daily, cvm: s.cv_main, cvs: s.cv_support, ontime: s.cv_ontime, late: s.cv_late,
    }));

    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    const filename = `worktrack_period_${period.id}_${localDate(now)}.xlsx`;
    excelFile = path.join(UPLOADS_DIR, filename);
    await wb.xlsx.writeFile(excelFile);

    // ── Snapshots — 1 câu INSERT nhiều dòng ──
    if (ranked.length) {
      await conn.query(
        `INSERT INTO score_snapshots
           (period_id,user_id,score_daily,score_request,score_support,score_total,
            cv_daily_count,cv_request_main,cv_request_support,cv_ontime,cv_late)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           score_daily=VALUES(score_daily), score_request=VALUES(score_request),
           score_support=VALUES(score_support), score_total=VALUES(score_total),
           cv_daily_count=VALUES(cv_daily_count), cv_request_main=VALUES(cv_request_main),
           cv_request_support=VALUES(cv_request_support), cv_ontime=VALUES(cv_ontime), cv_late=VALUES(cv_late)`,
        [ranked.map(({ id, s, total }) => [
          period.id, id, s.daily_period, s.req_period, 0, total,
          s.cv_daily, s.cv_main, s.cv_support, s.cv_ontime, s.cv_late,
        ])]
      );
    }

    // Lock kỳ cũ
    await conn.query(
      'UPDATE score_periods SET is_locked=1, locked_at=NOW(), locked_by=?, ended_at=NOW(), excel_path=? WHERE id=?',
      [lockedByUserId || null, filename, period.id]
    );

    // Reset: xóa daily_task_logs + điểm YC. Điểm YC của kỳ mới luôn tính từ
    // started_at của kỳ, nên CV kỳ cũ (kể cả archived) không bị cộng lại.
    const [delDaily] = await conn.query('DELETE FROM daily_task_logs');
    await conn.query(`UPDATE request_task_assignees rta JOIN request_tasks rt ON rt.id=rta.task_id
                         SET rta.score=NULL WHERE rt.status='done'`);
    const [resetReq] = await conn.query('UPDATE request_tasks SET score=NULL, scored_by=NULL, scored_at=NULL WHERE status="done"');

    // Tạo kỳ mới
    await conn.query(
      'INSERT INTO score_periods (name, started_at, is_locked) VALUES (?, NOW(), 0)',
      [`Period ${period.id + 1}`]
    );

    await conn.commit();
    cache.clear('req:'); cache.clear('dash:'); // điểm vừa bị reset → cache đã cũ

    // 📝 Lịch sử thay đổi — thao tác ảnh hưởng điểm của TẤT CẢ mọi người.
    // Lưu kèm điểm từng người lúc chốt để tra lại được sau khi đã reset.
    const [[actor]] = lockedByUserId
      ? await db.query('SELECT full_name FROM users WHERE id=?', [lockedByUserId]) : [[null]];
    await logActivity({
      actorId: lockedByUserId || null, actionType: 'score_period_locked', entityType: 'score_period', entityId: period.id,
      description: `${actor?.full_name || 'Hệ thống (tự động)'} đã chốt kỳ "${period.name}" `
        + `(${period.started_at_str.slice(0, 10)} → ${localDate(now)}): lưu điểm ${ranked.length} nhân viên vào file ${filename}, `
        + `rồi bắt đầu kỳ mới (điểm Daily & CV tính lại từ 0) — xóa ${delDaily.affectedRows} lượt chấm Daily kiểu cũ, xóa điểm ${resetReq.affectedRows} CV đã hoàn thành`,
      metadata: {
        filename, deleted_daily_logs: delDaily.affectedRows, reset_request_scores: resetReq.affectedRows,
        scores: ranked.map(({ id, full_name, s, total }) => ({ user_id: id, name: full_name, daily: s.daily_period, request: s.req_period, total })),
      },
    });
    return { filename, period_id: period.id, users_processed: members.length };
  } catch (e) {
    await conn.rollback();
    if (excelFile) fs.promises.unlink(excelFile).catch(() => {}); // không để lại file mồ côi
    throw e;
  } finally {
    conn.release();
  }
}

// POST /dashboard/lock — chốt kỳ, xuất Excel, reset (bấm tay)
exports.lockPeriod = async (req, res) => {
  try {
    const { group_id } = req.body;
    const result = await performLockAndReset(group_id, req.user?.id);
    res.json({ success: true, data: result });
  } catch (e) {
    // Bấm chốt 2 lần cùng lúc: lần sau bị MySQL chặn (dữ liệu vẫn đúng)
    if (e.code === 'ER_LOCK_DEADLOCK' || e.code === 'ER_LOCK_WAIT_TIMEOUT') {
      return res.status(409).json({ success: false, message: 'Kỳ đang được chốt, vui lòng tải lại trang' });
    }
    console.error(e);
    res.status(e.statusCode || 500).json({ success: false, message: e.message });
  }
};

// GET /dashboard/last-export — trả về file Excel của kỳ đã CHỐT gần nhất
exports.getLastExport = async (req, res) => {
  try {
    const [[period]] = await db.query(
      `SELECT id, name, excel_path, locked_at FROM score_periods
        WHERE is_locked=1 AND excel_path IS NOT NULL
        ORDER BY locked_at DESC LIMIT 1`
    );
    if (!period) {
      return res.status(404).json({ success: false, message: 'Chưa có kỳ nào được chốt để xuất Excel' });
    }
    const filepath = path.join(UPLOADS_DIR, period.excel_path);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, message: `File ${period.excel_path} không còn tồn tại trên server` });
    }
    res.json({ success: true, data: { filename: period.excel_path, period_id: period.id, locked_at: period.locked_at } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /dashboard/exports — danh sách TẤT CẢ các kỳ đã chốt
exports.getExportList = async (req, res) => {
  try {
    const [periods] = await db.query(
      `SELECT id, name, excel_path, locked_at, ended_at
         FROM score_periods
        WHERE is_locked=1 AND excel_path IS NOT NULL
        ORDER BY locked_at DESC`
    );
    const list = periods.filter(p => fs.existsSync(path.join(UPLOADS_DIR, p.excel_path)));
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /dashboard/excel/:filename
exports.downloadExcel = async (req, res) => {
  try {
    // ⚠️ Chặn path traversal: "..%2F.env" sẽ lộ JWT_SECRET, mật khẩu DB...
    const filename = path.basename(req.params.filename);
    if (filename !== req.params.filename || !filename.endsWith('.xlsx'))
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    const filepath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filepath))
      return res.status(404).json({ success: false, message: 'File not found' });
    res.download(filepath);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /dashboard/debug
exports.debug = async (req, res) => {
  try {
    const [[[period]], [members], [logs], [taskGroups]] = await Promise.all([
      db.query('SELECT * FROM score_periods WHERE is_locked=0 ORDER BY started_at DESC LIMIT 1'),
      db.query('SELECT id, full_name FROM users WHERE is_active=1 LIMIT 10'),
      db.query('SELECT dtl.user_id, dtl.score, dtl.log_date FROM daily_task_logs dtl LIMIT 10'),
      db.query('SELECT id, name, group_id FROM daily_task_groups LIMIT 10'),
    ]);
    res.json({ period, members, logs, taskGroups });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.performLockAndReset = performLockAndReset;