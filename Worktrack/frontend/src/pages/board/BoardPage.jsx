import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { clearApiCache } from '../../api/client';
import useAuth from '../../store/authStore';
import { onRealtime } from '../../lib/socket';
import { useNow } from '../../lib/useNow';

/* ============================================================
   DESIGN TOKENS
   "Control-panel" system: deep signal-blue for primary actions,
   hazard-stripe accent for anything urgent/overdue, monospace
   digital-readout type for countdowns/scores/page numbers.
   ============================================================ */
const C = {
  ink:        'var(--wt-ink)',
  sub:        'var(--wt-text-2)',
  faint:      'var(--wt-text-3)',
  surface:    'var(--wt-surface)',
  canvas:     'var(--wt-canvas)',
  line:       'var(--wt-line)',
  lineSoft:   'var(--wt-surface-3)',

  primary:      '#3654ff',
  primaryDeep:  '#2440d6',
  primarySoft:  'var(--wt-tint-primary)',

  success:     '#17b26a',
  successSoft: 'var(--wt-tint-success)',
  warning:     '#f59e0b',
  warningSoft: 'var(--wt-tint-warning)',
  danger:      '#e5384d',
  dangerSoft:  'var(--wt-tint-danger)',
  violet:      '#8b5cf6',
  violetSoft:  'var(--wt-tint-violet)',
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
    background: active ? `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})` : 'var(--wt-surface)',
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
  // Còn > 1 ngày chỉ hiện ngày/giờ → cập nhật mỗi phút là đủ
  const now = useNow(n => (new Date(deadline) - n > 86400000 ? 60000 : 1000), status !== 'done');
  const diff = new Date(deadline) - now;
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

  return (
    <div onClick={onNav} className="brd-card" style={{
      background: C.surface, borderRadius: 14,
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
            {mineNew && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--wt-surface)', animation: 'brdPulse 1.1s ease-in-out infinite', flexShrink: 0 }} />}
            {mineNew ? `🔔 ${t('board_tag_newly_assigned_to_me', 'Mới giao cho bạn')}` : `👷 ${t('board_tag_assigned_to_me', 'Của bạn')}`}
          </span>
        ) : (
          <span style={{ fontSize: 10, fontWeight: 700, color: priColor, whiteSpace: 'nowrap', fontFamily: FONT_SANS, flexShrink: 0 }}>{t(priKey)}</span>
        )}
      </div>
      <div style={{ padding: '2px 12px 0 14px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {/* Trễ hạn đã thể hiện ở viền đỏ + dòng deadline "Quá hạn" bên dưới → không lặp nhãn ở đây */}
        {!overdue && near && <Badge text={t('board_tag_near_deadline', 'Sắp hết hạn')} bg={C.warningSoft} color={C.warning} />}
        {fresh && <Badge text={`🆕 ${t('board_tag_new', 'Mới')}`} bg={C.primarySoft} color={C.primary} />}
        {task.status === 'scoring' && <Badge text={`🏆 ${t('board_tag_scoring', 'Chờ Leader chấm điểm')}`} bg={C.violetSoft} color={C.violet} />}
        {unassigned && <Badge text={`👷 ${t('board_tag_unassigned', 'Chưa nhận')}`} bg={C.violetSoft} color={C.violet} />}
        {!unassigned && !mine && <Badge text={`✅ ${t('board_tag_assigned', 'Đã giao')}`} bg={C.successSoft} color={C.success} />}
      </div>
      <div style={{ padding: '9px 12px 11px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.faint, fontFamily: FONT_SANS, minWidth: 0 }}>
          <span title={t('label_assigned_by')} style={{ flexShrink: 0 }}>👤</span>
          <span style={{ color: C.sub, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>{task.creator_name}</span>
          <span style={{ flexShrink: 0 }}>→</span>
          <span title={t('label_assignee')} style={{ flexShrink: 0 }}>👷</span>
          <span style={{ color: assignee ? C.ink : C.faint, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
            {assignee ? assignee.full_name + ((task.assignees?.length || 0) > 1 ? ` +${task.assignees.length - 1}` : '') : t('board_not_assigned')}
          </span>
        </div>
        {task.deadline && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <MetaRow icon="⏰" label="" value={fmt(task.deadline)} vc={overdue ? C.danger : C.ink} />
            <Countdown deadline={task.deadline} status={task.status} />
          </div>
        )}
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

// CV đã nộp + đã có điểm sơ bộ của Leader, đang chờ Manager duyệt lần cuối
function ReviewCard({ task, onNav, canApprove }) {
  const { t } = useTranslation();
  const fmt = d => d ? new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const assignees = (task.assignees || []).map(a => a.full_name + (a.role === 'support' ? ' (hỗ trợ)' : '')).join(', ');
  const lateSubmit = isLateSubmit(task);
  // Đã chờ duyệt bao lâu (tính từ lúc nộp) — cập nhật mỗi phút
  const now = useNow(60000);
  const waitMs = task.completed_at ? Math.max(0, now - new Date(task.completed_at)) : 0;
  const waitDays = Math.floor(waitMs / 86400000);
  const waitLabel = waitDays > 0 ? t('board_waited_days', { n: waitDays, defaultValue: `Đã chờ ${waitDays} ngày` })
    : t('board_waited_hours', { n: Math.max(1, Math.floor(waitMs / 3600000)), defaultValue: `Đã chờ ${Math.max(1, Math.floor(waitMs / 3600000))} giờ` });
  const waitColor = waitDays >= 3 ? C.danger : waitDays >= 1 ? C.warning : C.sub;
  return (
    <div onClick={onNav} className="brd-card" style={{ background: C.surface, borderRadius: 14, border: `1px solid ${canApprove ? C.violet : C.line}`, borderLeft: `5px solid ${C.violet}`, overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: C.violetSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>⏳</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0, fontFamily: FONT_SANS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
        {canApprove && <span style={{ fontSize: 9.5, fontWeight: 800, padding: '3px 9px', borderRadius: 20, background: C.violet, color: '#fff', fontFamily: FONT_SANS, flexShrink: 0, whiteSpace: 'nowrap' }}>{t('board_tag_need_approve', 'Cần bạn duyệt')}</span>}
      </div>
      <div style={{ padding: '0 14px 11px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <MetaRow icon="👷" label={t('label_assignee')} value={assignees || t('board_not_assigned')} />
        <MetaRow icon="👤" label={t('label_assigned_by')} value={`${task.creator_name || '—'}${task.group_name ? ` · ${task.group_name}` : ''}`} vc={C.sub} />
        <MetaRow icon="📤" label={t('board_submitted_at', 'Nộp lúc')} value={fmt(task.completed_at)} vc={lateSubmit ? C.danger : C.ink} />
        <MetaRow icon="⭐" label={t('board_prelim_score', 'Điểm sơ bộ')} value={task.score != null ? `${+task.score}đ` : '—'} vc={C.primary} />
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
          <Badge text={`⏱ ${waitLabel}`} bg={waitDays >= 1 ? (waitDays >= 3 ? C.dangerSoft : C.warningSoft) : C.lineSoft} color={waitColor} pulse={waitDays >= 3} />
          {lateSubmit && <Badge text={t('board_tag_late_submit', 'Nộp trễ hạn')} bg={C.dangerSoft} color={C.danger} />}
          {task.score == null && <Badge text={t('board_tag_unscored', 'Chưa có điểm')} bg={C.warningSoft} color={C.warning} />}
        </div>
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
            <button onClick={onClose} aria-label="close" style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${C.line}`, background: 'var(--wt-surface)', color: C.sub, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
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

/* ---------------- tìm kiếm + lọc dùng chung cho cả 3 cột và modal ---------------- */

// Tìm KHÔNG DẤU: gõ "nguyen van a" hay "bao cao" vẫn ra "Nguyễn Văn A", "Báo cáo"
const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
// Khớp theo tên CV, người giao, nhóm, người thực hiện
const matchQ = (tk, q) => {
  const n = norm(q.trim());
  if (!n) return true;
  return [tk.title, tk.creator_name, tk.group_name, ...(tk.assignees || []).map(a => a.full_name)].some(v => norm(v).includes(n));
};
const isLateSubmit = (tk) => !!(tk.deadline && tk.completed_at && new Date(tk.completed_at) > new Date(tk.deadline));

const ColSearch = ({ value, onChange, placeholder }) => (
  <div style={{ position: 'relative', flex: '1 1 140px', minWidth: 0 }}>
    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11.5, opacity: .5, pointerEvents: 'none' }}>🔎</span>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="brd-search" style={{
      width: '100%', padding: '7px 28px 7px 30px', borderRadius: 9, border: `1.5px solid ${C.line}`, outline: 'none',
      fontSize: 12, fontFamily: FONT_SANS, background: C.canvas, color: C.ink,
    }} />
    {value && <button onClick={() => onChange('')} aria-label="clear" style={{
      position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, borderRadius: 6,
      border: 'none', background: C.line, color: C.sub, cursor: 'pointer', fontSize: 10, lineHeight: 1,
    }}>✕</button>}
  </div>
);

// Các nút lọc trên 1 hàng, cuộn ngang khi cột hẹp (không chiếm 2–3 dòng như trước)
// items: [[key, nhãn, icon, số lượng], ...]
const ChipRow = ({ items, value, onChange, color = C.primary }) => (
  <div className="brd-chiprow" style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: '1 1 auto', minWidth: 0 }}>
    {items.map(([key, label, icon, count]) => {
      const on = value === key;
      return (
        <button key={key} className="brd-filter-chip" onClick={() => onChange(key)} style={{
          padding: '4px 10px', borderRadius: 16, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_SANS,
          flexShrink: 0, whiteSpace: 'nowrap', border: `1.5px solid ${on ? color : C.line}`,
          background: on ? color : '#fff', color: on ? '#fff' : C.sub,
        }}>
          {icon && `${icon} `}{label}
          {count > 0 && <span style={{ marginLeft: 4, opacity: on ? .85 : .7, fontFamily: FONT_MONO }}>{count}</span>}
        </button>
      );
    })}
  </div>
);

const MiniSelect = ({ value, onChange, active, title, children }) => (
  <select value={value} onChange={e => onChange(e.target.value)} title={title} className="brd-mini-select" style={{
    padding: '6px 8px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, fontFamily: FONT_SANS, outline: 'none', cursor: 'pointer',
    border: `1.5px solid ${active ? C.primary : C.line}`, background: active ? C.primarySoft : 'var(--wt-surface)', color: active ? C.primaryDeep : C.sub,
    flexShrink: 0, maxWidth: 150,
  }}>{children}</select>
);

const FilterBar = ({ children }) => (
  <div className="brd-filterbar" style={{ padding: '9px 12px', borderBottom: `1px solid ${C.line}`, background: C.surface, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
    {children}
  </div>
);
const FilterRow = ({ children }) => <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>{children}</div>;

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

  const [allGroups, setAllGroups] = useState([]);
  const [requests, setRequests] = useState([]);
  const [reviewing, setReviewing] = useState([]); // chờ Manager duyệt
  const [completedAll, setCompletedAll] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal mở rộng: null | 'requests' | 'reviewing' | 'completed'
  const [expanded, setExpanded] = useState(null);
  // Bộ lọc — dùng chung giữa cột và modal mở rộng của cột đó
  const [reqQ, setReqQ] = useState('');
  const [reqFilter, setReqFilter] = useState('all');
  const [reqGroupFilter, setReqGroupFilter] = useState('');
  const [reviewQ, setReviewQ] = useState('');
  const [reviewFilter, setReviewFilter] = useState('all');   // all | late | ontime | unscored
  const [reviewGroup, setReviewGroup] = useState('');
  const [reviewSort, setReviewSort] = useState('oldest');    // oldest | newest | score_high | score_low
  const [doneQ, setDoneQ] = useState('');
  const [doneFilter, setDoneFilter] = useState('all'); // all | on_time | late

  const [reviewPage, setReviewPage] = useState(1);
  const [reqPage, setReqPage] = useState(1);
  const [donePage, setDonePage] = useState(1);
  // Đổi bộ lọc → về trang 1 (tránh đứng ở trang 3 của danh sách chỉ còn 1 trang)
  useEffect(() => { setReqPage(1); }, [reqFilter, reqGroupFilter, reqQ]);
  useEffect(() => { setReviewPage(1); }, [reviewFilter, reviewGroup, reviewSort, reviewQ]);
  useEffect(() => { setDonePage(1); }, [doneFilter, doneQ]);

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
      // 1 lần gọi cho mọi trạng thái của luồng Yêu cầu → Chờ duyệt → Hoàn thành
      const [gRes, rRes] = await Promise.all([
        api.get('/groups'),
        api.get(`/requests?status=pending,assigned,in_progress,scoring,reviewing,done&_t=${Date.now()}`),
      ]);
      const list = rRes.data.data || [];
      setRequests(sortByUrgency(list.filter(tk => !['reviewing', 'done'].includes(tk.status))));
      // Chờ lâu nhất lên đầu để Manager duyệt trước
      setReviewing(list.filter(tk => tk.status === 'reviewing')
        .sort((a, b) => new Date(a.completed_at || a.created_at) - new Date(b.completed_at || b.created_at)));
      setCompletedAll(list.filter(tk => tk.status === 'done'));
      setAllGroups(gRes.data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  // 📡 Realtime — tự cập nhật cột "Yêu cầu"/"Hoàn thành" khi có CV mới/đổi
  // trạng thái/gán người... ở bất kỳ đâu, không cần F5. Xóa cache client
  // trước khi fetch lại (cache GET chỉ tự xóa khi CHÍNH tab này gọi
  // POST/PUT/DELETE, không biết gì về thay đổi từ tab/người khác).
  // ⚠️ Đặt SAU khai báo fetchAll (không phải trước) — fetchAll dùng const,
  // tham chiếu nó trong dependency array TRƯỚC khi khai báo sẽ crash ngay lúc
  // render (temporal dead zone), không đợi tới lúc effect thật sự chạy.
  useEffect(() => {
    if (!user?.id) return;
    return onRealtime('requests:updated', () => { clearApiCache(); fetchAll(); });
  }, [user?.id, fetchAll]);

  const localeMap = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP' };
  const currentLocale = localeMap[i18n.language] || 'vi-VN';
  const fmtDate = d => {
    const dt = new Date(d);
    const days = t('weekdays', { returnObjects: true });
    return `${days[dt.getDay()]}, ${dt.toLocaleDateString(currentLocale)}`;
  };

  const myId = user?.id;
  const canApprove = can('admin', 'manager');
  const groupOptions = allGroups.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>);

  // ── Cột 1: Yêu cầu ──
  const REQ_PRED = {
    all: () => true, mine: tk => isMine(tk, myId), overdue: isOverdue,
    near: isNearDeadline, new: isTaskNew, unassigned: isUnassigned,
    scoring: tk => tk.status === 'scoring',
  };
  const reqBase = requests.filter(tk => (!reqGroupFilter || String(tk.group_id) === reqGroupFilter) && matchQ(tk, reqQ));
  const reqCounts = Object.fromEntries(Object.entries(REQ_PRED).map(([k, f]) => [k, reqBase.filter(f).length]));
  const filteredRequests = reqBase.filter(REQ_PRED[reqFilter] || REQ_PRED.all);
  const reqFilterBar = (
    <>
      <FilterRow>
        <ColSearch value={reqQ} onChange={setReqQ} placeholder={t('board_search_ph', 'Tìm CV, người giao, người làm...')} />
        {allGroups.length > 0 && (
          <MiniSelect value={reqGroupFilter} onChange={setReqGroupFilter} active={!!reqGroupFilter} title={t('board_all_groups', 'Tất cả nhóm')}>
            <option value="">🏭 {t('board_all_groups', 'Tất cả nhóm')}</option>{groupOptions}
          </MiniSelect>
        )}
      </FilterRow>
      <ChipRow value={reqFilter} onChange={setReqFilter} items={[
        ['all',        t('board_filter_all', 'Tất cả'),                 null, reqCounts.all],
        ['mine',       t('board_filter_mine', 'Của tôi'),               '🔔', reqCounts.mine],
        ['overdue',    t('board_tag_overdue', 'Trễ hạn'),               '⚠', reqCounts.overdue],
        ['near',       t('board_tag_near_deadline', 'Sắp hết hạn'),     '⏳', reqCounts.near],
        ['unassigned', t('board_tag_unassigned', 'Chưa nhận'),          '👷', reqCounts.unassigned],
        ['scoring',    t('board_tag_scoring', 'Chờ Leader chấm điểm'), '🏆', reqCounts.scoring],
        ['new',        t('board_tag_new', 'Mới'),                       '🆕', reqCounts.new],
      ]} />
    </>
  );

  // ── Cột 2: Chờ Manager duyệt ──
  const REVIEW_PRED = { all: () => true, late: isLateSubmit, ontime: tk => !isLateSubmit(tk), unscored: tk => tk.score == null };
  const submittedAt = tk => new Date(tk.completed_at || tk.created_at).getTime();
  const REVIEW_SORT = {
    oldest:     (a, b) => submittedAt(a) - submittedAt(b),       // chờ lâu nhất lên đầu
    newest:     (a, b) => submittedAt(b) - submittedAt(a),
    score_high: (a, b) => (b.score ?? -1) - (a.score ?? -1),
    score_low:  (a, b) => (a.score ?? Infinity) - (b.score ?? Infinity),
  };
  const reviewBase = reviewing.filter(tk => (!reviewGroup || String(tk.group_id) === reviewGroup) && matchQ(tk, reviewQ));
  const reviewCounts = Object.fromEntries(Object.entries(REVIEW_PRED).map(([k, f]) => [k, reviewBase.filter(f).length]));
  const filteredReviewing = reviewBase.filter(REVIEW_PRED[reviewFilter]).sort(REVIEW_SORT[reviewSort]);
  const reviewFilterBar = (
    <>
      <FilterRow>
        <ColSearch value={reviewQ} onChange={setReviewQ} placeholder={t('board_search_ph', 'Tìm CV, người giao, người làm...')} />
        {allGroups.length > 0 && (
          <MiniSelect value={reviewGroup} onChange={setReviewGroup} active={!!reviewGroup} title={t('board_all_groups', 'Tất cả nhóm')}>
            <option value="">🏭 {t('board_all_groups', 'Tất cả nhóm')}</option>{groupOptions}
          </MiniSelect>
        )}
      </FilterRow>
      <FilterRow>
        <ChipRow value={reviewFilter} onChange={setReviewFilter} color={C.violet} items={[
          ['all',      t('board_filter_all', 'Tất cả'),               null, reviewCounts.all],
          ['late',     t('board_tag_late_submit', 'Nộp trễ hạn'),     '⚠', reviewCounts.late],
          ['ontime',   t('on_time', 'Đúng hạn'),                      '✓', reviewCounts.ontime],
          ['unscored', t('board_tag_unscored', 'Chưa có điểm'),       '☆', reviewCounts.unscored],
        ]} />
        <MiniSelect value={reviewSort} onChange={setReviewSort} active={reviewSort !== 'oldest'} title={t('board_sort', 'Sắp xếp')}>
          <option value="oldest">↕ {t('board_sort_oldest', 'Chờ lâu nhất')}</option>
          <option value="newest">↕ {t('board_sort_newest', 'Mới nộp')}</option>
          <option value="score_high">↕ {t('board_sort_score_high', 'Điểm cao → thấp')}</option>
          <option value="score_low">↕ {t('board_sort_score_low', 'Điểm thấp → cao')}</option>
        </MiniSelect>
      </FilterRow>
    </>
  );

  // ── Cột 3: Hoàn thành ──
  const DONE_PRED = { all: () => true, on_time: tk => !tk.is_late, late: tk => !!tk.is_late };
  const doneBase = completedAll.filter(tk => matchQ(tk, doneQ));
  const doneCounts = Object.fromEntries(Object.entries(DONE_PRED).map(([k, f]) => [k, doneBase.filter(f).length]));
  const filteredCompleted = doneBase.filter(DONE_PRED[doneFilter]);
  const doneFilterBar = (
    <>
      <ColSearch value={doneQ} onChange={setDoneQ} placeholder={t('board_search_ph', 'Tìm CV, người giao, người làm...')} />
      <ChipRow value={doneFilter} onChange={setDoneFilter} color={C.success} items={[
        ['all',     t('board_filter_all', 'Tất cả'), null, doneCounts.all],
        ['on_time', t('on_time', 'Đúng hạn'),        '✓', doneCounts.on_time],
        ['late',    t('late', 'Trễ hạn'),            '⚠', doneCounts.late],
      ]} />
    </>
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
        /* flex-shrink:0 — không cho danh sách tự ép dẹt thẻ cho vừa chiều cao cột (trước đây làm mất dòng deadline) */
        .brd-root .brd-card { flex-shrink: 0; transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; animation: brdRise .25s ease both; }
        .brd-root .brd-card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,23,41,.09); border-color: ${C.primary}33; }

        .brd-root .brd-filter-chip { -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform .1s ease, background .15s, color .15s, border-color .15s; }
        .brd-root .brd-filter-chip:active { transform: scale(0.94); }
        .brd-root .brd-filter-chip:hover { border-color: ${C.primary}66; }
        .brd-root .brd-chiprow { scrollbar-width: none; -webkit-mask-image: linear-gradient(90deg, #000 90%, transparent); mask-image: linear-gradient(90deg, #000 90%, transparent); padding-right: 14px; }
        .brd-root .brd-chiprow::-webkit-scrollbar { display: none; }
        .brd-root .brd-search { transition: border-color .15s, background .15s, box-shadow .15s; }
        .brd-root .brd-search:focus { border-color: ${C.primary}; background: var(--wt-surface); box-shadow: 0 0 0 3px ${C.primary}1f; }
        .brd-root .brd-mini-select:focus { border-color: ${C.primary}; }

        .brd-root .brd-btn-primary { transition: transform .12s ease, box-shadow .12s ease; }
        .brd-root .brd-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 16px ${C.primary}66; }
        .brd-root .brd-btn-primary:active { transform: translateY(0); }

        .brd-root .brd-expand-btn { transition: transform .12s ease, filter .12s ease; }
        .brd-root .brd-expand-btn:hover { transform: scale(1.08); filter: brightness(0.95); }
        .brd-root .brd-expand-btn:active { transform: scale(0.96); }

        .brd-root .brd-modal { animation: brdPop .2s cubic-bezier(.2,.8,.2,1) both; }
        .brd-root .brd-backdrop { animation: brdFadeIn .18s ease both; }

        .brd-root ::-webkit-scrollbar { width: 8px; height: 8px; }
        .brd-root ::-webkit-scrollbar-thumb { background: var(--wt-line-strong); border-radius: 8px; }
        .brd-root ::-webkit-scrollbar-thumb:hover { background: var(--wt-text-4); }

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
          .brd-root .brd-filterbar { padding: 8px 10px !important; }
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
        {/* Col 1: Yêu cầu (chờ nhận → đang làm → chờ Leader chấm) */}
        <div className="brd-col" style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.line}`, overflow: 'hidden', minWidth: 300, minHeight: 480 }}>
          <ColHdr icon="📨" iconBg={C.warningSoft} iconColor={C.warning} title={t('board_col_requests')} count={filteredRequests.length} total={requests.length}
            countBg={C.warningSoft} countColor={C.warning}
            onExpand={requests.length > 0 ? () => setExpanded('requests') : null}
            extra={isLeader && <BtnPrimary small onClick={() => navigate('/requests?create=1')}>＋ {t('create')}</BtnPrimary>} />

          <FilterBar>
            {reqCounts.mine > 0 && reqFilter !== 'mine' && (
              <div onClick={() => setReqFilter('mine')} className="brd-notify-banner" style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 11, cursor: 'pointer',
                background: `linear-gradient(135deg, ${C.primarySoft}, var(--wt-tint-violet))`, border: `1px solid ${C.primary}33`,
              }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDeep})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, animation: 'brdPulse 2s ease-in-out infinite' }}>🔔</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: C.primaryDeep, fontFamily: FONT_SANS, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t('board_notify_assigned_to_me', 'Bạn đang được giao {{count}} yêu cầu', { count: reqCounts.mine })}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: C.primary, fontFamily: FONT_SANS, whiteSpace: 'nowrap', flexShrink: 0 }}>{t('board_view_all', 'Xem')} →</span>
              </div>
            )}
            {reqFilterBar}
          </FilterBar>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {loading ? <SkeletonList /> : <>
              {pageSliceOf(filteredRequests, reqPage).map(tk => <RequestCard key={tk.id} task={tk} myId={myId} onNav={() => navigate(`/requests?id=${tk.id}`)} />)}
              {!filteredRequests.length && <Empty text={requests.length ? t('board_no_match', 'Không có công việc khớp bộ lọc') : t('board_empty_requests')} icon={requests.length ? '🔍' : '📨'} />}
            </>}
          </div>
          {!loading && <Pagination page={reqPage} totalPages={totalPagesOf(filteredRequests)} onChange={setReqPage} />}
        </div>

        {/* Col 2: Chờ Manager duyệt */}
        <div className="brd-col" style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.line}`, overflow: 'hidden', minWidth: 300, minHeight: 480 }}>
          <ColHdr icon="⏳" iconBg={C.violetSoft} iconColor={C.violet} title={t('board_col_reviewing', 'Chờ Manager duyệt')} count={filteredReviewing.length} total={reviewing.length}
            countBg={C.violetSoft} countColor={C.violet}
            onExpand={reviewing.length > 0 ? () => setExpanded('reviewing') : null} />
          {reviewing.length > 0 && <FilterBar>{reviewFilterBar}</FilterBar>}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {loading ? <SkeletonList /> : <>
              {pageSliceOf(filteredReviewing, reviewPage).map(tk => <ReviewCard key={tk.id} task={tk} canApprove={canApprove} onNav={() => navigate(`/requests?id=${tk.id}`)} />)}
              {!filteredReviewing.length && <Empty text={reviewing.length ? t('board_no_match', 'Không có công việc khớp bộ lọc') : t('board_empty_reviewing', 'Không có công việc nào đang chờ duyệt')} icon={reviewing.length ? '🔍' : '⏳'} />}
            </>}
          </div>
          {!loading && <Pagination page={reviewPage} totalPages={totalPagesOf(filteredReviewing)} onChange={setReviewPage} />}
        </div>

        {/* Col 3: Hoàn thành */}
        <div className="brd-col" style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 300, minHeight: 480 }}>
          <ColHdr icon="✅" iconBg={C.successSoft} iconColor={C.success} title={t('board_col_completed')} count={filteredCompleted.length} total={completedAll.length}
            countBg={C.successSoft} countColor={C.success}
            onExpand={completedAll.length > 0 ? () => setExpanded('completed') : null} />
          {completedAll.length > 0 && <FilterBar>{doneFilterBar}</FilterBar>}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {loading ? <SkeletonList /> : <>
              {pageSliceOf(filteredCompleted, donePage).map(tk => <CompletedCard key={tk.id} task={tk} onNav={() => navigate(`/requests?id=${tk.id}`)} />)}
              {!filteredCompleted.length && <Empty text={completedAll.length ? t('board_no_match', 'Không có công việc khớp bộ lọc') : t('board_empty_completed')} icon={completedAll.length ? '🔍' : '✅'} />}
            </>}
          </div>
          {!loading && <Pagination page={donePage} totalPages={totalPagesOf(filteredCompleted)} onChange={setDonePage} />}
        </div>
      </div>

      {/* ---- Modal mở rộng: dùng CHUNG bộ lọc với cột (lọc ở đâu cũng giữ nguyên) ---- */}
      <ExpandModal open={expanded === 'requests'} onClose={() => setExpanded(null)}
        icon="📨" iconBg={C.warningSoft} iconColor={C.warning} title={t('board_col_requests')} count={filteredRequests.length}
        filterBar={<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{reqFilterBar}</div>}>
        {filteredRequests.map(tk => <RequestCard key={tk.id} task={tk} myId={myId} onNav={() => { setExpanded(null); navigate(`/requests?id=${tk.id}`); }} />)}
        {!filteredRequests.length && <Empty text={t('board_no_match', 'Không có công việc khớp bộ lọc')} icon="🔍" />}
      </ExpandModal>

      <ExpandModal open={expanded === 'reviewing'} onClose={() => setExpanded(null)}
        icon="⏳" iconBg={C.violetSoft} iconColor={C.violet} title={t('board_col_reviewing', 'Chờ Manager duyệt')} count={filteredReviewing.length}
        filterBar={<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{reviewFilterBar}</div>}>
        {filteredReviewing.map(tk => <ReviewCard key={tk.id} task={tk} canApprove={canApprove} onNav={() => { setExpanded(null); navigate(`/requests?id=${tk.id}`); }} />)}
        {!filteredReviewing.length && <Empty text={t('board_no_match', 'Không có công việc khớp bộ lọc')} icon="🔍" />}
      </ExpandModal>

      <ExpandModal open={expanded === 'completed'} onClose={() => setExpanded(null)}
        icon="✅" iconBg={C.successSoft} iconColor={C.success} title={t('board_col_completed')} count={filteredCompleted.length}
        filterBar={<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{doneFilterBar}</div>}>
        {filteredCompleted.map(tk => <CompletedCard key={tk.id} task={tk} onNav={() => { setExpanded(null); navigate(`/requests?id=${tk.id}`); }} />)}
        {!filteredCompleted.length && <Empty text={t('board_no_match', 'Không có công việc khớp bộ lọc')} icon="🔍" />}
      </ExpandModal>
    </div>
  );
}