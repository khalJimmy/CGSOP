import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { S } from './state.js';
import { FT, SCORING, ZONES, MONTHS, TOTAL_SCORE } from './constants.js';
import { Finding, FindingType, AuditData } from './types.js';
import { esc, toast, dropdown } from './ui.js';

let step = 1;
const MAX_STEPS = 6;
let auditData: any = {};
let findings: Finding[] = [];
let scores: Record<string, number> = {};
let editingFinding: string | null = null;

export function renderAuditForm(container: HTMLElement) {
  step = 1;
  findings = [];
  scores = {};
  auditData = {};
  editingFinding = null;
  renderStep(container);
}

function renderStep(container: HTMLElement) {
  container.innerHTML = `
    <div style="max-width:900px;margin:0 auto;">
      <div style="display:flex;gap:4px;margin-bottom:24px;background:var(--surface);padding:12px;border-radius:var(--radius2);">
        ${['Audit Summary','Opening MOM','Findings','Scoring','Closure','Submit'].map((s, i) => `
          <div style="flex:1;text-align:center;padding:8px;border-radius:6px;font-size:12px;font-weight:600;
            ${i+1 === step ? 'background:var(--brand);color:#fff;' : i+1 < step ? 'background:var(--green-bg);color:var(--green);' : 'background:var(--surface2);color:var(--muted);'}">
            ${i+1 < step ? '✓' : i+1}. ${s}
          </div>
        `).join('')}
      </div>
      <div style="background:var(--surface);border-radius:var(--radius3);padding:32px;box-shadow:var(--sh1);">
        ${getStepContent()}
      </div>
      <div style="display:flex;gap:12px;margin-top:16px;justify-content:space-between;">
        <div>${step > 1 ? '<button class="btn btn-outline" id="prevBtn">← Back</button>' : ''}</div>
        <div>${step < MAX_STEPS ? '<button class="btn" id="nextBtn">Next →</button>' : ''}</div>
      </div>
    </div>
  `;

  document.getElementById('prevBtn')?.addEventListener('click', () => { step--; renderStep(container); });
  document.getElementById('nextBtn')?.addEventListener('click', () => {
    if (validateStep()) { step++; renderStep(container); }
  });

  bindStepEvents(container);
}

function getStepContent(): string {
  switch (step) {
    case 1: return step1HTML();
    case 2: return step2HTML();
    case 3: return step3HTML();
    case 4: return step4HTML();
    case 5: return step5HTML();
    case 6: return step6HTML();
    default: return '';
  }
}

// ── Step 1: Audit Summary ──
function step1HTML(): string {
  const deptOpts = S.depts.map(d => `<option value="${esc(d.ref)}">${esc(d.name)} (${esc(d.fn)})</option>`).join('');
  return `
    <h3 style="font-size:18px;margin-bottom:20px;">📋 Audit Summary</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Dept / Function Ref *</label>
        <select id="f-dept" class="inp">${deptOpts}</select></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Month *</label>
        <select id="f-month" class="inp">${dropdown(MONTHS.map(m=>({value:m,label:m})), auditData.month||'')}</select></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Plan Date *</label>
        <input id="f-pdate" type="date" class="inp" value="${auditData.planDate||''}"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Zone *</label>
        <select id="f-zone" class="inp">${dropdown(ZONES.map(z=>({value:z,label:z})), auditData.zone||S.user?.zone||'')}</select></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Auditor</label>
        <input id="f-auditor" class="inp" value="${auditData.auditor||S.user?.name||''}" readonly style="background:var(--surface2);"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Audit Date *</label>
        <input id="f-adate" type="date" class="inp" value="${auditData.auditDate||''}"></div>
    </div>
  `;
}

// ── Step 2: Opening MOM ──
function step2HTML(): string {
  return `
    <h3 style="font-size:18px;margin-bottom:20px;">📝 Opening MOM</h3>
    <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Meeting Minutes / Notes *</label>
      <textarea id="f-mom" class="inp" style="min-height:200px;resize:vertical;" placeholder="Record opening meeting minutes, attendees, scope…">${esc(auditData.openingMOM||'')}</textarea></div>
  `;
}

// ── Step 3: Findings ──
function step3HTML(): string {
  const findingRows = findings.map((f, i) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid var(--border);"><span style="background:${FT[f.type].color};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">${FT[f.type].badge}</span></td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:13px;">${esc(f.clause)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:13px;">${esc(f.description)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);">
        <button class="btn-sm btn-outline" data-edit="${i}">✏️</button>
        <button class="btn-sm btn-outline" data-del="${i}" style="color:var(--red);">🗑️</button>
      </td>
    </tr>
  `).join('');

  return `
    <h3 style="font-size:18px;margin-bottom:20px;">🔍 Findings Entry</h3>
    <p style="font-size:12px;color:var(--muted);margin-bottom:16px;">
      <span style="background:${FT.t1.color};color:#fff;padding:2px 8px;border-radius:4px;">CI</span> = CI / No Finding &nbsp;
      <span style="background:${FT.t2.color};color:#fff;padding:2px 8px;border-radius:4px;">Ob</span> = Observation &nbsp;
      <span style="background:${FT.t3.color};color:#fff;padding:2px 8px;border-radius:4px;">Ri</span> = Risk &nbsp;
      <span style="background:${FT.t4.color};color:#fff;padding:2px 8px;border-radius:4px;">NC</span> = Non-Conformance
    </p>
    <button class="btn" id="addFindingBtn" style="margin-bottom:16px;">＋ Add Finding</button>
    ${findings.length ? `
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:var(--surface2);">
        <th style="padding:8px;text-align:left;font-size:12px;">Type</th>
        <th style="padding:8px;text-align:left;font-size:12px;">Clause</th>
        <th style="padding:8px;text-align:left;font-size:12px;">Description</th>
        <th style="padding:8px;text-align:left;font-size:12px;">Actions</th>
      </tr></thead>
      <tbody>${findingRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:var(--muted);">No findings added.</td></tr>'}</tbody>
    </table>` : '<p style="color:var(--muted);font-size:13px;">No findings yet. Click above to add.</p>'}
  `;
}

function bindStepEvents(container: HTMLElement) {
  if (step === 1) bindStep1();
  if (step === 3) bindStep3(container);
  if (step === 4) bindStep4();
  if (step === 6) bindStep6(container);
}

function bindStep1() {
  ['f-dept','f-month','f-pdate','f-zone','f-adate'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', (e: any) => {
      auditData[id.replace('f-','')] = e.target.value;
    });
  });
}

function bindStep3(container: HTMLElement) {
  document.getElementById('addFindingBtn')?.addEventListener('click', () => showFindingModal(container));
  container.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', (e: any) => {
    const idx = parseInt(e.target.dataset.edit);
    showFindingModal(container, findings[idx], idx);
  }));
  container.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', (e: any) => {
    const idx = parseInt(e.target.dataset.del);
    findings.splice(idx, 1);
    renderStep(container);
  }));
}

function showFindingModal(container: HTMLElement, finding?: Finding, idx?: number) {
  editingFinding = idx !== undefined ? String(idx) : null;
  const f = finding || { type: 't1' as FindingType, clause: '', description: '', details: '' };
  const typeOpts = Object.entries(FT).map(([k, v]) =>
    `<option value="${k}"${k === f.type ? ' selected' : ''}>${v.label}</option>`
  ).join('');

  const extraFields = FT[f.type]?.fields || [];
  const extraHTML = extraFields.map(fld => `
    <div><label style="font-size:12px;font-weight:600;color:var(--muted);">${fld === 'imm' ? 'Immediate Correction' : fld === 'rc' ? 'Root Cause' : fld === 'capa' ? 'CAPA' : 'Mitigation Plan'}</label>
    <textarea class="inp fm-${fld}" style="min-height:60px;">${esc((f as any)[fld]||'')}</textarea></div>
  `).join('');

  const body = `
    <div style="display:grid;gap:12px;">
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Finding Type *</label>
        <select id="fm-type" class="inp">${typeOpts}</select></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Clause / Ref *</label>
        <input id="fm-clause" class="inp" value="${esc(f.clause)}"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Description *</label>
        <textarea id="fm-desc" class="inp" style="min-height:80px;">${esc(f.description)}</textarea></div>
      ${extraHTML}
    </div>
  `;

  const m = modal('Finding Entry', body);
  m.querySelector('#fm-type')?.addEventListener('change', (e: any) => {
    // Re-render modal with new type's extra fields
    const updatedFinding = {
      type: e.target.value as FindingType,
      clause: (document.getElementById('fm-clause') as HTMLInputElement)?.value || '',
      description: (document.getElementById('fm-desc') as HTMLTextAreaElement)?.value || ''
    };
    m.remove();
    showFindingModal(container, updatedFinding, idx);
  });

  // Save button
  const content = m.querySelector('div:last-child');
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn';
  saveBtn.textContent = idx !== undefined ? 'Update Finding' : 'Add Finding';
  saveBtn.style.marginTop = '16px';
  saveBtn.onclick = () => {
    const type = (document.getElementById('fm-type') as HTMLSelectElement)?.value as FindingType;
    const clause = (document.getElementById('fm-clause') as HTMLInputElement)?.value.trim();
    const description = (document.getElementById('fm-desc') as HTMLTextAreaElement)?.value.trim();
    if (!clause || !description) { toast('Clause and description required.', 'error'); return; }

    const newFinding: Finding = {
      id: finding?.id || String(Date.now()),
      type,
      clause,
      description,
      details: ''
    };
    // Add extra fields
    (FT[type]?.fields || []).forEach(fld => {
      const el = m.querySelector(`.fm-${fld}`) as HTMLTextAreaElement;
      if (el) (newFinding as any)[fld] = el.value.trim();
    });

    if (editingFinding !== null) {
      findings[parseInt(editingFinding)] = newFinding;
    } else {
      findings.push(newFinding);
    }
    m.remove();
    renderStep(container);
  };
  content?.appendChild(saveBtn);
}

// ── Step 4: Scoring ──
function step4HTML(): string {
  const scoreRows = SCORING.map(s => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;">${esc(s.label)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:13px;font-weight:600;">/${s.max}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);">
        <input type="number" class="inp sc-${s.id}" min="0" max="${s.max}" value="${scores[s.id]||''}" style="width:100px;" placeholder="0">
      </td>
    </tr>
  `).join('');

  const total = Object.values(scores).reduce((a, b) => a + (b || 0), 0);
  const pct = Math.round((total / TOTAL_SCORE) * 100);

  return `
    <h3 style="font-size:18px;margin-bottom:20px;">📊 Compliance Scoring</h3>
    <p style="font-size:12px;color:var(--muted);margin-bottom:16px;">Score out of ${TOTAL_SCORE} points</p>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:var(--surface2);">
        <th style="padding:10px;text-align:left;font-size:12px;">Parameter</th>
        <th style="padding:10px;text-align:left;font-size:12px;">Max</th>
        <th style="padding:10px;text-align:left;font-size:12px;">Score</th>
      </tr></thead>
      <tbody>${scoreRows}</tbody>
    </table>
    <div style="margin-top:20px;padding:16px;background:var(--surface2);border-radius:var(--radius);text-align:center;">
      <strong style="font-size:24px;">${total}</strong><span style="color:var(--muted);font-size:14px;">/${TOTAL_SCORE}</span>
      <span style="margin-left:16px;font-size:14px;">Compliance: <strong>${pct}%</strong></span>
    </div>
  `;
}

function bindStep4() {
  SCORING.forEach(s => {
    document.querySelector(`.sc-${s.id}`)?.addEventListener('input', (e: any) => {
      const val = parseInt(e.target.value);
      scores[s.id] = isNaN(val) ? 0 : Math.min(val, s.max);
      // Re-render score display
      const total = Object.values(scores).reduce((a, b) => a + (b || 0), 0);
      const pct = Math.round((total / TOTAL_SCORE) * 100);
      const el = document.querySelector('#step4-total');
      if (el) el.innerHTML = `<strong style="font-size:24px;">${total}</strong><span style="color:var(--muted);font-size:14px;">/${TOTAL_SCORE}</span><span style="margin-left:16px;font-size:14px;">Compliance: <strong>${pct}%</strong></span>`;
    });
  });
}

// ── Step 5: Closure MOM ──
function step5HTML(): string {
  return `
    <h3 style="font-size:18px;margin-bottom:20px;">📝 Closure MOM</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Closure Date</label>
        <input id="f-cdate" type="date" class="inp" value="${auditData.closureDate||''}"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Auditee SPOC</label>
        <input id="f-spoc" class="inp" value="${auditData.auditeeSPOC||''}"></div>
    </div>
    <div style="margin-bottom:16px;"><label style="font-size:12px;font-weight:600;color:var(--muted);">Closure Summary</label>
      <textarea id="f-csummary" class="inp" style="min-height:100px;">${esc(auditData.closureSummary||'')}</textarea></div>
    <div style="margin-bottom:16px;"><label style="font-size:12px;font-weight:600;color:var(--muted);">Auditee Response / Agreed Actions</label>
      <textarea id="f-aresponse" class="inp" style="min-height:80px;">${esc(auditData.auditeeResponse||'')}</textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">Auditor Sign</label>
        <input id="f-asign" class="inp" value="${auditData.auditorSign||S.user?.name||''}"></div>
      <div><label style="font-size:12px;font-weight:600;color:var(--muted);">HOD Approval</label>
        <input id="f-hod" class="inp" value="${auditData.hodApproval||''}"></div>
    </div>
  `;
}

// ── Step 6: Submit ──
function step6HTML(): string {
  const total = Object.values(scores).reduce((a, b) => a + (b || 0), 0);
  const pct = Math.round((total / TOTAL_SCORE) * 100);
  const ncs = findings.filter(f => f.type === 't4').length;
  const obs = findings.filter(f => f.type === 't2').length;
  const risks = findings.filter(f => f.type === 't3').length;
  const cis = findings.filter(f => f.type === 't1').length;

  return `
    <h3 style="font-size:18px;margin-bottom:20px;">✅ Submit & Publish</h3>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
      <div style="text-align:center;padding:16px;background:var(--red-bg);border-radius:var(--radius);"><strong style="color:var(--red);font-size:20px;">${ncs}</strong><br><span style="font-size:11px;color:var(--muted);">NC</span></div>
      <div style="text-align:center;padding:16px;background:var(--amber-bg);border-radius:var(--radius);"><strong style="color:var(--amber);font-size:20px;">${obs}</strong><br><span style="font-size:11px;color:var(--muted);">Observations</span></div>
      <div style="text-align:center;padding:16px;background:#FFF7ED;border-radius:var(--radius);"><strong style="color:var(--brand);font-size:20px;">${risks}</strong><br><span style="font-size:11px;color:var(--muted);">Risks</span></div>
      <div style="text-align:center;padding:16px;background:var(--green-bg);border-radius:var(--radius);"><strong style="color:var(--green);font-size:20px;">${cis}</strong><br><span style="font-size:11px;color:var(--muted);">CI</span></div>
    </div>
    <div style="text-align:center;padding:20px;background:var(--blue-bg);border-radius:var(--radius);margin-bottom:24px;">
      <span style="font-size:12px;color:var(--muted);">Compliance Score</span>
      <div><strong style="font-size:36px;color:var(--blue);">${pct}%</strong></div>
      <span style="font-size:12px;color:var(--muted);">${total}/${TOTAL_SCORE} points</span>
    </div>
    <div style="margin-bottom:16px;"><label style="font-size:12px;font-weight:600;color:var(--muted);">Prepared By</label>
      <input id="f-prep" class="inp" value="${auditData.preparedBy||S.user?.name||''}"></div>
    <div style="margin-bottom:16px;"><label style="font-size:12px;font-weight:600;color:var(--muted);">Approved By</label>
      <input id="f-approx" class="inp" value="${auditData.approvedBy||''}"></div>
    <p style="font-size:12px;color:var(--amber);margin-bottom:16px;">⚠ After submit → Admin must go to Dispatch to send the report to the department and start the 72-hour response clock.</p>
    <button class="btn" id="submitAuditBtn" style="background:var(--green);width:100%;padding:14px;">✅ Submit Report</button>
  `;
}

function bindStep6(container: HTMLElement) {
  document.getElementById('submitAuditBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('submitAuditBtn') as HTMLButtonElement;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = '⏳ Submitting...';

    // Gather all data
    const deptEl = document.getElementById('f-dept') as HTMLSelectElement;
    const selectedDept = S.depts.find(d => d.ref === deptEl?.value);

    const auditDataFinal: AuditData = {
      auditId: '',
      ref: selectedDept?.ref || '',
      dept: selectedDept?.name || '',
      fn: selectedDept?.fn || '',
      zone: (document.getElementById('f-zone') as HTMLSelectElement)?.value as any || S.user?.zone,
      month: (document.getElementById('f-month') as HTMLSelectElement)?.value || '',
      planDate: (document.getElementById('f-pdate') as HTMLInputElement)?.value || '',
      auditor: S.user?.name || '',
      auditorUid: S.user?.uid || '',
      auditDate: (document.getElementById('f-adate') as HTMLInputElement)?.value || '',
      openingMOM: (document.getElementById('f-mom') as HTMLTextAreaElement)?.value || '',
      findings,
      compliancePct: Math.round((Object.values(scores).reduce((a,b)=>a+(b||0),0) / TOTAL_SCORE) * 100),
      processScore: Object.values(scores).reduce((a,b)=>a+(b||0),0),
      closureMOM: '',
      closureDate: (document.getElementById('f-cdate') as HTMLInputElement)?.value || '',
      auditeeSPOC: (document.getElementById('f-spoc') as HTMLInputElement)?.value || '',
      closureSummary: (document.getElementById('f-csummary') as HTMLTextAreaElement)?.value || '',
      auditeeResponse: (document.getElementById('f-aresponse') as HTMLTextAreaElement)?.value || '',
      auditorSign: (document.getElementById('f-asign') as HTMLInputElement)?.value || '',
      hodApproval: (document.getElementById('f-hod') as HTMLInputElement)?.value || '',
      preparedBy: (document.getElementById('f-prep') as HTMLInputElement)?.value || '',
      approvedBy: (document.getElementById('f-approx') as HTMLInputElement)?.value || '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      const docRef = await addDoc(collection(db, 'audits'), auditDataFinal);
      await updateDoc(doc(db, 'audits', docRef.id), { auditId: docRef.id });
      toast('Audit submitted successfully!', 'success');
      setTimeout(() => {
        // Navigate to dashboard
        document.querySelector('[data-page="dashboard"]')?.dispatchEvent(new Event('click'));
      }, 1500);
    } catch (err: any) {
      toast('Failed to submit: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = '✅ Submit Report';
    }
  });
}

function validateStep(): boolean {
  if (step === 1) {
    const dept = document.getElementById('f-dept') as HTMLSelectElement;
    const pdate = document.getElementById('f-pdate') as HTMLInputElement;
    const adate = document.getElementById('f-adate') as HTMLInputElement;
    if (!dept?.value || !pdate?.value || !adate?.value) {
      toast('Please fill required fields (Dept, Plan Date, Audit Date).', 'error');
      return false;
    }
    auditData.dept = dept.value;
    auditData.planDate = pdate.value;
    auditData.auditDate = adate.value;
    auditData.zone = (document.getElementById('f-zone') as HTMLSelectElement)?.value;
    auditData.month = (document.getElementById('f-month') as HTMLSelectElement)?.value;
    return true;
  }
  if (step === 2) {
    const mom = document.getElementById('f-mom') as HTMLTextAreaElement;
    if (!mom?.value?.trim()) { toast('Please enter Opening MOM notes.', 'error'); return false; }
    auditData.openingMOM = mom.value;
    return true;
  }
  if (step === 3) {
    if (findings.length === 0) { toast('Add at least one finding.', 'error'); return false; }
    return true;
  }
  if (step === 4) {
    if (Object.keys(scores).length === 0) { toast('Please enter scores.', 'error'); return false; }
    return true;
  }
  if (step === 5) {
    return true; // closure is optional
  }
  return true;
}

// Used by other modules
export function getFindings() { return findings; }
export function resetFindings() { findings = []; }
