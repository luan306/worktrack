// src/controllers/dashboard.controller.js

const db      = require('../config/db');
const ExcelJS = require('exceljs');
const path    = require('path');
const fs      = require('fs');

// GET /dashboard/scores
exports.getScores = async (req, res) => {
  try {
    const { group_id, view = 'week', date } = req.query;
    const today = date || new Date().toISOString().slice(0, 10);

    let start, end;
    const d = new Date(today);
    if (view === 'day') {
      start = end = today;
    } else if (view === 'week') {
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const s = new Date(d); s.setDate(d.getDate() - dow);
      const e = new Date(s); e.setDate(s.getDate() + 6);
      start = s.toISOString().slice(0, 10);
      end   = e.toISOString().slice(0, 10);
    } else {
      start = `${today.slice(0, 7)}-01`;
      const e2 = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      end = e2.toISOString().slice(0, 10);
    }

    // Kỳ hiện tại
    const [[period]] = await db.query(
      'SELECT * FROM score_periods WHERE is_locked=0 ORDER BY started_at DESC LIMIT 1'
    );

    // Lấy members
    let memberSql = `SELECT DISTINCT u.id, u.full_name, u.username, u.avatar_color, u.role
                     FROM users u
                     JOIN group_members gm ON gm.user_id = u.id
                     WHERE u.is_active = 1`;
    const mp = [];
    if (group_id) { memberSql += ' AND gm.group_id = ?'; mp.push(group_id); }
    const [members] = await db.query(memberSql, mp);

    // Tính điểm từng member
    const scores = await Promise.all(members.map(async (u) => {

      // ── Điểm trong range (day/week/month) ──
      let dailySql = `SELECT COALESCE(SUM(dtl.score), 0) as total
                      FROM daily_task_logs dtl
                      JOIN daily_tasks dt      ON dt.id  = dtl.daily_task_id
                      JOIN daily_task_groups dtg ON dtg.id = dt.task_group_id
                      WHERE dtl.user_id = ? AND dtl.log_date BETWEEN ? AND ?`;
      const dp = [u.id, start, end];
      if (group_id) { dailySql += ' AND dtg.group_id = ?'; dp.push(group_id); }
      const [[dScore]] = await db.query(dailySql, dp);

      let reqSql = `SELECT COALESCE(SUM(rt.score), 0) as total
                    FROM request_tasks rt
                    JOIN request_task_assignees rta ON rta.task_id = rt.id
                    WHERE rta.user_id = ? AND rta.role = 'main'
                      AND rt.status = 'done'
                      AND rt.completed_at BETWEEN ? AND ?`;
      const rp = [u.id, `${start} 00:00:00`, `${end} 23:59:59`];
      if (group_id) { reqSql += ' AND rt.group_id = ?'; rp.push(group_id); }
      const [[rScore]] = await db.query(reqSql, rp);

      let supSql = reqSql.replace("rta.role = 'main'", "rta.role = 'support'");
      const [[sScore]] = await db.query(supSql, rp);

      // ── Điểm cộng dồn cả kỳ ──
      // Dùng '2000-01-01' để lấy toàn bộ — reset về 0 khi chốt kỳ
      const periodStart = '2000-01-01';

      let ptDailySql = `SELECT COALESCE(SUM(dtl.score), 0) as total
                        FROM daily_task_logs dtl
                        JOIN daily_tasks dt        ON dt.id  = dtl.daily_task_id
                        JOIN daily_task_groups dtg  ON dtg.id = dt.task_group_id
                        WHERE dtl.user_id = ? AND dtl.log_date >= ?`;
      const ptdp = [u.id, periodStart];
      if (group_id) { ptDailySql += ' AND dtg.group_id = ?'; ptdp.push(group_id); }
      const [[ptD]] = await db.query(ptDailySql, ptdp);

      let ptReqSql = `SELECT COALESCE(SUM(rt.score), 0) as total
                      FROM request_tasks rt
                      JOIN request_task_assignees rta ON rta.task_id = rt.id
                      WHERE rta.user_id = ? AND rt.status = 'done'
                        AND rt.completed_at >= ?`;
      const ptrp = [u.id, `${periodStart} 00:00:00`];
      if (group_id) { ptReqSql += ' AND rt.group_id = ?'; ptrp.push(group_id); }
      const [[ptR]] = await db.query(ptReqSql, ptrp);

      // ── CV counts ──
      const [[cvDaily]] = await db.query(
        `SELECT COUNT(*) as c FROM daily_task_logs
         WHERE user_id = ? AND is_done = 1 AND log_date >= ?`,
        [u.id, periodStart]
      );

      const [[cvMain]] = await db.query(
        `SELECT COUNT(*) as c
         FROM request_task_assignees rta
         JOIN request_tasks rt ON rt.id = rta.task_id
         WHERE rta.user_id = ? AND rta.role = 'main'
           AND rt.status = 'done' AND rt.completed_at >= ?`,
        [u.id, `${periodStart} 00:00:00`]
      );

      const [[cvSupport]] = await db.query(
        `SELECT COUNT(*) as c
         FROM request_task_assignees rta
         JOIN request_tasks rt ON rt.id = rta.task_id
         WHERE rta.user_id = ? AND rta.role = 'support'
           AND rt.status = 'done' AND rt.completed_at >= ?`,
        [u.id, `${periodStart} 00:00:00`]
      );

      const [[cvOntime]] = await db.query(
        `SELECT COUNT(*) as c
         FROM request_tasks rt
         JOIN request_task_assignees rta ON rta.task_id = rt.id
         WHERE rta.user_id = ? AND rt.status = 'done'
           AND rt.is_late = 0 AND rt.completed_at >= ?`,
        [u.id, `${periodStart} 00:00:00`]
      );

      const [[cvLate]] = await db.query(
        `SELECT COUNT(*) as c
         FROM request_tasks rt
         JOIN request_task_assignees rta ON rta.task_id = rt.id
         WHERE rta.user_id = ? AND rt.status = 'done'
           AND rt.is_late = 1 AND rt.completed_at >= ?`,
        [u.id, `${periodStart} 00:00:00`]
      );

      return {
        user: u,
        range_score: {
          daily:   +dScore.total,
          request: +rScore.total,
          support: +sScore.total,
          total:   +(+dScore.total + +rScore.total + +sScore.total).toFixed(1),
        },
        period_score: {
          daily:   +ptD.total,
          request: +ptR.total,
          total:   +(+ptD.total + +ptR.total).toFixed(1),
        },
        cv_counts: {
          daily:   cvDaily.c,
          main:    cvMain.c,
          support: cvSupport.c,
          ontime:  cvOntime.c,
          late:    cvLate.c,
        },
      };
    }));

    scores.sort((a, b) => b.period_score.total - a.period_score.total);

    res.json({ success: true, data: { period, start, end, view, scores } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /dashboard/lock — chốt kỳ, xuất Excel, reset
exports.lockPeriod = async (req, res) => {
  try {
    const { group_id } = req.body;
    const [[period]] = await db.query(
      'SELECT * FROM score_periods WHERE is_locked=0 ORDER BY id DESC LIMIT 1'
    );
    if (!period) return res.status(400).json({ success: false, message: 'No active period' });

    const today = new Date().toISOString().slice(0, 10);

    // Lấy members
    let memberSql = `SELECT DISTINCT u.id, u.full_name, u.username, u.role
                     FROM users u JOIN group_members gm ON gm.user_id = u.id
                     WHERE u.is_active = 1`;
    const mp = [];
    if (group_id) { memberSql += ' AND gm.group_id = ?'; mp.push(group_id); }
    const [members] = await db.query(memberSql, mp);

    // Build Excel
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

    const snapshots = [];
    const periodStart = '2000-01-01';

    // Sort by score desc
    const memberScores = await Promise.all(members.map(async u => {
      const [[dS]] = await db.query(
        `SELECT COALESCE(SUM(score),0) as t FROM daily_task_logs WHERE user_id=? AND log_date>=?`,
        [u.id, periodStart]
      );
      const [[rS]] = await db.query(
        `SELECT COALESCE(SUM(rt.score),0) as t FROM request_tasks rt
         JOIN request_task_assignees rta ON rta.task_id=rt.id
         WHERE rta.user_id=? AND rt.status='done' AND rt.completed_at>=?`,
        [u.id, `${periodStart} 00:00:00`]
      );
      return { ...u, dS: +dS.t, rS: +rS.t, total: +(+dS.t + +rS.t).toFixed(1) };
    }));
    memberScores.sort((a, b) => b.total - a.total);

    let rank = 1;
    for (const u of memberScores) {
      const [[cvD]]   = await db.query(`SELECT COUNT(*) as c FROM daily_task_logs WHERE user_id=? AND is_done=1`, [u.id]);
      const [[cvM]]   = await db.query(`SELECT COUNT(*) as c FROM request_task_assignees rta JOIN request_tasks rt ON rt.id=rta.task_id WHERE rta.user_id=? AND rta.role='main' AND rt.status='done'`, [u.id]);
      const [[cvSup]] = await db.query(`SELECT COUNT(*) as c FROM request_task_assignees rta JOIN request_tasks rt ON rt.id=rta.task_id WHERE rta.user_id=? AND rta.role='support' AND rt.status='done'`, [u.id]);
      const [[cvOT]]  = await db.query(`SELECT COUNT(*) as c FROM request_tasks rt JOIN request_task_assignees rta ON rta.task_id=rt.id WHERE rta.user_id=? AND rt.status='done' AND rt.is_late=0`, [u.id]);
      const [[cvL]]   = await db.query(`SELECT COUNT(*) as c FROM request_tasks rt JOIN request_task_assignees rta ON rta.task_id=rt.id WHERE rta.user_id=? AND rt.status='done' AND rt.is_late=1`, [u.id]);

      ws.addRow({
        rank, name: u.full_name, uname: u.username, role: u.role,
        daily: u.dS, req: u.rS, total: u.total,
        cvd: cvD.c, cvm: cvM.c, cvs: cvSup.c, ontime: cvOT.c, late: cvL.c,
      });

      snapshots.push({
        period_id: period.id, user_id: u.id,
        score_daily: u.dS, score_request: u.rS, score_support: 0, score_total: u.total,
        cv_daily_count: cvD.c, cv_request_main: cvM.c, cv_request_support: cvSup.c,
        cv_ontime: cvOT.c, cv_late: cvL.c,
      });
      rank++;
    }

    // Lưu Excel
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `worktrack_period_${period.id}_${today}.xlsx`;
    await wb.xlsx.writeFile(path.join(uploadsDir, filename));

    // Lưu snapshots + lock + tạo kỳ mới + xóa logs cũ
    const conn = await db.getConnection();
    await conn.beginTransaction();
    try {
      // Save snapshots
      for (const snap of snapshots) {
        await conn.query(
          `INSERT INTO score_snapshots
            (period_id,user_id,score_daily,score_request,score_support,score_total,
             cv_daily_count,cv_request_main,cv_request_support,cv_ontime,cv_late)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             score_daily=VALUES(score_daily), score_request=VALUES(score_request),
             score_total=VALUES(score_total)`,
          [snap.period_id,snap.user_id,snap.score_daily,snap.score_request,
           snap.score_support,snap.score_total,snap.cv_daily_count,snap.cv_request_main,
           snap.cv_request_support,snap.cv_ontime,snap.cv_late]
        );
      }

      // Lock kỳ cũ
      await conn.query(
        'UPDATE score_periods SET is_locked=1, locked_at=NOW(), locked_by=?, ended_at=NOW(), excel_path=? WHERE id=?',
        [req.user.id, filename, period.id]
      );

      // Reset: xóa daily_task_logs
      await conn.query('DELETE FROM daily_task_logs');

      // Reset: xóa request scores
      await conn.query('UPDATE request_tasks SET score=NULL, scored_by=NULL, scored_at=NULL WHERE status="done"');

      // Tạo kỳ mới
      await conn.query(
        'INSERT INTO score_periods (name, started_at, is_locked) VALUES (?, NOW(), 0)',
        [`Period ${period.id + 1}`]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally { conn.release(); }

    res.json({
      success: true,
      data: { filename, period_id: period.id, users_processed: members.length },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /dashboard/last-export — trả về file Excel của kỳ đã CHỐT gần nhất,
// không đụng gì tới việc chốt/reset điểm (khác hẳn POST /dashboard/lock).
// Dùng cho nút "Xuất Excel" ở topbar — chỉ tải lại báo cáo đã có sẵn.
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
    // Kiểm tra file vật lý còn tồn tại không (phòng trường hợp đã bị xóa thủ công)
    const filepath = path.join(__dirname, '../uploads', period.excel_path);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, message: `File ${period.excel_path} không còn tồn tại trên server` });
    }
    res.json({ success: true, data: { filename: period.excel_path, period_id: period.id, locked_at: period.locked_at } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /dashboard/excel/:filename
exports.downloadExcel = async (req, res) => {
  try {
    const filepath = path.join(__dirname, '../uploads', req.params.filename);
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
    const [[period]]   = await db.query('SELECT * FROM score_periods WHERE is_locked=0 ORDER BY started_at DESC LIMIT 1');
    const [members]    = await db.query('SELECT id, full_name FROM users WHERE is_active=1 LIMIT 10');
    const [logs]       = await db.query('SELECT dtl.user_id, dtl.score, dtl.log_date FROM daily_task_logs dtl LIMIT 10');
    const [taskGroups] = await db.query('SELECT id, name, group_id FROM daily_task_groups LIMIT 10');
    res.json({ period, members, logs, taskGroups });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
