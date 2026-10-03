// src/cron/worklogReminder.cron.js
//
// Nhắc việc "Công việc hằng ngày" — 08:00 mỗi sáng T2–T6 (giờ VN):
//   1) Leader: các ngày ĐÃ GHI VIỆC nhưng CHƯA CHẤM của người cùng nhóm
//      (30 ngày gần nhất, bỏ ngày nghỉ cả ngày) → 1 thông báo GỘP cho mỗi leader.
//   2) Nhân viên / Leader: CHƯA GHI VIỆC ngày làm việc trước đó (không nghỉ cả ngày)
//      → nhắc ghi bù.
//   3) Manager: CHỈ nhắc các CV yêu cầu đang "Chờ Manager duyệt" (status='reviewing')
//      → 1 thông báo gộp, bấm vào mở Board.
// Mỗi loại nhắc tối đa 1 lần / người / ngày (chạy lại hay khởi động lại server không gửi trùng).

const cron = require('node-cron');
const db   = require('../config/db');
const { notify, notifyMany } = require('../services/notificationService');
const { pendingScoreDays } = require('../services/worklogService');
const { localDate, parseLocalDate, addDays } = require('../utils/date');

const LOOKBACK_DAYS = 30;
const TOP_PEOPLE = 5; // số người liệt kê trong 1 thông báo gộp

const isWeekend = (d) => [0, 6].includes(parseLocalDate(d).getDay());
const prevWorkday = (d) => { let x = addDays(d, -1); while (isWeekend(x)) x = addDays(x, -1); return x; };

// Những ai đã nhận loại nhắc này hôm nay (chống gửi trùng)
async function alreadyReminded(type) {
  const [rows] = await db.query('SELECT DISTINCT user_id FROM notifications WHERE type=? AND created_at >= CURDATE()', [type]);
  return new Set(rows.map(r => r.user_id));
}

// 1) Leader: ngày chờ chấm của người cùng nhóm
async function remindUnscored(io, today) {
  const days = await pendingScoreDays({ from: addDays(today, -LOOKBACK_DAYS), to: addDays(today, -1) });
  if (!days.length) return 0;
  // gộp theo người: số ngày chờ chấm + ngày sớm nhất (danh sách đã sắp ngày cũ → mới)
  const perUser = new Map();
  for (const d of days) {
    if (!perUser.has(d.user_id)) perUser.set(d.user_id, { user_id: d.user_id, days: 0, first: d.work_date });
    perUser.get(d.user_id).days++;
  }
  const ids = [...perUser.keys()];
  const [names] = await db.query('SELECT id, full_name FROM users WHERE id IN (?)', [ids]);
  names.forEach(u => { perUser.get(u.id).full_name = u.full_name; });
  const pending = [...perUser.values()];

  const [links] = await db.query(
    `SELECT DISTINCT m.user_id AS member_id, l.id AS leader_id
       FROM group_members m
       JOIN group_members gl ON gl.group_id=m.group_id AND gl.user_id<>m.user_id
       JOIN users l ON l.id=gl.user_id AND l.role='leader' AND l.is_active=1
      WHERE m.user_id IN (?)`, [ids]);

  // người nhận → danh sách người còn ngày chờ chấm
  const byRecipient = new Map();
  for (const p of pending) {
    for (const rid of links.filter(l => l.member_id === p.user_id).map(l => l.leader_id)) {
      if (!byRecipient.has(rid)) byRecipient.set(rid, []);
      byRecipient.get(rid).push(p);
    }
  }

  const done = await alreadyReminded('worklog_unscored_reminder');
  let sent = 0;
  for (const [rid, list] of byRecipient) {
    if (done.has(rid)) continue;
    list.sort((a, b) => b.days - a.days);
    await notify(io, {
      userId: rid, actorId: null, type: 'worklog_unscored_reminder', entityType: 'worklog_team', entityId: 0,
      payload: {
        total: list.reduce((s, x) => s + Number(x.days), 0),
        people: list.slice(0, TOP_PEOPLE).map(x => ({ name: x.full_name, days: Number(x.days) })),
        more: Math.max(0, list.length - TOP_PEOPLE),
        from: list.reduce((m, x) => (x.first < m ? x.first : m), today), to: addDays(today, -1),
      },
    });
    sent++;
  }
  return sent;
}

// 2) Nhân viên / Leader: chưa ghi việc ngày làm việc trước đó
async function remindMissing(io, today) {
  const day = prevWorkday(today);
  const [rows] = await db.query(
    `SELECT u.id FROM users u
      WHERE u.is_active=1 AND u.role IN ('user','leader') AND DATE(u.created_at) <= ?
        AND NOT EXISTS (SELECT 1 FROM daily_entries  e WHERE e.user_id=u.id AND e.work_date=?)
        AND NOT EXISTS (SELECT 1 FROM daily_day_offs o WHERE o.user_id=u.id AND o.work_date=? AND o.kind='full')`,
    [day, day, day]);
  const done = await alreadyReminded('worklog_missing_reminder');
  const ids = rows.map(r => r.id).filter(id => !done.has(id));
  if (ids.length) {
    await notifyMany(io, ids, { actorId: null, type: 'worklog_missing_reminder', entityType: 'worklog_self', entityId: 0, payload: { workDate: day } });
  }
  return ids.length;
}

// 3) Manager: CV yêu cầu đang chờ Manager duyệt lần cuối
async function remindReviewing(io) {
  const [rows] = await db.query(
    `SELECT id, title, DATE_FORMAT(COALESCE(completed_at, updated_at),'%Y-%m-%d') AS since
       FROM request_tasks WHERE status='reviewing' ORDER BY COALESCE(completed_at, updated_at)`);
  if (!rows.length) return 0;
  const [managers] = await db.query("SELECT id FROM users WHERE role='manager' AND is_active=1");
  const done = await alreadyReminded('request_review_reminder');
  const ids = managers.map(m => m.id).filter(id => !done.has(id));
  if (ids.length) {
    await notifyMany(io, ids, {
      actorId: null, type: 'request_review_reminder', entityType: 'request_review', entityId: 0,
      payload: { total: rows.length, titles: rows.slice(0, 3).map(r => r.title), more: Math.max(0, rows.length - 3), oldest: rows[0].since },
    });
  }
  return ids.length;
}

async function runReminders(io) {
  const today = localDate();
  if (isWeekend(today)) return;
  try {
    const [leaders, staff, managers] = await Promise.all([remindUnscored(io, today), remindMissing(io, today), remindReviewing(io)]);
    if (leaders || staff || managers) console.log(`[reminder] Nhắc chấm điểm: ${leaders} leader · nhắc ghi việc: ${staff} người · nhắc duyệt CV: ${managers} manager`);
  } catch (e) {
    console.error('[reminder] lỗi:', e.message);
  }
}

module.exports = function startWorklogReminders(io) {
  cron.schedule('0 8 * * 1-5', () => runReminders(io), { timezone: 'Asia/Ho_Chi_Minh' });
};
module.exports.runReminders = runReminders;
