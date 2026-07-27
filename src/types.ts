export type Role = 'admin' | 'auditor' | 'spoc';
export type Zone = 'Chennai' | 'Coimbatore' | 'Bangalore';
export type FindingType = 't1' | 't2' | 't3' | 't4';
export type TaskStatus = 'notified' | 'pending' | 'delayed' | 'review' | 'sent-back' | 'completed' | 'closed';
export type NavPage = 'dashboard' | 'planner' | 'audit' | 'dispatch' | 'tracker' | 'records' | 'actions' | 'depts' | 'users' | 'settings';

export interface FindingField {
  type: FindingType;
  label: string;
  color: string;
  badge: string;
  hint: string;
  fields: string[];
  sub?: boolean;
}

export interface UserData {
  uid: string;
  name: string;
  username: string;
  role: Role;
  zone: Zone | 'All Zones';
  depts: string[];
  spocMail?: string;
  hodMail?: string;
  createdAt: number;
  lastWrite?: number;
}

export interface Finding {
  id: string;
  type: FindingType;
  clause: string;
  description: string;
  details: string;
  imm?: string;
  rc?: string;
  capa?: string;
  mitigation?: string;
}

export interface AuditData {
  auditId: string;
  ref: string;
  dept: string;
  fn: string;
  zone: Zone;
  month: string;
  planDate: string;
  auditor: string;
  auditorUid: string;
  auditDate: string;
  openingMOM: string;
  findings: Finding[];
  compliancePct: number;
  processScore: number;
  closureMOM: string;
  closureDate: string;
  auditeeSPOC: string;
  closureSummary: string;
  auditeeResponse: string;
  auditorSign: string;
  hodApproval: string;
  preparedBy: string;
  approvedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlanData {
  planId: string;
  ref: string;
  dept: string;
  fn: string;
  month: string;
  planDate: string;
  assignedTo: string;
  planType: 'Plan' | 'Adhoc';
  spocMails: string;
  hodMails: string;
  remarks: string;
  status: 'scheduled' | 'notified' | 'completed';
  createdAt: number;
}

export interface TaskData {
  taskId: string;
  auditId: string;
  dept: string;
  fn: string;
  zone: Zone;
  token: string;
  status: TaskStatus;
  spocMail: string;
  hodMail: string;
  dueAt: number;
  notifiedAt: number;
  findings: Finding[];
  response?: {
    imm?: string;
    rc?: string;
    capa?: string;
    mitigation?: string;
    submittedAt: number;
  };
  sentBackReason?: string;
  completedAt?: number;
  closedAt?: number;
}

export interface DeptData {
  ref: string;
  name: string;
  fn: string;
  spocName: string;
  spocMail: string;
  hodMail: string;
}

export interface AppState {
  user: UserData | null;
  page: NavPage;
  depts: DeptData[];
  users: UserData[];
  navbar: HTMLElement | null;
  main: HTMLElement | null;
}
