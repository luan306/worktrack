import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { clearApiCache } from '../../api/client';
import useAuth from '../../store/authStore';
import { getSocket } from '../../lib/socket';

/* ============================================================
   DESIGN TOKENS
   "Control-panel" system: deep signal-blue for primary actions,
   hazard-stripe accent for anything urgent/overdue, monospace
   digital-readout type for countdowns/scores/page numbers.
   ============================================================ */
const C = {
  ink:        '#0f1729',
  sub:        '#6b7280',
  faint:      '#9aa3b2',
  surface:    '#ffffff',
  canvas:     '#eef1f8',
  line:       '#e6e9f2',
  lineSoft:   '#f0f2f8',

  primary:      '#3654ff',
  primaryDeep:  '#2440d6',
  primarySoft:  '#eaefff',

  success:     '#17b26a',
  successSoft: '#e8f9f0',
  warning:     '#f59e0b',
  warningSoft: '#fef3e2',
  danger:      '#e5384d',
  dangerSoft:  '#fdeaec',
  violet:      '#8b5cf6',
  violetSoft:  '#f2ecfe',
};

const FONT_SANS = "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

const PRI_COLOR = { high: C.danger, medium: C.warning, low: C.success };

// Số thẻ mỗi trang cho mỗi cột (chế độ thu gọn) — chỉnh ở đây nếu muốn nhiều/ít hơn
const PAGE_SIZE = 6;
const totalPagesOf = (arr) => Math.max(1, Math.ceil((arr?.length || 0) / PAGE_SIZE));
const pageSliceOf  = (arr, page) => (arr || []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

const NEW_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const NEAR_DEADLINE_MS = 24 * 60 * 60 * 1000;

const isTaskNew = (task) => {
  if (!task.created_at) return false;
  return (Date.now() - new Date(task.created_at).getTime()) < NEW_THRESHOLD_MS;
};
const isNearDeadline = (task) => {
  if (!task.deadline || task.status === 'done') return false;
  const diff = new Date(task.deadline) - new Date();
  return diff > 0 && diff <= NEAR_DEADLINE_MS;
};
const isOverdue = (task) => task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';
const isUnassigned = (task) => !(task.assignees && task.assignees.length);
// Chưa có field assigned_at riêng trong API — dùng assigned_at nếu backend có trả,
// nếu không thì fallback về updated_at/created_at để ước lượng "vừa mới giao".
const isRecentlyAssigned = (task) => {
  const raw = task.assigned_at || task.updated_at || task.created_at;
  if (!raw) return false;
  return (Date.now() - new Date(raw).getTime()) < NEW_THRESHOLD_MS;
};
const isMine = (task, myId) => !!myId && !!task.assignees?.some(a => String(a.user_id) === String(myId));

/* ---------------- shared atoms ---------------- */

const Chip = ({ color = C.primary, name = '?', size = 22, ring = false }) => {
  const ini = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}, ${color}cc)`,
      width: size, height: size, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.42, fontWeight: 700, flexShrink: 0,
      fontFamily: FONT_SANS, letterSpacing: 0.2,
      boxShadow: ring ? `0 0 0 2px #fff, 0 0 0 3.5px ${color}55` : '0 1px 2px rgba(15,23,41,.15)',
    }}>{ini}</div>
  );
};

const MetaRow = ({ icon, label, value, vc = C.ink }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.faint, fontFamily: FONT_SANS, minWidth: 0 }}>
    <span style={{ width: 14, textAlign: 'center', opacity: .8, flexShrink: 0 }}>{icon}</span>
    <span style={{ flexShrink: 0 }}>{label}</span>
    <span style={{ color: vc, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{value}</span>
  </div>
);

const Badge = ({ text, bg, color, pulse }) => (
  <span style={{
    fontSize: 9.5, fontWeight: 800, color, background: bg,
    padding: '3px 8px 3px 7px', borderRadius: 20, whiteSpace: 'nowrap',
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontFamily: FONT_SANS, letterSpacing: 0.2, maxWidth: '100%',
  }}>
    {pulse && <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, animation: 'brdPulse 1.4s ease-in-out infinite', flexShrink: 0 }} />}
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
  </span>
);

const SkeletonCard = () => (
  <div style={{ height: 118, borderRadius: 14, background: C.surface, border: `1px solid ${C.line}`, overflow: 'hidden', position: 'relative' }}>
    <div className="brd-shimmer" />
  </div>
);
const SkeletonList = ({ n = 4 }) => <>{Array.from({ length: n }).map((_, i) => <SkeletonCard key={i} />)}</>;

const Empty = ({ text, icon = '📭' }) => (
  <div style={{ textAlign: 'center', padding: '36px 16px', color: C.faint, fontSize: 12.5, fontFamily: FONT_SANS, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, gridColumn: '1 / -1' }}>
    <span style={{ fontSize: 26, opacity: .55 }}>{icon}</span>
    {text}
  </div>
);

// Nút mở rộng cột — thay cho phân trang chật chội khi có nhiều mục
const ExpandBtn = ({ onClick, color }) => (
  <button onClick={onClick} title="Mở rộng — xem tất cả" className="brd-expand-btn" style={{
    width: 28, height: 28, borderRadius: 8, border: 'none', background: color,
    color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    boxShadow: `0 2px 8px ${color}66`,
  }}>⛶</button>
);

/* ---------------- pagination (chế độ thu gọn) ---------------- */

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const btn = (active, disabled) => ({
    minWidth: 26, height: 26, padding: '0 7px', borderRadius: 8,
    border: active ? 'none' : `1.5px solid ${C.line}`,
    background: active ? `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})` : '#fff',
    color: active ? '#fff' : disabled ? C.faint : C.sub,
    fontSize: 11, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    fontFamily: FONT_MONO, boxShadow: active ? `0 3px 8px ${C.primary}55` : 'none',
  });
  let start = Math.max(1, page - 1), end = Math.min(totalPages, start + 2);
  start = Math.max(1, end - 2);
  const nums = []; for (let p = start; p <= end; p++) nums.push(p);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, padding: '9px 10px', borderTop: `1px solid ${C.lineSoft}`, background: C.surface, flexShrink: 0, flexWrap: 'wrap' }}>
      <button disabled={page === 1} onClick={() => onChange(page - 1)} style={btn(false, page === 1)}>‹</button>
      {start > 1 && <>
        <button onClick={() => onChange(1)} style={btn(false, false)}>1</button>
        {start > 2 && <span style={{ color: C.faint, fontSize: 11 }}>···</span>}
      </>}
      {nums.map(p => <button key={p} onClick={() => onChange(p)} style={btn(p === page, false)}>{p}</button>)}
      {end < totalPages && <>
        {end < totalPages - 1 && <span style={{ color: C.faint, fontSize: 11 }}>···</span>}
        <button onClick={() => onChange(totalPages)} style={btn(false, false)}>{totalPages}</button>
      </>}
      <button disabled={page === totalPages} onClick={() => onChange(page + 1)} style={btn(false, page === totalPages)}>›</button>
    </div>
  );
}

/* ---------------- countdown (digital readout) ---------------- */

function Countdown({ deadline, status }) {
  const { t } = useTranslation();
  const [diff, setDiff] = useState(new Date(deadline) - new Date());
  useEffect(() => {
    const timer = setInterval(() => setDiff(new Date(deadline) - new Date()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  if (status === 'done') return null;
  if (diff <= 0) return (
    <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: C.danger, padding: '3px 8px', borderRadius: 7, fontFamily: FONT_MONO, letterSpacing: .3, display: 'inline-flex', alignItems: 'center', gap: 5, animation: 'brdPulse 1.4s ease-in-out infinite' }}>⚠ {t('late')}</span>
  );
  const d = Math.floor(diff / 86400000), h = Math.floor(diff % 86400000 / 3600000), m = Math.floor(diff % 3600000 / 60000), s = Math.floor(diff % 60000 / 1000);
  const urgent = diff < 3600000, near = diff < 86400000;
  const color = urgent ? C.danger : near ? C.warning : C.success;
  const bg    = urgent ? C.dangerSoft : near ? C.warningSoft : C.successSoft;
  const label = d > 0 ? t('countdown_days_hours', { d, h }) : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color, background: bg, padding: '3px 8px', borderRadius: 7, fontFamily: FONT_MONO, letterSpacing: .3, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {urgent && <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, animation: 'brdPulse 1s ease-in-out infinite' }} />}
      ⏱ {label}
    </span>
  );
}

/* ---------------- cards ---------------- */

function DailyCard({ group, onClick }) {
  const { t } = useTranslation();
  const tasks = group.tasks || [];
  const total = tasks.reduce((s, tk) => s + parseFloat(tk.today_score || 0), 0);
  const max = tasks.reduce((s, tk) => s + (+tk.max_score || 0), 0);
  const pct = max > 0 ? Math.min(100, (total / max) * 100) : 0;
  const sc = total === 0 ? C.faint : total >= max * 0.8 ? C.success : C.warning;
  return (
    <div onClick={onClick} className="brd-card" style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: C.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{group.icon || '🏭'}</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0, fontFamily: FONT_SANS, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</div>
        <span style={{ fontSize: 12, fontWeight: 700, color: sc, fontFamily: FONT_MONO, flexShrink: 0, whiteSpace: 'nowrap' }}>{total.toFixed(1)}<span style={{ color: C.faint, fontWeight: 500 }}>/{max}đ</span></span>
      </div>
      <div style={{ margin: '0 14px', height: 5, borderRadius: 4, background: C.lineSoft, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: `linear-gradient(90deg, ${sc}, ${sc}cc)`, transition: 'width .4s ease' }} />
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tasks.slice(0, 4).map(tk => (
          <div key={tk.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, background: C.canvas }}>
            <div style={{ width: 15, height: 15, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, border: `2px solid ${tk.today_done ? C.success : '#c7d0e0'}`, background: tk.today_done ? C.success : 'transparent', color: '#fff' }}>{tk.today_done ? '✓' : ''}</div>
            <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: tk.today_done ? C.faint : C.ink, textDecoration: tk.today_done ? 'line-through' : 'none', fontFamily: FONT_SANS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tk.name}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: tk.today_score > 0 ? C.primary : C.faint, fontFamily: FONT_MONO, flexShrink: 0, whiteSpace: 'nowrap' }}>{tk.today_score || 0}đ</span>
          </div>
        ))}
        {tasks.length > 4 && <div style={{ fontSize: 10.5, color: C.faint, textAlign: 'center', fontFamily: FONT_SANS }}>{t('board_more_tasks', { count: tasks.length - 4 })}</div>}
        {!tasks.length && <div style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', padding: 4, fontFamily: FONT_SANS }}>{t('board_no_tasks_today')}</div>}
      </div>
      <div style={{ padding: '9px 14px', borderTop: `1px solid ${C.lineSoft}`, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex' }}>
          {(group.members || []).slice(0, 4).map((m, i) => (
            <div key={m.id || i} style={{ marginLeft: i === 0 ? 0 : -6 }}><Chip color={m.avatar_color || C.primary} name={m.full_name || '?'} size={21} ring /></div>
          ))}
          {(group.members || []).length > 4 && (
            <div style={{ marginLeft: -6, width: 21, height: 21, borderRadius: '50%', background: '#e5e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, fontWeight: 700, color: C.sub, boxShadow: '0 0 0 2px #fff' }}>+{(group.members || []).length - 4}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestCard({ task, onNav, myId }) {
  const { t } = useTranslation();
  const priKey = task.priority === 'high' ? 'high' : task.priority === 'low' ? 'low' : 'medium';
  const priColor = PRI_COLOR[priKey];
  const assignee = task.assignees?.[0];
  const overdue = isOverdue(task);
  const near = isNearDeadline(task);
  const fresh = isTaskNew(task);
  const unassigned = isUnassigned(task);
  const mine = isMine(task, myId);
  const mineNew = mine && isRecentlyAssigned(task);
  const fmt = d => d ? new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const accentColor = overdue ? C.danger : near ? C.warning : priColor;
  const tint = overdue ? C.dangerSoft : near ? C.warningSoft : C.surface;

  return (
    <div onClick={onNav} className="brd-card" style={{
      background: tint, borderRadius: 14,
      border: `1px solid ${mine ? C.primary : C.line}`,
      borderLeft: `5px solid ${accentColor}`,
      overflow: 'hidden', cursor: 'pointer', position: 'relative',
      boxShadow: mine ? `0 0 0 3px ${C.primary}1f` : undefined,
    }}>
      <div style={{ padding: '11px 12px 8px 14px', display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: priColor, flexShrink: 0, marginTop: 5 }} />
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, flex: 1, minWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT_SANS }}>{task.title}</div>
        {mine ? (
          <span style={{
            fontSize: 9.5, fontWeight: 800, color: '#fff', flexShrink: 0,
            background: mineNew ? `linear-gradient(135deg, ${C.danger}, #ff6b7a)` : `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`,
            padding: '3px 8px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
            boxShadow: mineNew ? `0 2px 8px ${C.danger}66` : `0 2px 6px ${C.primary}66`,
          }}>
            {mineNew && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', animation: 'brdPulse 1.1s ease-in-out infinite', flexShrink: 0 }} />}
            {mineNew ? `🔔 ${t('board_tag_newly_assigned_to_me', 'Mới giao cho bạn')}` : `👷 ${t('board_tag_assigned_to_me', 'Của bạn')}`}
          </span>
        ) : (
          <span style={{ fontSize: 10, fontWeight: 700, color: priColor, whiteSpace: 'nowrap', fontFamily: FONT_SANS, flexShrink: 0 }}>{t(priKey)}</span>
        )}
      </div>
      <div style={{ padding: '2px 12px 0 14px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {overdue && <Badge text={t('board_tag_overdue', 'Trễ hạn')} bg={C.danger} color="#fff" pulse />}
        {!overdue && near && <Badge text={t('board_tag_near_deadline', 'Sắp hết hạn')} bg={C.warningSoft} color={C.warning} />}
        {fresh && <Badge text={`🆕 ${t('board_tag_new', 'Mới')}`} bg={C.primarySoft} color={C.primary} />}
        {unassigned && <Badge text={`👷 ${t('board_tag_unassigned', 'Chưa nhận')}`} bg={C.violetSoft} color={C.violet} />}
        {!unassigned && !mine && <Badge text={`✅ ${t('board_tag_assigned', 'Đã giao')}`} bg={C.successSoft} color={C.success} />}
      </div>
      <div style={{ padding: '10px 12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <MetaRow icon="👤" label={t('label_assigned_by')} value={task.creator_name} />
        <MetaRow icon="👷" label={t('label_assignee')} value={assignee ? assignee.full_name : t('board_not_assigned')} vc={assignee ? C.ink : C.faint} />
        {task.deadline && <MetaRow icon="⏰" label={t('label_deadline')} value={fmt(task.deadline)} vc={overdue ? C.danger : C.ink} />}
        {task.deadline && <Countdown deadline={task.deadline} status={task.status} />}
      </div>
    </div>
  );
}

function CompletedCard({ task, onNav }) {
  const { t } = useTranslation();
  const fmt = d => d ? new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <div onClick={onNav} className="brd-card" style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.line}`, overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: C.successSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, color: C.success }}>✓</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0, fontFamily: FONT_SANS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
        <span style={{ fontSize: 9.5, fontWeight: 800, padding: '3px 9px', borderRadius: 20, background: task.is_late ? C.dangerSoft : C.successSoft, color: task.is_late ? C.danger : C.success, fontFamily: FONT_SANS, flexShrink: 0, whiteSpace: 'nowrap' }}>{task.is_late ? t('late') : t('on_time')}</span>
      </div>
      <div style={{ padding: '0 14px 11px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <MetaRow icon="👤" label={t('label_assigned_by')} value={task.creator_name} />
        {task.completed_at && <MetaRow icon="✅" label={t('label_completed_at')} value={fmt(task.completed_at)} vc={C.success} />}
        {task.score != null && <MetaRow icon="⭐" label={t('label_score')} value={`${task.score}đ`} vc={C.primary} />}
      </div>
    </div>
  );
}

/* ---------------- generic expand modal (dùng chung cho cả 3 cột) ---------------- */

function ExpandModal({ open, onClose, icon, iconBg, iconColor, title, count, filterBar, children }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onEsc = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onEsc); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={onClose} className="brd-backdrop" style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,41,.5)', backdropFilter: 'blur(3px)' }} />
      <div className="brd-modal" style={{
        position: 'relative', width: 'min(1080px, 100%)', maxHeight: 'min(84vh, 900px)', background: C.canvas,
        borderRadius: 20, boxShadow: '0 30px 70px rgba(15,23,41,.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', background: C.surface, borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, fontFamily: FONT_SANS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
              <div style={{ fontSize: 11, color: C.faint, fontFamily: FONT_MONO }}>{count} mục</div>
            </div>
            <button onClick={onClose} aria-label="close" style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.line}`, background: '#fff', color: C.sub, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
          </div>
          {filterBar && <div style={{ marginTop: 12 }}>{filterBar}</div>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          <div className="brd-modal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 10 }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

const ModalSearch = ({ value, onChange, placeholder }) => (
  <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
    width: '100%', padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${C.line}`, outline: 'none',
    fontSize: 12.5, fontFamily: FONT_SANS, background: C.canvas, color: C.ink,
  }} />
);

/* ============================================================
   MAIN PAGE
   ============================================================ */

export default function BoardPage() {
  const { t, i18n } = useTranslation();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const isLeader = can('admin', 'manager', 'leader');
  const today = new Date().toLocaleDateString('en-CA');
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 11) return t('greeting_morning', 'Chào buổi sáng');
    if (h < 14) return t('greeting_noon', 'Chào buổi trưa');
    if (h < 18) return t('greeting_afternoon', 'Chào buổi chiều');
    return t('greeting_evening', 'Chào buổi tối');
  })();

  const [dailyGroups, setDailyGroups] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [requests, setRequests] = useState([]);
  const [completedAll, setCompletedAll] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal mở rộng: null | 'daily' | 'requests' | 'completed'
  const [expanded, setExpanded] = useState(null);
  const [dailyQ, setDailyQ] = useState('');
  const [reqModalQ, setReqModalQ] = useState('');
  const [doneQ, setDoneQ] = useState('');
  const [doneFilter, setDoneFilter] = useState('all'); // all | on_time | late

  const [reqFilter, setReqFilter] = useState('all');
  const [reqGroupFilter, setReqGroupFilter] = useState('');

  const [dailyPage, setDailyPage] = useState(1);
  const [reqPage, setReqPage] = useState(1);
  const [donePage, setDonePage] = useState(1);
  useEffect(() => { setDailyPage(p => Math.min(p, totalPagesOf(dailyGroups))); }, [dailyGroups]);
  useEffect(() => { setReqPage(1); }, [reqFilter, reqGroupFilter]);
  useEffect(() => { setDonePage(p => Math.min(p, totalPagesOf(completedAll))); }, [completedAll]);

  useEffect(() => { if (user) fetchAll(); }, [user]);

  const sortByUrgency = (list) => {
    const scoreOf = (tsk) => {
      if (isOverdue(tsk)) return 0;
      if (isNearDeadline(tsk)) return 1;
      if (isTaskNew(tsk)) return 2;
      return 3;
    };
    return [...list].sort((a, b) => {
      const sa = scoreOf(a), sb = scoreOf(b);
      if (sa !== sb) return sa - sb;
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return da - db;
    });
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const ts = Date.now();
      const [gRes, r1, r2, r3, cRes] = await Promise.all([
        api.get('/groups'),
        api.get(`/requests?status=pending&_t=${ts}`),
        api.get(`/requests?status=assigned&_t=${ts}`),
        api.get(`/requests?status=in_progress&_t=${ts}`),
        api.get(`/requests?status=done&_t=${ts}`),
      ]);

      const allReq = [...(r1.data.data || []), ...(r2.data.data || []), ...(r3.data.data || [])]
        .filter((tk, i, a) => a.findIndex(x => x.id === tk.id) === i);
      setRequests(sortByUrgency(allReq));
      setCompletedAll(cRes.data.data || []);

      const allGroupsRes = gRes.data.data || [];
      setAllGroups(allGroupsRes);
      const userGroupIds = user?.groups?.map(g => g.id) || [];
      const visible = can('admin', 'manager') ? allGroupsRes : allGroupsRes.filter(g => userGroupIds.includes(g.id));
      if (!visible.length) { setDailyGroups([]); return; }

      const boardResults = await Promise.all(
        visible.map(g => api.get(`/daily/board?group_id=${g.id}&date=${today}`).catch(() => ({ data: { data: [] } })))
      );
      const d = new Date(); const dow = d.getDay() === 0 ? 7 : d.getDay(); const dom = d.getDate();
      const parseFreqDays = (v) => (v == null ? '' : String(v)).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      const enriched = visible.map((g, gi) => {
        const item = (boardResults[gi].data.data || [])[0] || {};
        const tasks = (item.tasks || []).filter(tk => {
          if (tk.frequency === 'daily') return true;
          if (tk.frequency === 'weekly')  return parseFreqDays(tk.frequency_day)[0] === dow;
          if (tk.frequency === 'monthly') return parseFreqDays(tk.frequency_day)[0] === dom;
          if (tk.frequency === 'weekly_count')  return parseFreqDays(tk.frequency_day).includes(dow);
          if (tk.frequency === 'monthly_count') return parseFreqDays(tk.frequency_day).includes(dom);
          return false;
        });
        return { ...g, tasks, members: item.members || [] };
      });
      setDailyGroups(enriched);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user]);

  // 📡 Realtime — tự cập nhật cột "Yêu cầu"/"Hoàn thành" khi có CV mới/đổi
  // trạng thái/gán người... ở bất kỳ đâu, không cần F5. Xóa cache client
  // trước khi fetch lại (cache GET chỉ tự xóa khi CHÍNH tab này gọi
  // POST/PUT/DELETE, không biết gì về thay đổi từ tab/người khác).
  // ⚠️ Đặt SAU khai báo fetchAll (không phải trước) — fetchAll dùng const,
  // tham chiếu nó trong dependency array TRƯỚC khi khai báo sẽ crash ngay lúc
  // render (temporal dead zone), không đợi tới lúc effect thật sự chạy.
  useEffect(() => {
    if (!user?.id) return;
    const socket = getSocket(user.id);
    const onUpdate = () => { clearApiCache(); fetchAll(); };
    socket.on('requests:updated', onUpdate);
    return () => socket.off('requests:updated', onUpdate);
  }, [user?.id, fetchAll]);

  const localeMap = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP' };
  const currentLocale = localeMap[i18n.language] || 'vi-VN';
  const fmtDate = d => {
    const dt = new Date(d);
    const days = t('weekdays', { returnObjects: true });
    return `${days[dt.getDay()]}, ${dt.toLocaleDateString(currentLocale)}`;
  };

  const myId = user?.id;
  const reqCounts = {
    all: requests.length,
    mine: requests.filter(tk => isMine(tk, myId)).length,
    overdue: requests.filter(isOverdue).length,
    near: requests.filter(isNearDeadline).length,
    new: requests.filter(isTaskNew).length,
    unassigned: requests.filter(isUnassigned).length,
  };
  const REQ_FILTERS = [
    ['all',        t('board_filter_all', 'Tất cả'),         null],
    ['mine',       t('board_filter_mine', 'Của tôi'),        '🔔'],
    ['overdue',    t('board_tag_overdue', 'Trễ hạn'),        '⚠'],
    ['near',       t('board_tag_near_deadline', 'Sắp hết hạn'), '⏳'],
    ['new',        t('board_tag_new', 'Mới'),                '🆕'],
    ['unassigned', t('board_tag_unassigned', 'Chưa nhận'),   '👷'],
  ];
  const filteredRequests = requests.filter(tsk => {
    if (reqGroupFilter && String(tsk.group_id) !== reqGroupFilter) return false;
    if (reqFilter === 'all')        return true;
    if (reqFilter === 'mine')       return isMine(tsk, myId);
    if (reqFilter === 'overdue')    return isOverdue(tsk);
    if (reqFilter === 'near')       return isNearDeadline(tsk);
    if (reqFilter === 'new')        return isTaskNew(tsk);
    if (reqFilter === 'unassigned') return isUnassigned(tsk);
    return true;
  });
  const modalRequests = filteredRequests.filter(tsk => !reqModalQ.trim() || (tsk.title || '').toLowerCase().includes(reqModalQ.trim().toLowerCase()));
  const modalDaily = dailyGroups.filter(g => !dailyQ.trim() || (g.name || '').toLowerCase().includes(dailyQ.trim().toLowerCase()));
  const modalCompleted = completedAll.filter(tk => {
    if (doneFilter === 'on_time' && tk.is_late) return false;
    if (doneFilter === 'late' && !tk.is_late) return false;
    if (doneQ.trim() && !(tk.title || '').toLowerCase().includes(doneQ.trim().toLowerCase())) return false;
    return true;
  });

  const reqGroups = allGroups.map(g => ({ id: String(g.id), name: g.name }));

  const ReqFilterChips = () => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {REQ_FILTERS.map(([key, label, icon]) => (
        <button key={key} className="brd-filter-chip" onClick={() => setReqFilter(key)} style={{
          padding: '5px 11px', borderRadius: 16, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_SANS,
          border: `1.5px solid ${reqFilter === key ? C.primary : C.line}`,
          background: reqFilter === key ? `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})` : '#fff',
          color: reqFilter === key ? '#fff' : C.sub, whiteSpace: 'nowrap',
        }}>{icon && `${icon} `}{label} {reqCounts[key] > 0 && <span style={{ opacity: .8, fontFamily: FONT_MONO }}>{reqCounts[key]}</span>}</button>
      ))}
      {reqGroups.length > 0 && (
        <select value={reqGroupFilter} onChange={e => setReqGroupFilter(e.target.value)} className="brd-group-select" style={{
          padding: '5px 10px', borderRadius: 16, fontSize: 11, fontWeight: 700, color: reqGroupFilter ? '#fff' : C.sub,
          border: `1.5px solid ${reqGroupFilter ? C.primary : C.line}`, fontFamily: FONT_SANS,
          background: reqGroupFilter ? C.primary : '#fff', outline: 'none', cursor: 'pointer', marginLeft: 'auto',
          maxWidth: '100%',
        }}>
          <option value="">🏭 {t('board_all_groups', 'Tất cả nhóm')}</option>
          {reqGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      )}
    </div>
  );

  const ColHdr = ({ icon, iconBg, iconColor, title, count, total, countBg, countColor, onExpand, extra }) => (
    <div className="brd-col-hdr" style={{ padding: '13px 16px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, background: C.surface, flexShrink: 0, flexWrap: 'wrap', rowGap: 6 }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: iconColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, boxShadow: `0 3px 10px ${iconColor}66`, flexShrink: 0 }}>{icon}</div>
      <div className="brd-col-hdr-title" style={{ fontSize: 13.5, fontWeight: 800, color: C.ink, flex: '1 1 auto', minWidth: 40, fontFamily: FONT_SANS, letterSpacing: .1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
      <span title={total != null && total !== count ? `Đang lọc: hiện ${count} trong tổng ${total}` : undefined}
        style={{ background: countBg, color: countColor, fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20, fontFamily: FONT_MONO, display: 'inline-flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
        {count}
        {total != null && total !== count && <span style={{ opacity: .6, fontWeight: 700 }}>/{total}</span>}
      </span>
      {onExpand && <ExpandBtn onClick={onExpand} color={iconColor} />}
      {extra}
    </div>
  );

  const BtnPrimary = ({ children, onClick, small }) => (
    <button onClick={onClick} className="brd-btn-primary" style={{
      padding: small ? '5px 11px' : '7px 15px', borderRadius: 9, border: 'none',
      background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, color: '#fff',
      fontSize: small ? 11 : 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
      fontFamily: FONT_SANS, boxShadow: `0 3px 10px ${C.primary}4d`, flexShrink: 0,
    }}>{children}</button>
  );

  return (
    <div className="brd-root" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', background: C.canvas, minWidth: 0, fontFamily: FONT_SANS }}>
      <style>{`
        .brd-root { box-sizing: border-box; width: 100%; max-width: 100vw; }
        .brd-root *, .brd-root *::before, .brd-root *::after { box-sizing: border-box; min-width: 0; }

        @keyframes brdPulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes brdShimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes brdFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes brdRise { from{opacity:0; transform:translateY(6px)} to{opacity:1; transform:translateY(0)} }
        @keyframes brdPop { from{opacity:0; transform:scale(.96) translateY(8px)} to{opacity:1; transform:scale(1) translateY(0)} }

        .brd-root .brd-shimmer { position:absolute; inset:0; background: linear-gradient(90deg, transparent, rgba(54,84,255,.06), transparent); animation: brdShimmer 1.3s ease-in-out infinite; }
        .brd-root .brd-card { transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; animation: brdRise .25s ease both; }
        .brd-root .brd-card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,23,41,.09); border-color: ${C.primary}33; }

        .brd-root .brd-filter-chip { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s; }
        .brd-root .brd-filter-chip:active { transform: scale(0.94); }

        .brd-root .brd-btn-primary { transition: transform .12s ease, box-shadow .12s ease; }
        .brd-root .brd-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 16px ${C.primary}66; }
        .brd-root .brd-btn-primary:active { transform: translateY(0); }

        .brd-root .brd-expand-btn { transition: transform .12s ease, filter .12s ease; }
        .brd-root .brd-expand-btn:hover { transform: scale(1.08); filter: brightness(0.95); }
        .brd-root .brd-expand-btn:active { transform: scale(0.96); }

        .brd-root .brd-modal { animation: brdPop .2s cubic-bezier(.2,.8,.2,1) both; }
        .brd-root .brd-backdrop { animation: brdFadeIn .18s ease both; }

        .brd-root ::-webkit-scrollbar { width: 8px; height: 8px; }
        .brd-root ::-webkit-scrollbar-thumb { background: #d3d9e8; border-radius: 8px; }
        .brd-root ::-webkit-scrollbar-thumb:hover { background: #b9c1d8; }

        @media (prefers-reduced-motion: reduce) { .brd-root * { animation: none !important; transition: none !important; } }

        /* ≥1600px: màn hình rộng — nới cột ra để không bị dồn quá hẹp so với khoảng trống thừa */
        @media (min-width: 1600px) {
          .brd-root .brd-col { flex: 1 1 380px !important; }
        }

        /* Laptop 14-15in / màn hình vừa (1024-1300px) — chưa đủ hẹp để chuyển sang chế độ vuốt như mobile,
           nhưng vẫn cần gọn lại một chút để đỡ phải cuộn ngang thường xuyên. */
        @media (max-width: 1300px) {
          .brd-root .brd-col { min-width: 260px !important; flex-basis: 300px !important; }
        }

        /* Tablet ngang / laptop nhỏ (1024px) — thu gọn thêm padding & chữ để 3 cột vẫn đọc rõ, không bị bóp chữ */
        @media (max-width: 1150px) {
          .brd-root .brd-col { min-width: 240px !important; flex-basis: 250px !important; }
          .brd-root .brd-col-hdr { padding: 11px 12px !important; }
          .brd-root .brd-col-hdr-title { font-size: 12.5px !important; }
        }

        @media (max-width: 900px) {
          .brd-root { overflow-y: auto !important; }
          .brd-root .brd-topbar { flex-wrap: wrap !important; padding: 10px 14px !important; gap: 8px !important; }
          .brd-root .brd-title { flex-basis: 100% !important; }
          .brd-root .brd-date { order: 3 !important; flex: 1 1 auto !important; text-align: center !important; }
          .brd-root .brd-create-btn { flex: 1 1 auto !important; text-align: center !important; }
          .brd-root .brd-create-btn button { width: 100% !important; }
          .brd-root .brd-hint { display: flex !important; }
          .brd-root .brd-body { overflow-x: auto !important; overflow-y: hidden !important; scroll-snap-type: x mandatory !important; -webkit-overflow-scrolling: touch; min-height: 70vh !important; }
          .brd-root .brd-col { flex: 0 0 92% !important; max-width: 92% !important; min-width: 0 !important; min-height: 70vh !important; scroll-snap-align: start !important; border-right: none !important; margin-right: 10px !important; }
          .brd-root .brd-col:last-child { margin-right: 0 !important; }
          .brd-root .brd-col-hdr { padding: 12px 14px !important; }
          .brd-root .brd-col-hdr-title { font-size: 13.5px !important; }
          .brd-root .brd-req-filterbar { padding: 8px 10px !important; }
          .brd-root .brd-group-select { margin-left: 0 !important; flex: 1 1 100% !important; }
          .brd-root .brd-modal { max-height: 92vh !important; border-radius: 16px !important; }
        }
        @media (max-width: 480px) {
          .brd-root .brd-col { flex: 0 0 94% !important; max-width: 94% !important; }
          .brd-root .brd-modal-grid { grid-template-columns: 1fr !important; }
        }
        /* Điện thoại nhỏ (≤380px) — bớt padding/font để không tràn ngang */
        @media (max-width: 380px) {
          .brd-root .brd-col { flex: 0 0 96% !important; max-width: 96% !important; }
          .brd-root .brd-title-main { font-size: 13.5px !important; }
          .brd-root .brd-title-eyebrow { display: none !important; }
          .brd-root .brd-col-hdr { padding: 10px 12px !important; gap: 8px !important; }
          .brd-root .brd-col-hdr-title { font-size: 12.5px !important; }
        }
      `}</style>

      <div className="brd-topbar" style={{ padding: '13px 20px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, background: C.surface, flexShrink: 0 }}>
        <div className="brd-title" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="brd-title-eyebrow" style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, fontFamily: FONT_MONO, letterSpacing: '.14em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('board_title')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 8px ${C.primary}4d`, flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="4" width="5" height="16" rx="1.4" fill="#fff" fillOpacity="0.95" />
                <rect x="9.5" y="4" width="5" height="10" rx="1.4" fill="#fff" fillOpacity="0.65" />
                <rect x="16" y="4" width="5" height="13" rx="1.4" fill="#fff" fillOpacity="0.4" />
              </svg>
            </span>
            <span className="brd-title-main" style={{ fontSize: 15.5, fontWeight: 800, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {greeting}
              {user?.full_name && <>, <span style={{ color: C.primary }}>{user.full_name}</span></>}
              {' '}<span aria-hidden="true">👋</span>
            </span>
          </span>
        </div>
        <div className="brd-date" style={{ fontSize: 11.5, color: C.sub, background: C.canvas, padding: '5px 13px', borderRadius: 20, border: `1px solid ${C.line}`, whiteSpace: 'nowrap', fontFamily: FONT_MONO, flexShrink: 0 }}>📅 {fmtDate(today)}</div>
        {isLeader && <div className="brd-create-btn" style={{ flexShrink: 0 }}><BtnPrimary onClick={() => navigate('/requests?create=1')}>＋ {t('board_create_request')}</BtnPrimary></div>}
      </div>

      <div className="brd-hint" style={{ display: 'none', padding: '6px 20px', background: C.canvas, borderBottom: `1px solid ${C.line}`, alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: C.faint, flexShrink: 0 }}>
        👈 {t('board_swipe_hint')} 👉
      </div>

      <div className="brd-body" style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'hidden', minHeight: 480 }}>
        {/* Col 1: Hằng ngày */}
        <div className="brd-col" style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.line}`, overflow: 'hidden', minWidth: 300, minHeight: 480 }}>
          <ColHdr icon="📋" iconBg={C.primarySoft} iconColor={C.primary} title={t('board_col_daily')} count={dailyGroups.length}
            countBg={C.primarySoft} countColor={C.primary}
            onExpand={dailyGroups.length > 0 ? () => setExpanded('daily') : null}
            extra={isLeader && <BtnPrimary small onClick={() => navigate('/daily')}>＋</BtnPrimary>} />
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {loading ? <SkeletonList /> : <>
              {pageSliceOf(dailyGroups, dailyPage).map(g => <DailyCard key={g.id} group={g} onClick={() => navigate('/daily')} />)}
              {!dailyGroups.length && <Empty text={t('board_empty_daily')} icon="📋" />}
            </>}
          </div>
          {!loading && <Pagination page={dailyPage} totalPages={totalPagesOf(dailyGroups)} onChange={setDailyPage} />}
        </div>

        {/* Col 2: Yêu cầu */}
        <div className="brd-col" style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.line}`, overflow: 'hidden', minWidth: 300, minHeight: 480 }}>
          <ColHdr icon="📨" iconBg={C.warningSoft} iconColor={C.warning} title={t('board_col_requests')} count={filteredRequests.length} total={requests.length}
            countBg={C.warningSoft} countColor={C.warning}
            onExpand={requests.length > 0 ? () => setExpanded('requests') : null}
            extra={isLeader && <BtnPrimary small onClick={() => navigate('/requests?create=1')}>＋ {t('create')}</BtnPrimary>} />

          <div className="brd-req-filterbar" style={{ padding: '9px 12px', borderBottom: `1px solid ${C.line}`, background: C.surface, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reqCounts.mine > 0 && (
              <div onClick={() => setReqFilter('mine')} className="brd-notify-banner" style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 11, cursor: 'pointer',
                background: `linear-gradient(135deg, ${C.primarySoft}, #f3f0ff)`, border: `1px solid ${C.primary}33`,
              }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, animation: 'brdPulse 2s ease-in-out infinite' }}>🔔</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: C.primaryDeep, fontFamily: FONT_SANS, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t('board_notify_assigned_to_me', 'Bạn đang được giao {{count}} yêu cầu', { count: reqCounts.mine })}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: C.primary, fontFamily: FONT_SANS, whiteSpace: 'nowrap', flexShrink: 0 }}>{t('board_view_all', 'Xem')} →</span>
              </div>
            )}
            <ReqFilterChips />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {loading ? <SkeletonList /> : <>
              {pageSliceOf(filteredRequests, reqPage).map(tk => <RequestCard key={tk.id} task={tk} myId={myId} onNav={() => navigate(`/requests?id=${tk.id}`)} />)}
              {!filteredRequests.length && <Empty text={t('board_empty_requests')} icon="📨" />}
            </>}
          </div>
          {!loading && <Pagination page={reqPage} totalPages={totalPagesOf(filteredRequests)} onChange={setReqPage} />}
        </div>

        {/* Col 3: Hoàn thành */}
        <div className="brd-col" style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 300, minHeight: 480 }}>
          <ColHdr icon="✅" iconBg={C.successSoft} iconColor={C.success} title={t('board_col_completed')} count={completedAll.length}
            countBg={C.successSoft} countColor={C.success}
            onExpand={completedAll.length > 0 ? () => setExpanded('completed') : null} />
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {loading ? <SkeletonList /> : <>
              {pageSliceOf(completedAll, donePage).map(tk => <CompletedCard key={tk.id} task={tk} onNav={() => navigate(`/requests?id=${tk.id}`)} />)}
              {!completedAll.length && <Empty text={t('board_empty_completed')} icon="✅" />}
            </>}
          </div>
          {!loading && <Pagination page={donePage} totalPages={totalPagesOf(completedAll)} onChange={setDonePage} />}
        </div>
      </div>

      {/* ---- Modal mở rộng: Hằng ngày ---- */}
      <ExpandModal open={expanded === 'daily'} onClose={() => setExpanded(null)}
        icon="📋" iconBg={C.primarySoft} iconColor={C.primary} title={t('board_col_daily')} count={modalDaily.length}
        filterBar={<ModalSearch value={dailyQ} onChange={setDailyQ} placeholder="🔎 Tìm theo tên nhóm..." />}>
        {modalDaily.map(g => <DailyCard key={g.id} group={g} onClick={() => { setExpanded(null); navigate('/daily'); }} />)}
        {!modalDaily.length && <Empty text="Không tìm thấy nhóm phù hợp" icon="🔍" />}
      </ExpandModal>

      {/* ---- Modal mở rộng: Yêu cầu ---- */}
      <ExpandModal open={expanded === 'requests'} onClose={() => setExpanded(null)}
        icon="📨" iconBg={C.warningSoft} iconColor={C.warning} title={t('board_col_requests')} count={modalRequests.length}
        filterBar={<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><ReqFilterChips /><ModalSearch value={reqModalQ} onChange={setReqModalQ} placeholder="🔎 Tìm theo tên công việc..." /></div>}>
        {modalRequests.map(tk => <RequestCard key={tk.id} task={tk} myId={myId} onNav={() => { setExpanded(null); navigate(`/requests?id=${tk.id}`); }} />)}
        {!modalRequests.length && <Empty text="Không tìm thấy yêu cầu phù hợp" icon="🔍" />}
      </ExpandModal>

      {/* ---- Modal mở rộng: Hoàn thành ---- */}
      <ExpandModal open={expanded === 'completed'} onClose={() => setExpanded(null)}
        icon="✅" iconBg={C.successSoft} iconColor={C.success} title={t('board_col_completed')} count={modalCompleted.length}
        filterBar={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}><ModalSearch value={doneQ} onChange={setDoneQ} placeholder="🔎 Tìm theo tên công việc..." /></div>
            {['all', 'on_time', 'late'].map(k => (
              <button key={k} onClick={() => setDoneFilter(k)} style={{
                padding: '0 13px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_SANS,
                border: `1.5px solid ${doneFilter === k ? C.primary : C.line}`,
                background: doneFilter === k ? C.primary : '#fff', color: doneFilter === k ? '#fff' : C.sub, whiteSpace: 'nowrap', flexShrink: 0,
              }}>{k === 'all' ? t('board_filter_all', 'Tất cả') : k === 'on_time' ? t('on_time') : t('late')}</button>
            ))}
          </div>
        }>
        {modalCompleted.map(tk => <CompletedCard key={tk.id} task={tk} onNav={() => { setExpanded(null); navigate(`/requests?id=${tk.id}`); }} />)}
        {!modalCompleted.length && <Empty text="Không tìm thấy công việc phù hợp" icon="🔍" />}
      </ExpandModal>
    </div>
  );
}