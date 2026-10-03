// services/worklogService.js — truy vấn dùng chung của "Công việc hằng ngày"
const db = require('../config/db');

/**
 * Các ngày CHỜ CHẤM: đã ghi ít nhất 1 việc, chưa có điểm, không nghỉ cả ngày.
 * Dùng chung cho hộp "Chờ chấm" (API /worklog/pending) và cron nhắc leader buổi sáng.
 * @param {string} from  'YYYY-MM-DD' (gồm)
 * @param {string} to    'YYYY-MM-DD' (gồm)
 * @param {number[]|null} userIds  chỉ xét những người này (null = mọi người đang hoạt động)
 * @returns {Promise<{user_id:number, work_date:string, n:number}[]>} sắp ngày cũ → mới
 */
async function pendingScoreDays({ from, to, userIds = null }) {
  if (userIds && !userIds.length) return [];
  const [rows] = await db.query(
    `SELECT e.user_id, DATE_FORMAT(e.work_date,'%Y-%m-%d') AS work_date, COUNT(*) AS n
       FROM daily_entries e
       JOIN users u ON u.id=e.user_id AND u.is_active=1
       LEFT JOIN daily_day_scores s ON s.user_id=e.user_id AND s.work_date=e.work_date
       LEFT JOIN daily_day_offs  o ON o.user_id=e.user_id AND o.work_date=e.work_date AND o.kind='full'
      WHERE e.work_date BETWEEN ? AND ? AND s.id IS NULL AND o.id IS NULL
        ${userIds ? 'AND e.user_id IN (?)' : ''}
      GROUP BY e.user_id, e.work_date
      ORDER BY e.work_date, e.user_id`,
    userIds ? [from, to, userIds] : [from, to]);
  return rows.map(r => ({ ...r, n: Number(r.n) }));
}

module.exports = { pendingScoreDays };
