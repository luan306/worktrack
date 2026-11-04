// Sửa hạn chót CV bị lùi 7 tiếng (lỗi cũ: ô "Deadline (đổi)" hiện giờ UTC, rời ô là tự lưu lại).
// So hạn chót trong DB với hạn chót người tạo đã nhập (ghi trong nhật ký lúc tạo CV);
// chỉ nhận CV lệch SỚM HƠN đúng 7 / 14 / 21 / 28 tiếng — dấu hiệu của lỗi, không phải người dùng tự đổi.
//
//   docker compose exec backend node scripts/fix-deadline-shift.js           → chỉ liệt kê
//   docker compose exec backend node scripts/fix-deadline-shift.js --apply   → sửa + tính lại trễ / đúng hạn
//   docker compose restart backend                                            → xóa cache để giao diện hiện số mới
process.env.TZ = process.env.APP_TZ || 'Asia/Ho_Chi_Minh';
const db = require('../src/config/db');

const APPLY = process.argv.includes('--apply');
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toSql = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

(async () => {
  const [rows] = await db.query(
    `SELECT r.id, r.title, r.status, r.deadline, r.completed_at, r.is_late, a.description
       FROM request_tasks r
       JOIN activity_logs a ON a.entity_type='request' AND a.entity_id=r.id AND a.action_type='request_created'
      WHERE r.deadline IS NOT NULL AND a.description LIKE '%deadline %'`);
  const fixes = [];
  for (const r of rows) {
    const m = r.description.match(/deadline (\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
    if (!m) continue;
    const intended = new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
    const diffH = (intended - new Date(r.deadline)) / 3600000;
    if ([7, 14, 21, 28].includes(Math.round(diffH)) && Math.abs(diffH - Math.round(diffH)) < 1 / 60) {
      fixes.push({ ...r, intended, diffH: Math.round(diffH) });
    }
  }
  console.log(`Đã xét ${rows.length} CV có hạn chót. Bị lùi giờ do lỗi: ${fixes.length}`);
  for (const f of fixes) {
    const late = f.completed_at ? new Date(f.completed_at) > f.intended : null;
    console.log(`  #${f.id} "${String(f.title).slice(0, 40)}" [${f.status}] hạn ${fmt(new Date(f.deadline))} → ${fmt(f.intended)} (lùi ${f.diffH} tiếng)`
      + (late === null ? '' : ` | nộp ${fmt(new Date(f.completed_at))}: ${late ? 'TRỄ' : 'ĐÚNG HẠN'}${+f.is_late !== +late ? ' (đang ghi sai)' : ''}`));
  }
  if (!fixes.length) return;
  if (!APPLY) { console.log('\nChưa sửa gì. Chạy lại với --apply để sửa.'); return; }
  for (const f of fixes) {
    await db.query(
      `UPDATE request_tasks SET deadline=?,
              is_late = IF(status IN ('done','archived'), (completed_at IS NOT NULL AND completed_at > ?), is_late)
        WHERE id=? AND deadline=?`, [toSql(f.intended), toSql(f.intended), f.id, f.deadline]);
  }
  console.log(`\nĐã sửa ${fixes.length} CV. Chạy "docker compose restart backend" để giao diện cập nhật ngay.`);
})().catch(e => { console.error('Lỗi:', e.message); process.exitCode = 1; }).finally(() => db.end());
