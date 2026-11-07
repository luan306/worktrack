// QUY TRÌNH (Quản trị → 🔀 Quy trình) — Admin xếp bước bằng giao diện, không phải sửa code.
// Quy trình 1: CHẤM CV HẰNG NGÀY
//   Nhân viên ghi việc → Bước 1 chấm điểm → (Bước 2 Manager duyệt — bật / tắt) → Xong
//   daily = {
//     first:   'any'    — Leader hoặc Manager, ai chấm trước cũng được (như trước đây)
//            | 'leader' — chỉ Leader của nhóm chấm; nhóm không có Leader → Manager chấm thay
//     review:  false | true   — thêm bước Manager duyệt (bật thì bước 1 luôn là Leader)
//     see:     'after' (Manager chỉ thấy nội dung sau khi Leader chấm) | 'always'
//     approve: false (Manager chỉ xem, sửa điểm khi cần) | true (Manager phải bấm "Duyệt")
//   }
// Chưa lưu lần nào → suy ra từ công tắc cũ "Manager chỉ thấy CV hằng ngày sau khi Leader chấm" (giữ đúng như đang chạy).
const db = require('./db');

let store = new Map(); // k → { v, by, at }
let ready = false;

async function load() {
  const [rows] = await db.query('SELECT k, v, updated_by, updated_at FROM workflow_config');
  store = new Map(rows.map(r => [r.k, { v: typeof r.v === 'string' ? JSON.parse(r.v) : r.v, by: r.updated_by, at: r.updated_at }]));
  ready = true;
}
async function init() {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS workflow_config (
        k VARCHAR(40) NOT NULL PRIMARY KEY, v JSON NOT NULL, updated_by INT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    // Bước "Manager duyệt" của CV hằng ngày: ai duyệt, lúc nào
    const [cols] = await db.query(
      "SELECT column_name AS c FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='daily_day_scores'");
    const has = new Set(cols.map(x => x.c || x.COLUMN_NAME));
    if (!has.has('reviewed_by')) {
      await db.query('ALTER TABLE daily_day_scores ADD COLUMN reviewed_by INT NULL, ADD COLUMN reviewed_at DATETIME NULL');
      console.log('[workflow] daily_day_scores: thêm cột người duyệt / lúc duyệt');
    }
    await load();
  } catch (e) { console.error('[workflow] lỗi khởi tạo (dùng như cũ):', e.message); }
}
setInterval(() => { if (ready) load().catch(() => {}); }, 60 * 1000).unref();

const legacyDaily = () => (require('./settings').on('daily.manager_after_leader')
  ? { first: 'leader', review: true, see: 'after', approve: false }
  : { first: 'any', review: false, see: 'always', approve: false });

// Chuẩn hóa: bước 2 bật thì bước 1 luôn là Leader
//   count: 'scored' (điểm vào Bảng điều khiển ngay khi chấm) | 'reviewed' (chỉ sau khi Manager duyệt — cần bật "phải bấm Duyệt")
//   count_since: thời điểm bắt đầu áp dụng 'reviewed' — điểm chấm TRƯỚC đó vẫn được tính (không ai mất điểm cũ)
function normalize(c) {
  const review = !!c.review, approve = review && !!c.approve;
  const count = approve && c.count === 'reviewed' ? 'reviewed' : 'scored';
  return {
    first: review ? 'leader' : (c.first === 'leader' ? 'leader' : 'any'),
    review,
    see: review && c.see === 'after' ? 'after' : 'always',
    approve,
    count,
    ...(count === 'reviewed' && c.count_since ? { count_since: c.count_since } : {}),
  };
}
const daily = () => normalize(store.get('daily')?.v || legacyDaily());
const dailyMeta = () => { const s = store.get('daily'); return { saved: !!s, updated_by: s?.by || null, updated_at: s?.at || null }; };

// Cờ dùng trong code CV hằng ngày
//  leaderFirst     : Manager không chấm TRƯỚC Leader cho người có Leader
//  hideUntilLeader : Manager chưa thấy nội dung ngày Leader chưa chấm
//  approve         : có bước Manager bấm Duyệt
//  countReviewed   : Bảng điều khiển chỉ tính điểm đã duyệt (chấm từ countSince trở đi)
function dailyFlags() {
  const c = daily();
  return { leaderFirst: c.first === 'leader', hideUntilLeader: c.review && c.see === 'after', approve: c.approve, review: c.review,
    countReviewed: c.count === 'reviewed', countSince: c.count_since || null };
}

const nowSql = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
async function save(k, v, actorId) {
  await db.query(`INSERT INTO workflow_config (k, v, updated_by) VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE v=VALUES(v), updated_by=VALUES(updated_by)`, [k, JSON.stringify(v), actorId]);
  await load();
}
async function setDaily(cfg, actorId) {
  if (cfg === null) { // trả về như cài đặt cũ (chưa lưu lần nào)
    await db.query("DELETE FROM workflow_config WHERE k='daily'");
    await load();
    return daily();
  }
  const before = daily();
  const v = normalize({ ...(cfg || {}), count_since: before.count === 'reviewed' ? before.count_since : nowSql() });
  await save('daily', v, actorId);
  return v;
}

// Mô tả bằng lời (nhật ký + giao diện)
function describeDaily(c) {
  const parts = [c.first === 'leader' ? 'Bước 1: Leader của nhóm chấm (nhóm không có Leader → Manager chấm)' : 'Bước 1: Leader hoặc Manager chấm'];
  if (c.review) parts.push(`Bước 2: Manager duyệt — ${c.see === 'after' ? 'chỉ thấy sau khi Leader chấm' : 'luôn thấy nội dung'}, ${c.approve ? 'phải bấm Duyệt' : 'chỉ xem / sửa điểm khi cần'}`);
  else parts.push('Không có bước duyệt');
  if (c.count === 'reviewed') parts.push('điểm tính sau khi duyệt');
  return parts.join(' · ');
}

// ─── Quy trình 2: CV YÊU CẦU ───────────────────────────────────────────
//   Người làm nộp → (Chấm sơ bộ) → (Manager duyệt cuối) → Hoàn thành
//   prelim: 'auto' (như trước: CV do Manager / Admin tạo thì bỏ qua) | 'always' | 'off' (nộp thẳng lên Manager)
//   final:  'manager' (Manager duyệt cuối) | 'off' (chấm sơ bộ xong là Hoàn thành)
//   Không cho tắt cả 2 bước (CV phải có người chấm điểm)
function normalizeReq(c) {
  const final = c.final === 'off' ? 'off' : 'manager';
  let prelim = ['auto', 'always', 'off'].includes(c.prelim) ? c.prelim : 'auto';
  if (final === 'off') prelim = 'always'; // không có Manager duyệt → luôn phải có người chấm sơ bộ
  return { prelim, final };
}
const req = () => normalizeReq(store.get('req')?.v || {});
const reqMeta = () => { const s = store.get('req'); return { saved: !!s, updated_by: s?.by || null, updated_at: s?.at || null }; };
async function setReq(cfg, actorId) {
  if (cfg === null) { await db.query("DELETE FROM workflow_config WHERE k='req'"); await load(); return req(); }
  const v = normalizeReq(cfg || {});
  await save('req', v, actorId);
  return v;
}
function describeReq(c) {
  const p = { auto: 'Leader / người tạo chấm sơ bộ (CV do Manager tạo thì bỏ qua)', always: 'Luôn có bước chấm sơ bộ', off: 'Không chấm sơ bộ — nộp thẳng Manager' }[c.prelim];
  return `${p} · ${c.final === 'manager' ? 'Manager duyệt cuối' : 'Chấm sơ bộ xong là Hoàn thành'}`;
}
/**
 * Trạng thái THẬT khi ai đó bấm nút (giao diện giữ nguyên nút cũ, máy chủ đi đúng quy trình):
 *  - nộp ('scoring'): bỏ chấm sơ bộ → 'reviewing'
 *  - nộp thẳng Manager ('reviewing' từ đang làm): luôn chấm sơ bộ / không có Manager duyệt → 'scoring'
 *  - chấm sơ bộ xong ('reviewing' từ 'scoring'): không có Manager duyệt → 'done'
 */
function reqNextStatus(from, to) {
  const c = req();
  if (to === 'scoring' && c.prelim === 'off') return 'reviewing';
  if (to === 'reviewing' && from === 'scoring' && c.final === 'off') return 'done';
  if (to === 'reviewing' && from !== 'scoring' && c.prelim === 'always') return 'scoring';
  return to;
}

// ─── Quy trình 3: DUYỆT THAY ĐỔI TÀI KHOẢN (Leader đổi vai trò / khóa–mở / chuyển nhóm) ───
//   when:      'cross_group' (như trước: chỉ khi sửa người NHÓM KHÁC) | 'always' (mọi lần) | 'never' (không cần duyệt)
//   approver:  'group_leader' (Leader nhóm của người đó — như trước) | 'manager' | 'leader_then_manager' (2 bước)
//   no_leader: 'block' (như trước: nhóm chưa có Leader → nhờ Manager làm) | 'manager' (chuyển Manager duyệt)
function normalizeAcct(c) {
  return {
    when: ['cross_group', 'always', 'never'].includes(c.when) ? c.when : 'cross_group',
    approver: ['group_leader', 'manager', 'leader_then_manager'].includes(c.approver) ? c.approver : 'group_leader',
    no_leader: c.no_leader === 'manager' ? 'manager' : 'block',
  };
}
const acct = () => normalizeAcct(store.get('acct')?.v || {});
const acctMeta = () => { const s = store.get('acct'); return { saved: !!s, updated_by: s?.by || null, updated_at: s?.at || null }; };
async function setAcct(cfg, actorId) {
  if (cfg === null) { await db.query("DELETE FROM workflow_config WHERE k='acct'"); await load(); return acct(); }
  const v = normalizeAcct(cfg || {});
  await save('acct', v, actorId);
  return v;
}
function describeAcct(c) {
  if (c.when === 'never') return 'Không cần duyệt — Leader đổi là áp dụng ngay';
  const w = c.when === 'always' ? 'Mọi lần Leader đổi vai trò / khóa / chuyển nhóm' : 'Leader sửa người NHÓM KHÁC';
  const a = { group_leader: 'Leader nhóm của người đó duyệt', manager: 'Manager duyệt', leader_then_manager: 'Leader nhóm đó duyệt → rồi Manager duyệt' }[c.approver];
  const n = c.approver === 'manager' ? '' : c.no_leader === 'manager' ? ' (nhóm chưa có Leader → Manager duyệt)' : ' (nhóm chưa có Leader → nhờ Manager làm)';
  return `${w} → ${a}${n}`;
}

module.exports = { init, daily, dailyMeta, dailyFlags, setDaily, describeDaily, normalize,
  req, reqMeta, setReq, describeReq, normalizeReq, reqNextStatus,
  acct, acctMeta, setAcct, describeAcct, normalizeAcct };
