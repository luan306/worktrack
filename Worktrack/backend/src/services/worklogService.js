// services/worklogService.js — truy vấn dùng chung của "Công việc hằng ngày"
const db = require('../config/db');
const cache = require('../config/cache');
const { isWeekend } = require('../utils/date');

/**
 * Ngày nghỉ lễ của công ty: Map 'YYYY-MM-DD' → tên ngày lễ. Bảng rất nhỏ (vài chục dòng / năm) và
 * được hỏi ở hầu hết API của "Công việc hằng ngày" → cache cả bảng, xóa cache khi Admin sửa.
 */
const holidayMap = () => cache.wrap('wl:holidays', 10 * 60 * 1000, async () => {
  const [rows] = await db.query(`SELECT DATE_FORMAT(work_date,'%Y-%m-%d') AS d, name FROM company_holidays ORDER BY work_date`);
  return new Map(rows.map(r => [r.d, r.name]));
});
const clearHolidayCache = () => cache.clear('wl:holidays');
// Ngày NGHỈ CHUNG = cuối tuần hoặc ngày lễ công ty
const isRestDay = (date, hol) => isWeekend(date) || hol.has(date);
// Các ngày lễ trong khoảng, dạng mảng cho frontend
const holidaysBetween = async (from, to) =>
  [...await holidayMap()].filter(([d]) => d >= from && d <= to).map(([work_date, name]) => ({ work_date, name }));

/**
 * Các ngày CHỜ CHẤM: đã ghi ít nhất 1 việc, chưa có điểm, không nghỉ cả ngày.
 * Dùng chung cho hộp "Chờ chấm" (API /worklog/pending) và cron nhắc leader buổi sáng.
 * @param {string} from  'YYYY-MM-DD' (gồm)
 * @param {string} to    'YYYY-MM-DD' (gồm)
 * @param {number[]|null} userIds  chỉ xét những người này (đã lọc người đang hoạt động; null = mọi người đang hoạt động)
 * @param {boolean} titles  kèm 2 tiêu đề việc đầu tiên của ngày
 * @returns {Promise<{user_id:number, work_date:string, n:number, titles?:string[]}[]>} sắp ngày cũ → mới
 */
const TITLE_SEP = '|~|';
async function pendingScoreDays({ from, to, userIds = null, titles = false }) {
  if (userIds && !userIds.length) return [];
  // Có sẵn userIds thì KHÔNG nối bảng users: nối vào làm MySQL đi từ users rồi quét cả lịch sử việc của từng người
  const [rows] = await db.query(
    `SELECT e.user_id, DATE_FORMAT(e.work_date,'%Y-%m-%d') AS work_date, COUNT(*) AS n
            ${titles ? `, SUBSTRING_INDEX(GROUP_CONCAT(e.title ORDER BY e.id SEPARATOR '${TITLE_SEP}'), '${TITLE_SEP}', 2) AS titles` : ''}
       FROM daily_entries e
       ${userIds ? '' : 'JOIN users u ON u.id=e.user_id AND u.is_active=1'}
       LEFT JOIN daily_day_scores s ON s.user_id=e.user_id AND s.work_date=e.work_date
       LEFT JOIN daily_day_offs  o ON o.user_id=e.user_id AND o.work_date=e.work_date AND o.kind='full'
      WHERE e.work_date BETWEEN ? AND ? AND s.id IS NULL AND o.id IS NULL
        ${userIds ? 'AND e.user_id IN (?)' : ''}
      GROUP BY e.user_id, e.work_date
      ORDER BY e.work_date, e.user_id`,
    userIds ? [from, to, userIds] : [from, to]);
  return rows.map(r => ({ ...r, n: Number(r.n), ...(titles ? { titles: r.titles ? r.titles.split(TITLE_SEP) : [] } : null) }));
}

/**
 * Trong `userIds`, những ai CÓ Leader (vai trò leader, đang hoạt động, khác chính họ) ở 1 nhóm đang hoạt động
 * — Leader là thành viên nhóm hoặc là leader_id của nhóm.
 */
async function membersWithLeader(userIds) {
  if (!userIds?.length) return new Set();
  const [rows] = await db.query(
    `SELECT DISTINCT gm.user_id FROM group_members gm
       JOIN \`groups\` g ON g.id=gm.group_id AND g.is_active=1
       JOIN users l ON l.role='leader' AND l.is_active=1 AND l.id<>gm.user_id
                   AND (l.id=g.leader_id OR l.id IN (SELECT x.user_id FROM group_members x WHERE x.group_id=gm.group_id))
      WHERE gm.user_id IN (?)`, [userIds]);
  return new Set(rows.map(r => r.user_id));
}
/**
 * Admin bật "Manager chỉ thấy CV hằng ngày sau khi Leader chấm": với người xem là Manager, trả về những người
 * mà ngày CHƯA CHẤM phải ẩn (người có Leader). Không phải Manager / chưa bật → tập rỗng.
 */
async function leaderGated(viewer, userIds) {
  if (viewer.role !== 'manager' || !require('../config/settings').on('daily.manager_after_leader')) return new Set();
  const s = await membersWithLeader(userIds.filter(id => +id !== viewer.id));
  return s;
}

module.exports = { leaderGated, membersWithLeader, pendingScoreDays, holidayMap, holidaysBetween, clearHolidayCache, isRestDay };
