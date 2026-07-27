import { FindingField, Role, NavPage } from './types.js';

// ── Finding Types ──
export const FT: Record<string, FindingField> = {
  t1: { type: 't1', label: 'CI / No Finding', color: '#059669', badge: 'bg', hint: 'Type 1 — Continuous Improvement or No Finding. No corrective action required. Acknowledge only.', fields: [] },
  t2: { type: 't2', label: 'Observation', color: '#d97706', badge: 'by', hint: 'Type 2 — Observation. SPOC must submit: Immediate Correction + Root Cause + CAPA within 72 hours.', fields: ['imm', 'rc', 'capa'] },
  t3: { type: 't3', label: 'Risk', color: '#C8401A', badge: 'bo', hint: 'Type 3 — Risk (Financial / Compliance / Process). SPOC must submit a Mitigation Plan within 72 hours.', fields: ['mitigation'], sub: true },
  t4: { type: 't4', label: 'Non-Conformance', color: '#DC2626', badge: 'br', hint: 'Type 4 — NC (Non-Conformance). SPOC must submit Immediate Correction + Root Cause + CAPA. Escalation triggered if overdue.', fields: ['imm', 'rc', 'capa'] }
};

// ── Role → Page navigation mapping ──
export const NAVMAP: Record<Role, NavPage[]> = {
  admin: ['dashboard', 'planner', 'audit', 'dispatch', 'tracker', 'records', 'depts', 'users', 'settings'],
  auditor: ['dashboard', 'audit', 'records'],
  spoc: ['actions']
};

export const NAVLABELS: Record<NavPage, string> = {
  dashboard: '📊 Dashboard',
  planner: '📅 Planner',
  audit: '✍ Audit',
  dispatch: '📤 Dispatch',
  tracker: '🔔 TAT Tracker',
  records: '📁 Records',
  actions: '📋 My Actions',
  depts: '🏢 Departments',
  users: '👥 Users',
  settings: '⚙ Settings'
};

// ── Zones ──
export const ZONES = ['Chennai', 'Coimbatore', 'Bangalore'] as const;

// ── Months ──
export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── TAT ──
export const TAT_HOURS = 72;
export const WARN_HOURS = 12;

// ── Rate limits ──
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MINUTES = 30;
export const MIN_WRITE_INTERVAL_MS = 1000;

// ── Scoring ──
export const P1_MAX = 100;
export const P2_MAX = 100;
export const P3_MAX = 100;
export const P4_MAX = 100;
export const P5_MAX = 100;
export const P6_MAX = 150;
export const P7_MAX = 350;
export const TOTAL_SCORE = 1000;

// ── Scoring categories (P1-P7) ──
export const SCORING: { id: string; label: string; max: number }[] = [
  { id: 'p1', label: 'Schedule Adherence', max: 100 },
  { id: 'p2', label: 'Document Compliance', max: 100 },
  { id: 'p3', label: 'Process Adherence', max: 100 },
  { id: 'p4', label: 'Quality Compliance', max: 100 },
  { id: 'p5', label: 'Safety Compliance', max: 100 },
  { id: 'p6', label: 'NC Closure Effectiveness', max: 150 },
  { id: 'p7', label: 'Risk Mitigation', max: 350 }
];
