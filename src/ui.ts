// ── DOM helpers ──
export function qs<T extends HTMLElement>(sel: string, parent?: HTMLElement): T | null {
  return (parent || document).querySelector<T>(sel);
}

export function qsa<T extends HTMLElement>(sel: string, parent?: HTMLElement): T[] {
  return Array.from((parent || document).querySelectorAll<T>(sel));
}

export function el(tag: string, attrs: Record<string, string> = {}, children: string | HTMLElement[] = ''): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (typeof children === 'string') e.innerHTML = children;
  else children.forEach(c => e.appendChild(c));
  return e;
}

export function show(id: string) {
  const e = document.getElementById(id);
  if (e) e.style.display = '';
}

export function hide(id: string) {
  const e = document.getElementById(id);
  if (e) e.style.display = 'none';
}

// ── HTML escape ──
export function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Toast ──
export function toast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(c);
  }
  const t = document.createElement('div');
  const colors = { success: '#059669', error: '#DC2626', info: '#3B82F6' };
  t.style.cssText = `background:${colors[type]};color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.2);animation:slideIn .2s ease;max-width:360px;cursor:pointer;`;
  t.textContent = msg;
  t.onclick = () => t.remove();
  c.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 4000);
}

// ── Modal ──
export function modal(title: string, body: string, onClose?: () => void): HTMLElement {
  const existing = document.getElementById('modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:20px;';

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:80vh;overflow-y:auto;box-shadow:0 25px 50px rgba(0,0,0,.25);';

  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #E2E8F0;';
  hdr.innerHTML = `<h2 style="font-size:16px;font-weight:600;">${esc(title)}</h2>`;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:none;border:none;font-size:20px;cursor:pointer;color:#64748B;padding:4px;';
  closeBtn.onclick = () => { overlay.remove(); onClose?.(); };
  hdr.appendChild(closeBtn);
  box.appendChild(hdr);

  const content = document.createElement('div');
  content.style.cssText = 'padding:24px;';
  content.innerHTML = body;
  box.appendChild(content);

  overlay.appendChild(box);
  overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); onClose?.(); } };
  document.body.appendChild(overlay);
  return overlay;
}

// ── Dropdown ──
export function dropdown(opts: { value: string; label: string }[], selected: string = '', name: string = ''): string {
  return opts.map(o => `<option value="${esc(o.value)}"${o.value === selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
}

// ── Status badge ──
export function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    notified: '#3B82F6', pending: '#D97706', delayed: '#DC2626',
    review: '#7C3AED', 'sent-back': '#C8401A', completed: '#059669', closed: '#64748B',
    scheduled: '#3B82F6'
  };
  return `<span style="background:${colors[status] || '#64748B'};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:500;">${esc(status)}</span>`;
}

// ── Debounce ──
export function debounce(fn: (...args: any[]) => void, ms: number) {
  let timer: any;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── CSV download ──
export function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
