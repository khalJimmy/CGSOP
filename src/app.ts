import { auth, db } from './firebase.js';
import { signOut, createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp
} from 'firebase/firestore';
import { S } from './state.js';
import { FT, NAVMAP, NAVLABELS, ZONES, MONTHS, TAT_HOURS, WARN_HOURS } from './constants.js';
import { UserData, DeptData, NavPage, PlanData, TaskData, AuditData, Role, Zone } from './types.js';
import { esc, toast, modal, dropdown, statusBadge, downloadCSV, qs, qsa, show, hide } from './ui.js';
import { login, logout, onAuthChange, isFirstRun, createFirstAdmin, createUserAccount } from './auth.js';
import './audit-form.js';

// ════════════════════════════════════════════════════════════════
// APP SHELL
// ════════════════════════════════════════════════════════════════

let mainContainer: HTMLElement;
let navContainer: HTMLElement;
let headerEl: HTMLElement;

function initShell() {
  document.title = 'Casagrand Process Audit';

  const root = document.getElementById('app-root') || document.body;
  root.innerHTML = `
    <div id="login-screen"></div>
    <div id="app-shell" style="display:none;">
      <header id="header"></header>
      <div style="display:flex;">
        <nav id="navbar"></nav>
        <main id="main"></main>
      </div>
    </div>
  `;

  mainContainer = document.getElementById('main')!;
  navContainer = document.getElementById('navbar')!;
  headerEl = document.getElementById('header')!;
}

function renderHeader(user: UserData) {
  const roleColors: Record<string, string> = { admin: '#7C3AED', auditor: '#3B82F6', spoc: '#059669' };
  headerEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 24px;background:var(--hdr-bg);color:#fff;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:18px;font-weight:700;color:var(--brand3);">🔍</span>
        <span style="font-size:14px;font-weight:600;">Casagrand P&C v6</span>
      </div>
      <div style="display:flex;align-items:center;gap:16px;">
        <span style="font-size:12px;opacity:.7;">${esc(user.zone)}</span>
        <span style="background:${roleColors[user.role]||'#64748B'};padding:2px 10px;border-radius:12px;font-size:11px;text-transform:uppercase;">${esc(user.role)}</span>
        <span style="font-size:13px;">👤 ${esc(user.name)}</span>
        <button id="logoutBtn" style="background:none;border:1px solid rgba(255,255,255,.2);color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;">Sign Out</button>
      </div>
    </div>
  `;

  document.getElementById('logoutBtn')!.onclick = async () => {
    await logout();
    show('login-screen');
    document.getElementById('app-shell')!.style.display = 'none';
  };
}

function renderNav(user: UserData) {
  const pages = NAVMAP[user.role] || [];
  navContainer.innerHTML = `
    <div style="width:200px;min-height:calc(100vh - 52px);background:var(--surface);border-right:1px solid var(--border);padding:8px;">
      ${pages.map(p => `
        <div class="nav-item" data-page="${p}" style="padding:10px 14px;border-radius:6px;cursor:pointer;font-size:13px;margin-bottom:2px;transition:.1s;
          ${S.page === p ? 'background:var(--brand);color:#fff;font-weight:600;' : 'color:var(--ink2);'}"
          onmouseover="this.style.background='${S.page === p ? 'var(--brand)' : 'var(--surface2)'}"
          onmouseout="this.style.background='${S.page === p ? 'var(--brand)' : 'transparent'}">
          ${NAVLABELS[p]}
        </div>
      `).join('')}
    </div>
  `;

  navContainer.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const page = el.dataset.page as NavPage;
      S.page = page;
      renderNav(user);
      renderPage(page);
    });
  });
}

// ════════════════════════════════════════════════════════════════
// PAGE RENDERER
// ════════════════════════════════════════════════════════════════

async function renderPage(page: NavPage) {
  mainContainer.style.padding = '24px';
  mainContainer.style.flex = '1';
  mainContainer.style.overflowY = 'auto';
  mainContainer.style.background = 'var(--bg)';

  switch (page) {
    case 'dashboard': await renderDashboard(); break;
    case 'planner': renderPlanner(); break;
    case 'audit': renderAuditFormPage(); break;
    case 'dispatch': renderDispatch(); break;
    case 'tracker': renderTracker(); break;
    case 'records': await renderRecords(); break;
    case 'actions': renderSPOCActions(); break;
    case 'depts': renderDepts(); break;
    case 'users': renderUsers(); break;
    case 'settings': renderSettings(); break;
    default: mainContainer.innerHTML = '<p>Page not found.</p>';
  }
}

// ════════════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════════════

let loginScreen: HTMLElement;

function renderLogin() {
  loginScreen = document.getElementById('login-screen')!;
  loginScreen.innerHTML = `
    <div style="position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0F172A 0%,#1E293B 40%,#C8401A15 100%);">
      <div style="background:var(--surface);border-radius:20px;padding:48px 44px;width:440px;box-shadow:0 40px 80px rgba(0,0,0,.4);position:relative;overflow:hidden;">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--brand),var(--brand3),var(--brand));"></div>
        <div style="text-align:center;margin-bottom:32px;">
          <div style="font-size:40px;margin-bottom:8px;">🔍</div>
          <h1 style="font-size:20px;font-weight:700;color:var(--ink);">Casagrand Process Audit</h1>
          <p style="font-size:13px;color:var(--muted);margin-top:4px;">P&C Workflow v6</p>
        </div>
        <form id="loginForm" style="display:flex;flex-direction:column;gap:16px;">
          <div><label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Email</label>
            <input type="email" id="loginEmail" class="inp" placeholder="you@casagrand.co.in" required autocomplete="email"></div>
          <div><label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Password</label>
            <input type="password" id="loginPass" class="inp" placeholder="••••••••" required autocomplete="current-password"></div>
          <button type="submit" class="btn" style="padding:14px;font-size:15px;">Sign In</button>
          <p id="loginError" style="color:var(--red);font-size:12px;text-align:center;display:none;"></p>
        </form>
      </div>
    </div>
  `;

  document.getElementById('loginForm')!.onsubmit = async (e) => {
    e.preventDefault();
    const email = (document.getElementById('loginEmail') as HTMLInputElement).value;
    const pass = (document.getElementById('loginPass') as HTMLInputElement).value;
    const errEl = document.getElementById('loginError')!;
    errEl.style.display = 'none';

    const err = await login(email, pass);
    if (err) {
      errEl.textContent = err;
      errEl.style.display = 'block';
    }
    // onAuthChange handles the redirect
  };
}

// ════════════════════════════════════════════════════════════════
// FIRST-RUN SETUP
// ════════════════════════════════════════════════════════════════

function renderFirstRun() {
  const loginScreen = document.getElementById('login-screen')!;
  loginScreen.innerHTML = `
    <div style="position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0F172A 0%,#1E293B 40%,#C8401A15 100%);">
      <div style="background:var(--surface);border-radius:20px;padding:48px 44px;width:480px;box-shadow:0 40px 80px rgba(0,0,0,.4);">
        <div style="text-align:center;margin-bottom:28px;">
          <div style="font-size:40px;margin-bottom:8px;">🚀</div>
          <h1 style="font-size:20px;font-weight:700;">First-Time Setup</h1>
          <p style="font-size:13px;color:var(--muted);margin-top:4px;">Create the admin account to get started</p>
        </div>
        <form id="setupForm" style="display:flex;flex-direction:column;gap:14px;">
          <div><label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Admin Name *</label>
            <input type="text" id="setupName" class="inp" placeholder="e.g. John Doe" required></div>
          <div><label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Email *</label>
            <input type="email" id="setupEmail" class="inp" placeholder="admin@casagrand.co.in" required></div>
          <div><label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Password *</label>
            <input type="password" id="setupPass" class="inp" placeholder="Min 6 characters" required minlength="6"></div>
          <button type="submit" class="btn" style="padding:14px;font-size:15px;">Create Admin Account</button>
          <p id="setupError" style="color:var(--red);font-size:12px;text-align:center;display:none;"></p>
        </form>
      </div>
    </div>
  `;

  document.getElementById('setupForm')!.onsubmit = async (e) => {
    e.preventDefault();
    const name = (document.getElementById('setupName') as HTMLInputElement).value.trim();
    const email = (document.getElementById('setupEmail') as HTMLInputElement).value.trim();
    const pass = (document.getElementById('setupPass') as HTMLInputElement).value;
    const errEl = document.getElementById('setupError')!;
    errEl.style.display = 'none';

    const err = await createFirstAdmin(email, pass, name);
    if (err) {
      errEl.textContent = err;
      errEl.style.display = 'block';
    }
  };
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════

async function renderDashboard() {
  mainContainer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">⏳ Loading dashboard...</div>';

  try {
    const [auditsSnap, plansSnap, tasksSnap] = await Promise.all([
      getDocs(collection(db, 'audits')),
      getDocs(query(collection(db, 'plans'), where('status', '==', 'scheduled'))),
      getDocs(collection(db, 'tasks'))
    ]);

    const audits = auditsSnap.docs.map(d => d.data() as AuditData);
    const plans = plansSnap.docs.map(d => d.data() as PlanData);
    const tasks = tasksSnap.docs.map(d => d.data() as TaskData);

    const totalAudits = audits.length;
    const totalFindings = audits.reduce((s, a) => s + (a.findings?.length || 0), 0);
    const avgCompliance = totalAudits ? Math.round(audits.reduce((s, a) => s + (a.compliancePct || 0), 0) / totalAudits) : 0;
    const overdueTasks = tasks.filter(t => t.status === 'pending' && t.dueAt < Date.now()).length;
    const pendingPlans = plans.length;

    // Zone breakdown
    const zoneData = ZONES.map(z => ({
      zone: z,
      count: audits.filter(a => a.zone === z).length,
      compliance: audits.filter(a => a.zone === z).length
        ? Math.round(audits.filter(a => a.zone === z).reduce((s, a) => s + (a.compliancePct || 0), 0) / audits.filter(a => a.zone === z).length)
        : 0
    }));

    mainContainer.innerHTML = `
      <h2 style="font-size:20px;margin-bottom:20px;">📊 Dashboard</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px;">
        <div class="stat-card"><span style="font-size:11px;color:var(--muted);">Total Audits</span><strong style="font-size:28px;">${totalAudits}</strong></div>
        <div class="stat-card"><span style="font-size:11px;color:var(--muted);">Avg Compliance</span><strong style="font-size:28px;color:${avgCompliance >= 70 ? 'var(--green)' : avgCompliance >= 40 ? 'var(--amber)' : 'var(--red)'}">${avgCompliance}%</strong></div>
        <div class="stat-card"><span style="font-size:11px;color:var(--muted);">Overdue Tasks</span><strong style="font-size:28px;color:${overdueTasks > 0 ? 'var(--red)' : 'var(--green)'}">${overdueTasks}</strong></div>
        <div class="stat-card"><span style="font-size:11px;color:var(--muted);">Pending Plans</span><strong style="font-size:28px;">${pendingPlans}</strong></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="background:var(--surface);padding:20px;border-radius:var(--radius2);">
          <h3 style="font-size:14px;margin-bottom:12px;">Zone Breakdown</h3>
          ${zoneData.map(z => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
              <span style="font-size:13px;">${esc(z.zone)}</span>
              <span><strong>${z.count}</strong> audits · <span style="color:var(--blue);">${z.compliance}%</span></span>
            </div>
          `).join('')}
        </div>
        <div style="background:var(--surface);padding:20px;border-radius:var(--radius2);">
          <h3 style="font-size:14px;margin-bottom:12px;">⚠ TAT Alerts</h3>
          ${tasks.filter(t => t.status === 'pending' || t.status === 'delayed').slice(0, 5).map(t => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;">
              <span>${esc(t.dept)}</span>
              ${statusBadge(t.status)}
            </div>
          `).join('') || '<p style="color:var(--muted);font-size:13px;">No active TAT items.</p>'}
        </div>
      </div>
    `;
  } catch (err: any) {
    mainContainer.innerHTML = `<p style="color:var(--red);">Error loading dashboard: ${esc(err.message)}</p>`;
  }
}

// ════════════════════════════════════════════════════════════════
// PLANNER
// ════════════════════════════════════════════════════════════════

function renderPlanner() {
  mainContainer.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h2 style="font-size:20px;">📅 Audit Planner</h2>
      <button class="btn" id="newPlanBtn">＋ New Plan</button>
    </div>
    <div style="background:var(--surface);border-radius:var(--radius2);padding:20px;">
      <p style="color:var(--muted);">Plans will load here. Click "New Plan" to schedule.</p>
    </div>
  `;

  document.getElementById('newPlanBtn')!.onclick = () => showPlanModal();
  loadPlans();
}

async function loadPlans() {
  try {
    const snap = await getDocs(query(collection(db, 'plans'), orderBy('createdAt', 'desc'), limit(50)));
    const plans = snap.docs.map(d => d.data() as PlanData);

    const container = mainContainer.querySelector('div:last-child')!;
    if (plans.length === 0) return;

    container.innerHTML = `<table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:var(--surface2);">
        <th style="padding:10px;text-align:left;font-size:12px;">Ref</th>
        <th style="padding:10px;text-align:left;font-size:12px;">Dept</th>
        <th style="padding:10px;text-align:left;font-size:12px;">Month</th>
        <th style="padding:10px;text-align:left;font-size:12px;">Plan Date</th>
        <th style="padding:10px;text-align:left;font-size:12px;">Status</th>
      </tr></thead>
      <tbody>${plans.map(p => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${esc(p.ref)}</td>
          <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${esc(p.dept)}</td>
          <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${esc(p.month)}</td>
          <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${p.planDate}</td>
          <td style="padding:10px;border-bottom:1px solid var(--border);">${statusBadge(p.status)}</td>
        </tr>
      `).join('')}</tbody>
    </table>`;
  } catch {}
}

function showPlanModal() {
  const deptOpts = S.depts.map(d => `<option value="${esc(d.ref)}">${esc(d.name)}</option>`).join('');
  const body = `
    <div style="display:grid;gap:14px;">
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Dept / Function Ref *</label>
        <select id="plan-dept" class="inp"><option value="">— Select —</option>${deptOpts}</select></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Month *</label>
        <select id="plan-month" class="inp">${dropdown(MONTHS.map(m=>({value:m,label:m})))}</select></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Plan Date *</label>
        <input id="plan-date" type="date" class="inp"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Assigned Auditor</label>
        <input id="plan-auditor" class="inp" value="${esc(S.user?.name||'')}"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Plan Type</label>
        <select id="plan-type" class="inp"><option value="Plan">Plan</option><option value="Adhoc">Adhoc</option></select></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">SPOC Email(s)</label>
        <input id="plan-spoc" class="inp" placeholder="spoc@casagrand.co.in"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">HOD Email(s)</label>
        <input id="plan-hod" class="inp" placeholder="hod@casagrand.co.in"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Remarks</label>
        <textarea id="plan-remarks" class="inp" style="min-height:60px;"></textarea></div>
    </div>
  `;

  const m = modal('📅 Create Audit Plan', body);
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn';
  saveBtn.textContent = '✅ Create & Notify';
  saveBtn.onclick = async () => {
    const dept = (document.getElementById('plan-dept') as HTMLSelectElement)?.value;
    const month = (document.getElementById('plan-month') as HTMLSelectElement)?.value;
    const planDate = (document.getElementById('plan-date') as HTMLInputElement)?.value;
    if (!dept || !month || !planDate) { toast('Fill required fields.', 'error'); return; }

    try {
      await addDoc(collection(db, 'plans'), {
        ref: dept,
        dept: S.depts.find(d => d.ref === dept)?.name || dept,
        fn: S.depts.find(d => d.ref === dept)?.fn || '',
        month,
        planDate,
        assignedTo: (document.getElementById('plan-auditor') as HTMLInputElement)?.value || '',
        planType: (document.getElementById('plan-type') as HTMLSelectElement)?.value || 'Plan',
        spocMails: (document.getElementById('plan-spoc') as HTMLInputElement)?.value || '',
        hodMails: (document.getElementById('plan-hod') as HTMLInputElement)?.value || '',
        remarks: (document.getElementById('plan-remarks') as HTMLTextAreaElement)?.value || '',
        status: 'scheduled',
        createdAt: Date.now()
      });
      toast('Plan created!', 'success');
      m.remove();
      loadPlans();
    } catch (err: any) {
      toast('Error: ' + err.message, 'error');
    }
  };
  m.querySelector('div:last-child')?.appendChild(saveBtn);
}

// ════════════════════════════════════════════════════════════════
// AUDIT FORM (delegates to audit-form.ts)
// ════════════════════════════════════════════════════════════════

import { renderAuditForm } from './audit-form.js';

function renderAuditFormPage() {
  mainContainer.innerHTML = '';
  renderAuditForm(mainContainer);
}

// ════════════════════════════════════════════════════════════════
// DISPATCH
// ════════════════════════════════════════════════════════════════

async function renderDispatch() {
  mainContainer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">⏳ Loading...</div>';
  try {
    const snap = await getDocs(query(collection(db, 'audits'), where('auditId', '>', ''), orderBy('auditId')));
    const audits = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    mainContainer.innerHTML = `
      <h2 style="font-size:20px;margin-bottom:8px;">📤 Dispatch Centre</h2>
      <p style="font-size:12px;color:var(--muted);margin-bottom:20px;">Send audit reports · Start 72-hour corrective action clock</p>
      <div style="background:var(--surface);border-radius:var(--radius2);padding:20px;">
        <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">📧 Select a submitted audit → Click Dispatch → System generates SPOC response link and starts TAT clock.</p>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:var(--surface2);">
            <th style="padding:10px;text-align:left;font-size:12px;">Audit ID</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Dept</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Zone</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Findings</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Compliance</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Actions</th>
          </tr></thead>
          <tbody>${audits.map(a => `
            <tr>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${esc(a.auditId?.slice(-6) || '—')}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${esc(a.dept)}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${esc(a.zone)}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${a.findings?.length || 0}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${a.compliancePct || 0}%</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);">
                <button class="btn-sm" data-dispatch="${a.id}" style="background:var(--blue);color:#fff;">📤 Dispatch</button>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--muted);">No submitted audits yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    mainContainer.querySelectorAll('[data-dispatch]').forEach(btn => {
      btn.addEventListener('click', () => showDispatchModal((btn as HTMLElement).dataset.dispatch!));
    });
  } catch {}
}

function showDispatchModal(auditId: string) {
  const body = `
    <div style="display:grid;gap:14px;">
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Audit ID</label>
        <input class="inp" value="${esc(auditId)}" readonly></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">SPOC Email(s) *</label>
        <input id="disp-spoc" class="inp" placeholder="spoc@casagrand.co.in"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">HOD Email(s)</label>
        <input id="disp-hod" class="inp" placeholder="hod@casagrand.co.in"></div>
    </div>
  `;

  const m = modal('📤 Dispatch Audit', body);
  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn';
  sendBtn.textContent = '📧 Send & Start TAT';
  sendBtn.onclick = async () => {
    const spoc = (document.getElementById('disp-spoc') as HTMLInputElement)?.value.trim();
    if (!spoc) { toast('SPOC email required.', 'error'); return; }

    try {
      const token = crypto.randomUUID ? crypto.randomUUID() : btoa(String(Date.now()));
      await addDoc(collection(db, 'tasks'), {
        auditId,
        token,
        status: 'notified',
        spocMail: spoc,
        hodMail: (document.getElementById('disp-hod') as HTMLInputElement)?.value || '',
        notifiedAt: Date.now(),
        dueAt: Date.now() + TAT_HOURS * 3600000,
        findings: []
      });
      toast('Dispatched! TAT clock started.', 'success');
      m.remove();
      renderDispatch();
    } catch (err: any) {
      toast('Error: ' + err.message, 'error');
    }
  };
  m.querySelector('div:last-child')?.appendChild(sendBtn);
}

// ════════════════════════════════════════════════════════════════
// TAT TRACKER
// ════════════════════════════════════════════════════════════════

async function renderTracker() {
  mainContainer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">⏳ Loading...</div>';
  try {
    const snap = await getDocs(query(collection(db, 'tasks'), orderBy('notifiedAt', 'desc'), limit(100)));
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    const counts = {
      notified: tasks.filter(t => t.status === 'notified').length,
      pending: tasks.filter(t => t.status === 'pending' || (t.status === 'notified' && t.dueAt > Date.now())).length,
      overdue: tasks.filter(t => (t.status === 'pending' || t.status === 'notified') && t.dueAt < Date.now()).length,
      review: tasks.filter(t => t.status === 'review').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      closed: tasks.filter(t => t.status === 'closed').length
    };

    mainContainer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h2 style="font-size:20px;">🔔 TAT Tracker</h2>
        <button class="btn btn-outline" id="exportTatBtn">⬇ Export</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px;">
        ${Object.entries(counts).map(([k, v]) => `<div class="stat-card"><span style="font-size:11px;color:var(--muted);text-transform:capitalize;">${k}</span><strong style="font-size:22px;">${v}</strong></div>`).join('')}
      </div>
      <div style="background:var(--surface);border-radius:var(--radius2);padding:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:var(--surface2);">
            <th style="padding:10px;text-align:left;font-size:12px;">Dept</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Status</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Notified</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Due</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Actions</th>
          </tr></thead>
          <tbody>${tasks.slice(0, 50).map(t => {
            const dueStr = t.dueAt ? new Date(t.dueAt).toLocaleString() : '—';
            const remaining = t.dueAt ? Math.ceil((t.dueAt - Date.now()) / 3600000) : 0;
            return `<tr>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${esc(t.dept||t.auditId?.slice(-6)||'')}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);">${statusBadge(t.status)}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;">${new Date(t.notifiedAt).toLocaleDateString()}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;color:${remaining < 12 && remaining > 0 ? 'var(--amber)' : remaining <= 0 ? 'var(--red)' : 'inherit'}">${dueStr} ${remaining > 0 ? `(${remaining}h)` : ''}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);">
                ${t.status === 'review' ? `<button class="btn-sm" data-complete="${t.id}" style="background:var(--green);color:#fff;">✓ Complete</button>` : ''}
                ${t.status === 'completed' ? `<button class="btn-sm" data-close="${t.id}" style="background:var(--blue);color:#fff;">🔒 Close</button>` : ''}
              </td>
            </tr>`;
          }).join('') || '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--muted);">No tasks yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    mainContainer.querySelectorAll('[data-complete]').forEach(b => b.addEventListener('click', async (e: any) => {
      const id = e.target.dataset.complete;
      await updateDoc(doc(db, 'tasks', id), { status: 'completed', completedAt: Date.now() });
      toast('Marked completed.', 'success');
      renderTracker();
    }));
    mainContainer.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', async (e: any) => {
      const id = e.target.dataset.close;
      await updateDoc(doc(db, 'tasks', id), { status: 'closed', closedAt: Date.now() });
      toast('Closed.', 'success');
      renderTracker();
    }));
    document.getElementById('exportTatBtn')!.onclick = () => {
      downloadCSV('tat-report.csv', [['Dept','Status','Notified','Due'], ...tasks.map(t => [t.dept||'', t.status, new Date(t.notifiedAt).toISOString(), t.dueAt ? new Date(t.dueAt).toISOString() : ''])]);
    };
  } catch {}
}

// ════════════════════════════════════════════════════════════════
// RECORDS
// ════════════════════════════════════════════════════════════════

async function renderRecords() {
  mainContainer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">⏳ Loading...</div>';
  try {
    const snap = await getDocs(query(collection(db, 'audits'), orderBy('createdAt', 'desc'), limit(100)));
    const audits = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    mainContainer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h2 style="font-size:20px;">📁 Audit Records</h2>
        <div style="display:flex;gap:8px;">
          <select id="records-zone" class="inp" style="width:auto;"><option value="">All Zones</option>${ZONES.map(z => `<option value="${z}">${z}</option>`).join('')}</select>
          <button class="btn btn-outline" id="exportRecordsBtn">⬇ Export All</button>
        </div>
      </div>
      <div style="background:var(--surface);border-radius:var(--radius2);padding:20px;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;white-space:nowrap;">
          <thead><tr style="background:var(--surface2);">
            <th style="padding:10px;text-align:left;font-size:12px;">Audit ID</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Date</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Zone</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Dept</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Auditor</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Compliance</th>
            <th style="padding:10px;text-align:left;font-size:12px;">NC</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Obs</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Risk</th>
            <th style="padding:10px;text-align:left;font-size:12px;">CI</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Actions</th>
          </tr></thead>
          <tbody>${audits.map(a => {
            const fs = a.findings || [];
            return `<tr>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;">${esc(a.auditId?.slice(-6)||'—')}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;">${a.auditDate || '—'}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;">${esc(a.zone)}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;">${esc(a.dept)}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;">${esc(a.auditor)}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;font-weight:600;color:${a.compliancePct >= 70 ? 'var(--green)' : a.compliancePct >= 40 ? 'var(--amber)' : 'var(--red)'}">${a.compliancePct}%</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);color:var(--red);font-weight:600;">${fs.filter((f:any) => f.type === 't4').length}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);color:var(--amber);">${fs.filter((f:any) => f.type === 't2').length}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);color:var(--brand);">${fs.filter((f:any) => f.type === 't3').length}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);color:var(--green);">${fs.filter((f:any) => f.type === 't1').length}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);">
                <button class="btn-sm btn-outline" data-view="${a.id || a.auditId}">👁 View</button>
              </td>
            </tr>`;
          }).join('') || '<tr><td colspan="11" style="padding:20px;text-align:center;color:var(--muted);">No records yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('records-zone')!.onchange = () => { /* filter logic - simple client-side */ };
    document.getElementById('exportRecordsBtn')!.onclick = () => {
      downloadCSV('audit-records.csv', [
        ['Audit ID','Date','Zone','Dept','Auditor','Compliance%','NC','Obs','Risk','CI'],
        ...audits.map((a: any) => {
          const fs = a.findings || [];
          return [a.auditId||'', a.auditDate||'', a.zone, a.dept, a.auditor, a.compliancePct,
            fs.filter((f: any) => f.type==='t4').length, fs.filter((f: any) => f.type==='t2').length,
            fs.filter((f: any) => f.type==='t3').length, fs.filter((f: any) => f.type==='t1').length];
        })
      ]);
    };

    mainContainer.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => showAuditView((btn as HTMLElement).dataset.view!));
    });
  } catch {}
}

async function showAuditView(id: string) {
  try {
    const docSnap = await getDoc(doc(db, 'audits', id));
    if (!docSnap.exists()) { toast('Audit not found.', 'error'); return; }
    const a = docSnap.data() as AuditData;

    const fs = a.findings || [];
    const findingsHTML = fs.map((f, i) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px;">${i+1}</td>
        <td style="padding:8px;border-bottom:1px solid var(--border);"><span style="background:${FT[f.type]?.color||'#999'};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">${FT[f.type]?.badge||'?'}</span></td>
        <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px;">${esc(f.clause)}</td>
        <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px;">${esc(f.description)}</td>
      </tr>
    `).join('');

    modal('📄 Audit Report', `
      <div style="font-size:13px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div><strong>Dept:</strong> ${esc(a.dept)}</div>
          <div><strong>Zone:</strong> ${esc(a.zone)}</div>
          <div><strong>Auditor:</strong> ${esc(a.auditor)}</div>
          <div><strong>Date:</strong> ${a.auditDate}</div>
          <div><strong>Compliance:</strong> <span style="color:${a.compliancePct >= 70 ? 'var(--green)' : 'var(--red)'}">${a.compliancePct}%</span></div>
          <div><strong>Score:</strong> ${a.processScore}/1000</div>
        </div>
        <h4 style="font-size:14px;margin-bottom:8px;">Findings (${fs.length})</h4>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <thead><tr style="background:var(--surface2);">
            <th style="padding:8px;text-align:left;font-size:11px;">#</th>
            <th style="padding:8px;text-align:left;font-size:11px;">Type</th>
            <th style="padding:8px;text-align:left;font-size:11px;">Clause</th>
            <th style="padding:8px;text-align:left;font-size:11px;">Description</th>
          </tr></thead>
          <tbody>${findingsHTML || '<tr><td colspan="4" style="padding:12px;text-align:center;color:var(--muted);">No findings.</td></tr>'}</tbody>
        </table>
        ${a.openingMOM ? `<h4 style="font-size:14px;margin-bottom:4px;">Opening MOM</h4><p style="font-size:12px;color:var(--ink2);margin-bottom:12px;white-space:pre-wrap;">${esc(a.openingMOM)}</p>` : ''}
        ${a.closureMOM ? `<h4 style="font-size:14px;margin-bottom:4px;">Closure MOM</h4><p style="font-size:12px;color:var(--ink2);white-space:pre-wrap;">${esc(a.closureMOM)}</p>` : ''}
      </div>
    `);
  } catch {}
}

// ════════════════════════════════════════════════════════════════
// SPOC ACTIONS
// ════════════════════════════════════════════════════════════════

async function renderSPOCActions() {
  mainContainer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">⏳ Loading your action items...</div>';
  try {
    const snap = await getDocs(query(collection(db, 'tasks'), where('status', 'in', ['notified', 'pending', 'delayed', 'review', 'sent-back'])));
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    mainContainer.innerHTML = `
      <h2 style="font-size:20px;margin-bottom:20px;">📋 My Action Items</h2>
      ${tasks.length === 0 ? '<div style="background:var(--surface);padding:40px;border-radius:var(--radius2);text-align:center;color:var(--muted);">No open action items. ✅</div>' :
      `<div style="display:grid;gap:12px;">${tasks.map(t => `
        <div style="background:var(--surface);border-radius:var(--radius2);padding:20px;box-shadow:var(--sh1);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div>
              <strong style="font-size:14px;">${esc(t.auditId?.slice(-6)||'—')}</strong>
              <span style="font-size:12px;color:var(--muted);margin-left:8px;">${statusBadge(t.status)}</span>
            </div>
            <span style="font-size:12px;color:var(--muted);">Due: ${t.dueAt ? new Date(t.dueAt).toLocaleString() : '—'}</span>
          </div>
          ${t.findings?.length ? `<details><summary style="font-size:12px;cursor:pointer;color:var(--blue);margin-bottom:8px;">${t.findings.length} finding(s) to address</summary>
            <div style="margin-top:8px;">${t.findings.map((f: any) => `
              <div style="padding:8px;background:var(--surface2);border-radius:6px;margin-bottom:6px;font-size:12px;">
                <span style="background:${FT[f.type]?.color||'#999'};color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;">${FT[f.type]?.badge||f.type}</span>
                <strong>${esc(f.clause)}</strong>: ${esc(f.description)}
              </div>
            `).join('')}</div>
          </details>` : ''}
          ${t.status === 'sent-back' ? `<div style="padding:8px;background:var(--red-bg);border-radius:6px;font-size:12px;margin-bottom:8px;">↩ Sent back: ${esc(t.sentBackReason||'')}</div>` : ''}
          ${(t.status === 'notified' || t.status === 'pending' || t.status === 'sent-back') ?
            `<button class="btn" data-respond="${t.id}" style="background:var(--green);color:#fff;">✏️ Submit Response</button>` : ''}
        </div>
      `).join('')}</div>`}
    `;

    mainContainer.querySelectorAll('[data-respond]').forEach(btn => {
      btn.addEventListener('click', () => showSPOCResponse((btn as HTMLElement).dataset.respond!));
    });
  } catch {}
}

function showSPOCResponse(taskId: string) {
  const body = `
    <div style="display:grid;gap:14px;">
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Immediate Correction</label>
        <textarea id="resp-imm" class="inp" style="min-height:80px;" placeholder="Describe the immediate correction applied"></textarea></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Root Cause</label>
        <textarea id="resp-rc" class="inp" style="min-height:80px;" placeholder="Identify root cause"></textarea></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">CAPA</label>
        <textarea id="resp-capa" class="inp" style="min-height:80px;" placeholder="Corrective and Preventive Action plan"></textarea></div>
    </div>
  `;

  const m = modal('✏️ Submit Corrective Action', body);
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn';
  saveBtn.textContent = '✅ Submit Response';
  saveBtn.onclick = async () => {
    const imm = (document.getElementById('resp-imm') as HTMLTextAreaElement)?.value.trim();
    const rc = (document.getElementById('resp-rc') as HTMLTextAreaElement)?.value.trim();
    const capa = (document.getElementById('resp-capa') as HTMLTextAreaElement)?.value.trim();

    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        status: 'review',
        response: { imm, rc, capa, submittedAt: Date.now() }
      });
      toast('Response submitted!', 'success');
      m.remove();
      renderSPOCActions();
    } catch (err: any) {
      toast('Error: ' + err.message, 'error');
    }
  };
  m.querySelector('div:last-child')?.appendChild(saveBtn);
}

// ════════════════════════════════════════════════════════════════
// DEPARTMENTS
// ════════════════════════════════════════════════════════════════

function renderDepts() {
  mainContainer.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h2 style="font-size:20px;">🏢 Department Management</h2>
      <div style="display:flex;gap:8px;">
        <button class="btn" id="addDeptBtn">＋ Add Department</button>
        <button class="btn btn-outline" id="importDeptsBtn">⬆ Import CSV</button>
      </div>
    </div>
    <div style="background:var(--surface);border-radius:var(--radius2);padding:20px;overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:var(--surface2);">
          <th style="padding:10px;text-align:left;font-size:12px;">Ref</th>
          <th style="padding:10px;text-align:left;font-size:12px;">Department</th>
          <th style="padding:10px;text-align:left;font-size:12px;">Function</th>
          <th style="padding:10px;text-align:left;font-size:12px;">SPOC</th>
          <th style="padding:10px;text-align:left;font-size:12px;">Actions</th>
        </tr></thead>
        <tbody>${S.depts.map((d, i) => `
          <tr>
            <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${esc(d.ref)}</td>
            <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${esc(d.name)}</td>
            <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${esc(d.fn)}</td>
            <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;">${esc(d.spocName)}<br><span style="color:var(--muted);">${esc(d.spocMail)}</span></td>
            <td style="padding:10px;border-bottom:1px solid var(--border);">
              <button class="btn-sm btn-outline" data-edit-dept="${i}">✏️</button>
              <button class="btn-sm btn-outline" data-del-dept="${i}" style="color:var(--red);">🗑️</button>
            </td>
          </tr>
        `).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('addDeptBtn')!.onclick = showDeptModal;
  document.getElementById('importDeptsBtn')!.onclick = showImportModal;
  mainContainer.querySelectorAll('[data-edit-dept]').forEach(b => b.addEventListener('click', (e: any) => showDeptModal(parseInt(e.target.dataset.editDept))));
  mainContainer.querySelectorAll('[data-del-dept]').forEach(b => b.addEventListener('click', async (e: any) => {
    const idx = parseInt((e.target as HTMLElement).dataset.delDept!);
    if (!confirm(`Delete ${S.depts[idx].name}?`)) return;
    S.depts.splice(idx, 1);
    await saveDepts();
    toast('Deleted.', 'success');
    renderDepts();
  }));
}

function showDeptModal(idx?: number) {
  const d = idx !== undefined ? S.depts[idx] : { ref: '', name: '', fn: '', spocName: '', spocMail: '', hodMail: '' };
  const body = `
    <div style="display:grid;gap:14px;">
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Reference Code *</label>
        <input id="dept-ref" class="inp" value="${esc(d.ref)}" placeholder="e.g. D-001"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Department Name *</label>
        <input id="dept-name" class="inp" value="${esc(d.name)}"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Function / Sub-dept *</label>
        <input id="dept-fn" class="inp" value="${esc(d.fn)}"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">SPOC Name</label>
        <input id="dept-spoc-name" class="inp" value="${esc(d.spocName)}"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">SPOC Email(s)</label>
        <input id="dept-spoc" class="inp" value="${esc(d.spocMail)}"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">HOD Email(s)</label>
        <input id="dept-hod" class="inp" value="${esc(d.hodMail)}"></div>
    </div>
  `;

  const m = modal(idx !== undefined ? 'Edit Department' : 'Add Department', body);
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn';
  saveBtn.textContent = '💾 Save';
  saveBtn.onclick = async () => {
    const ref = (document.getElementById('dept-ref') as HTMLInputElement)?.value.trim();
    const name = (document.getElementById('dept-name') as HTMLInputElement)?.value.trim();
    const fn = (document.getElementById('dept-fn') as HTMLInputElement)?.value.trim();
    if (!ref || !name || !fn) { toast('Ref, Name, Function required.', 'error'); return; }

    const newDept: DeptData = {
      ref, name, fn,
      spocName: (document.getElementById('dept-spoc-name') as HTMLInputElement)?.value || '',
      spocMail: (document.getElementById('dept-spoc') as HTMLInputElement)?.value || '',
      hodMail: (document.getElementById('dept-hod') as HTMLInputElement)?.value || ''
    };

    if (idx !== undefined) S.depts[idx] = newDept;
    else S.depts.push(newDept);

    await saveDepts();
    toast('Saved!', 'success');
    m.remove();
    renderDepts();
  };
  m.querySelector('div:last-child')?.appendChild(saveBtn);
}

function showImportModal() {
  modal('⬆ Import Departments from CSV', `
    <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">CSV format (header row is skipped):<br><code style="background:var(--surface2);padding:4px 8px;border-radius:4px;font-size:11px;">Ref,Department,Function,SpocName,SpocMail,HodMail</code></p>
    <textarea id="csv-input" class="inp" style="min-height:200px;font-family:monospace;font-size:12px;" placeholder="Paste CSV data here..."></textarea>
    <button class="btn" id="csv-import-btn" style="margin-top:12px;">⬆ Import Now</button>
  `);
  document.getElementById('csv-import-btn')!.onclick = async () => {
    const raw = (document.getElementById('csv-input') as HTMLTextAreaElement)?.value.trim();
    if (!raw) { toast('Paste CSV data first.', 'error'); return; }
    const lines = raw.split('\n').slice(1); // skip header
    for (const line of lines) {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length >= 3) {
        S.depts.push({
          ref: cols[0], name: cols[1], fn: cols[2],
          spocName: cols[3] || '', spocMail: cols[4] || '', hodMail: cols[5] || ''
        });
      }
    }
    await saveDepts();
    toast(`Imported ${lines.length} departments.`, 'success');
    document.getElementById('modal-overlay')?.remove();
    renderDepts();
  };
}

async function saveDepts() {
  try {
    await setDoc(doc(db, 'config', 'main'), { depts: S.depts, updatedAt: Date.now() }, { merge: true });
  } catch {}
}

// ════════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════════

async function renderUsers() {
  mainContainer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">⏳ Loading...</div>';
  try {
    const snap = await getDocs(collection(db, 'users'));
    const users = snap.docs.map(d => d.data() as UserData);

    mainContainer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h2 style="font-size:20px;">👥 User Management</h2>
        <button class="btn" id="addUserBtn">＋ Add User</button>
      </div>
      <div style="background:var(--surface);border-radius:var(--radius2);padding:20px;overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:var(--surface2);">
            <th style="padding:10px;text-align:left;font-size:12px;">Name</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Username</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Role</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Zone</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Depts</th>
            <th style="padding:10px;text-align:left;font-size:12px;">Actions</th>
          </tr></thead>
          <tbody>${users.map(u => `
            <tr>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${esc(u.name)}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;color:var(--muted);">${esc(u.username)}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);"><span style="background:${u.role === 'admin' ? '#7C3AED' : u.role === 'auditor' ? '#3B82F6' : '#059669'};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">${esc(u.role)}</span></td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;">${esc(u.zone)}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;">${esc((u.depts||[]).join(', '))}</td>
              <td style="padding:10px;border-bottom:1px solid var(--border);">
                ${u.uid !== S.user?.uid ? `<button class="btn-sm btn-outline" data-del-user="${u.uid}" style="color:var(--red);">🗑️</button>` : ''}
              </td>
            </tr>
          `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('addUserBtn')!.onclick = showUserModal;
    mainContainer.querySelectorAll('[data-del-user]').forEach(b => b.addEventListener('click', async (e: any) => {
      const uid = (e.target as HTMLElement).dataset.delUser!;
      if (!confirm('Delete this user? Their Firebase Auth account will remain but Firestore data is removed.')) return;
      try {
        await deleteDoc(doc(db, 'users', uid));
        toast('User deleted.', 'success');
        renderUsers();
      } catch (err: any) {
        toast('Error: ' + err.message, 'error');
      }
    }));
  } catch {}
}

function showUserModal() {
  const deptOpts = S.depts.map(d => `<option value="${esc(d.ref)}">${esc(d.name)}</option>`).join('');
  const body = `
    <div style="display:grid;gap:14px;">
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Full Name *</label>
        <input id="usr-name" class="inp" placeholder="John Doe"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Email *</label>
        <input id="usr-email" type="email" class="inp" placeholder="user@casagrand.co.in"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Password *</label>
        <input id="usr-pass" type="password" class="inp" placeholder="Min 6 characters"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Role *</label>
        <select id="usr-role" class="inp"><option value="auditor">Auditor</option><option value="spoc">SPOC</option><option value="admin">Admin</option></select></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Zone</label>
        <select id="usr-zone" class="inp">${ZONES.map(z => `<option value="${z}">${z}</option>`).join('')}<option value="All Zones">All Zones</option></select></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Assigned Dept Refs</label>
        <select id="usr-depts" class="inp" multiple style="min-height:80px;">${deptOpts}</select>
        <span style="font-size:11px;color:var(--muted);">Ctrl+click to select multiple</span>
      </div>
    </div>
  `;

  const m = modal('👤 Add User', body);
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn';
  saveBtn.textContent = '💾 Save User';
  saveBtn.onclick = async () => {
    const name = (document.getElementById('usr-name') as HTMLInputElement)?.value.trim();
    const email = (document.getElementById('usr-email') as HTMLInputElement)?.value.trim();
    const pass = (document.getElementById('usr-pass') as HTMLInputElement)?.value;
    if (!name || !email || !pass) { toast('Name, email, password required.', 'error'); return; }
    if (pass.length < 6) { toast('Password min 6 characters.', 'error'); return; }

    const role = (document.getElementById('usr-role') as HTMLSelectElement)?.value as Role;
    const zone = (document.getElementById('usr-zone') as HTMLSelectElement)?.value;
    const deptSelect = document.getElementById('usr-depts') as HTMLSelectElement;
    const depts = deptSelect ? Array.from(deptSelect.selectedOptions).map(o => o.value) : [];

    const err = await createUserAccount(email, pass, { name, username: email.split('@')[0], role, zone: zone as any, depts, spocMail: email });
    if (err) { toast(err, 'error'); return; }
    toast('User created!', 'success');
    m.remove();
    renderUsers();
  };
  m.querySelector('div:last-child')?.appendChild(saveBtn);
}

// ════════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════════

async function renderSettings() {
  mainContainer.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">⏳ Loading...</div>';
  let config: any = {};
  try {
    const snap = await getDoc(doc(db, 'config', 'main'));
    if (snap.exists()) config = snap.data();
  } catch {}

  mainContainer.innerHTML = `
    <h2 style="font-size:20px;margin-bottom:20px;">⚙ Settings</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="background:var(--surface);border-radius:var(--radius2);padding:24px;">
        <h3 style="font-size:15px;margin-bottom:16px;">📧 Email / GAS Webhook</h3>
        <div><label style="font-size:12px;font-weight:600;color:var(--muted);display:block;margin-bottom:4px;">Google Apps Script Web App URL</label>
          <input id="set-gas" class="inp" value="${esc(config.gasUrl||'')}" placeholder="https://script.google.com/macros/s/..."></div>
        <button id="saveGasBtn" class="btn" style="margin-top:12px;">💾 Save</button>
      </div>
      <div style="background:var(--surface);border-radius:var(--radius2);padding:24px;">
        <h3 style="font-size:15px;margin-bottom:16px;">🗄️ Data Management</h3>
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">Total departments: ${S.depts.length}</p>
        <button id="seedBtn" class="btn btn-outline" style="margin-bottom:8px;">🌱 Seed Sample Data</button>
        <p style="font-size:11px;color:var(--muted);">Creates sample departments if empty.</p>
      </div>
    </div>
  `;

  document.getElementById('saveGasBtn')!.onclick = async () => {
    const gasUrl = (document.getElementById('set-gas') as HTMLInputElement)?.value.trim();
    try {
      await setDoc(doc(db, 'config', 'main'), { gasUrl, updatedAt: Date.now() }, { merge: true });
      toast('Settings saved.', 'success');
    } catch (err: any) {
      toast('Error: ' + err.message, 'error');
    }
  };

  document.getElementById('seedBtn')!.onclick = async () => {
    if (S.depts.length > 0) { toast('Departments already exist.', 'info'); return; }
    const sampleDepts: DeptData[] = [
      { ref:'CS-001', name:'Customer Support', fn:'Operations', spocName:'Rajesh K', spocMail:'rajesh@casagrand.co.in', hodMail:'hod-cs@casagrand.co.in' },
      { ref:'FN-001', name:'Finance', fn:'Accounts', spocName:'Priya S', spocMail:'priya@casagrand.co.in', hodMail:'hod-fn@casagrand.co.in' },
      { ref:'HR-001', name:'Human Resources', fn:'Admin', spocName:'Anita M', spocMail:'anita@casagrand.co.in', hodMail:'hod-hr@casagrand.co.in' },
      { ref:'IT-001', name:'Information Technology', fn:'Infra', spocName:'Suresh R', spocMail:'suresh@casagrand.co.in', hodMail:'hod-it@casagrand.co.in' },
      { ref:'LG-001', name:'Legal', fn:'Compliance', spocName:'Vikram G', spocMail:'vikram@casagrand.co.in', hodMail:'hod-lg@casagrand.co.in' },
      { ref:'OP-001', name:'Operations', fn:'Site Ops', spocName:'Manoj K', spocMail:'manoj@casagrand.co.in', hodMail:'hod-op@casagrand.co.in' }
    ];
    S.depts = sampleDepts;
    await saveDepts();
    toast('Sample departments seeded!', 'success');
    renderSettings();
  };
}

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════

export async function init() {
  initShell();

  // Show loading immediately so page isn't blank
  const loginScreen = document.getElementById('login-screen')!;
  loginScreen.innerHTML = `
    <div style="position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0F172A 0%,#1E293B 40%,#C8401A15 100%);">
      <div style="text-align:center;color:#fff;">
        <div style="font-size:32px;margin-bottom:12px;">🔍</div>
        <div style="font-size:14px;opacity:.7;">Loading...</div>
      </div>
    </div>
  `;

  // Check first run (async, won't block loading screen render)
  const firstRun = await isFirstRun();
  if (firstRun) {
    renderFirstRun();
  } else {
    renderLogin();
  }

  // Listen for auth changes
  onAuthChange(async (user) => {
    if (user) {
      // Load departments
      try {
        const configSnap = await getDoc(doc(db, 'config', 'main'));
        if (configSnap.exists()) {
          S.depts = configSnap.data().depts || [];
        }
      } catch {}

      // Show app shell
      hide('login-screen');
      document.getElementById('app-shell')!.style.display = 'flex';
      document.getElementById('app-shell')!.style.flexDirection = 'column';

      renderHeader(user);
      renderNav(user);
      renderPage(S.page);
    } else {
      // Check if first run again (setup might have been completed)
      const fr = await isFirstRun();
      if (fr && !document.getElementById('setupForm')) {
        renderFirstRun();
      } else if (!fr && !document.getElementById('loginForm')) {
        renderLogin();
      }
    }
  });
}

// Auto-start
init();
