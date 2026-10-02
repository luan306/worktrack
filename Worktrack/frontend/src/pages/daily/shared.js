

// Công việc hằng ngày — bảng màu, font và các hàm thuần dùng chung (không có JSX)

export const C = {
  ink: 'var(--wt-ink)', sub: 'var(--wt-text-2)', faint: 'var(--wt-text-3)', surface: 'var(--wt-surface)', canvas: 'var(--wt-canvas)',
  line: 'var(--wt-line)', lineSoft: 'var(--wt-surface-3)',
  primary: '#3654ff', primaryDeep: '#2440d6', primarySoft: 'var(--wt-tint-primary)',
  success: '#17b26a', successSoft: 'var(--wt-tint-success)', warning: '#f59e0b', warningSoft: 'var(--wt-tint-warning)',
  danger: '#e5384d', dangerSoft: 'var(--wt-tint-danger)', violet: '#8b5cf6', violetSoft: 'var(--wt-tint-violet)',
  note: 'var(--wt-surface-2)', noteLine: 'var(--wt-line)', board: 'var(--wt-surface-2)', teal: '#0d9488', tealSoft: 'var(--wt-tint-teal)',
};
export const FONT_SANS = "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";


/* ---------------- ngày tháng & nhãn ---------------- */
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
export const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
export const scoreColor = (v, max) => (v >= max * .8 ? C.success : v >= max * .5 ? C.warning : C.danger);
export const initialsOf = (name) => ((name || '?').trim().split(/\s+/).slice(-1)[0][0] || '?').toUpperCase();
export const OFF_KINDS = ['full', 'am', 'pm'];
export const idLine = (u) => [u?.username && `MSNV ${u.username}`, u?.group_names].filter(Boolean).join(' · ');
export const offLabel = (t, kind) => ({ full: t('wl_off_full', 'Nghỉ cả ngày'), am: t('wl_off_am', 'Nghỉ buổi sáng'), pm: t('wl_off_pm', 'Nghỉ buổi chiều') })[kind];
export const offShort = (t, kind) => ({ am: t('wl_off_am_s', 'buổi sáng'), pm: t('wl_off_pm_s', 'buổi chiều') })[kind];

// Tên thứ theo getDay() (0 = CN): short = "T2", full = "Thứ 2"
export const weekdayNames = (t) => ({
  short: [t('wl_sun', 'CN'), t('wl_mon', 'T2'), t('wl_tue', 'T3'), t('wl_wed', 'T4'), t('wl_thu', 'T5'), t('wl_fri', 'T6'), t('wl_sat', 'T7')],
  full: [t('wl_sun_full', 'Chủ nhật'), t('wl_mon_full', 'Thứ 2'), t('wl_tue_full', 'Thứ 3'), t('wl_wed_full', 'Thứ 4'), t('wl_thu_full', 'Thứ 5'), t('wl_fri_full', 'Thứ 6'), t('wl_sat_full', 'Thứ 7')],
});
export const wdOf = (d) => new Date(`${d}T00:00:00`).getDay();


/* ---------------- trạng thái 1 ngày (lịch cá nhân & bảng tổng hợp dùng chung) ---------------- */
export const mondayOf = (s) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d); };
export const monthRange = (s, delta = 0) => {
  const d = new Date(`${s}T00:00:00`); d.setDate(1); d.setMonth(d.getMonth() + delta);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return [ymd(d), ymd(last)];
};
// Mọi ngày trong khoảng (gồm T7/CN để thấy ai tăng ca)
export const daysBetween = (from, to) => {
  const out = [];
  if (!from || !to || from > to) return out;
  for (let d = from; d <= to && out.length < 190; d = addDays(d, 1)) out.push(d);
  return out;
};
export const isWeekendDate = (d) => [0, 6].includes(wdOf(d));
export const CELL = {
  future:  { bg: 'var(--wt-surface)', fg: C.faint, bd: C.line },
  weekend: { bg: 'var(--wt-surface-2)', fg: C.faint, bd: 'transparent' },
  overtime:{ bg: 'var(--wt-tint-violet)', fg: C.violet, bd: `${C.violet}55` },
  missing: { bg: 'var(--wt-tint-danger)', fg: C.danger, bd: 'var(--wt-tint-danger-bd)' },
  pending: { bg: 'var(--wt-tint-warning)', fg: 'var(--wt-warn-text)', bd: 'var(--wt-tint-warning-bd)' },
  off:     { bg: C.tealSoft, fg: C.teal, bd: 'var(--wt-tint-teal-bd)' },
};
// Thứ tự ưu tiên trạng thái 1 ngày — dùng chung cho lịch cá nhân & bảng tổng hợp.
// T7/CN mặc định là ngày NGHỈ (không tính "chưa ghi"); có ghi việc = TĂNG CA (chờ chấm).
export const cellState = (c, date, today) => {
  if (c?.off === 'full') return 'off';
  if (c?.score != null) return 'scored';
  if (isWeekendDate(date)) return c?.n ? 'overtime' : 'weekend';
  if (date > today) return 'future';
  return c?.n ? 'pending' : 'missing';
};

/* ---------------- kiểu ô nhập dùng chung ---------------- */
export const inputStyle = {
  width: '100%', padding: '9px 11px', borderRadius: 9, border: `1.5px solid ${C.line}`, outline: 'none',
  fontSize: 13, fontFamily: FONT_SANS, color: C.ink, background: 'var(--wt-surface)', boxSizing: 'border-box',
};
