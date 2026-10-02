export type ReportKind = 'bug' | 'idea' | 'other';
export type ReportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type ReportContext = { page?: string; userAgent?: string; screen?: string; language?: string; time?: string };

export type Report = {
  id: number;
  kind: ReportKind;
  title: string;
  body: string;
  screenshot: string | null;
  context: ReportContext | null;
  status: ReportStatus;
  adminReply: string;
  createdAt: number;
  updatedAt: number;
  /** Admin view only. */
  author?: { username: string; email: string | null } | null;
};

export const KIND_LABEL: Record<ReportKind, string> = { bug: 'บั๊ก / ใช้งานไม่ได้', idea: 'ข้อเสนอแนะ', other: 'อื่นๆ' };
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'รอดู',
  in_progress: 'กำลังแก้',
  resolved: 'แก้แล้ว',
  closed: 'ปิดแล้ว',
};

export const TITLE_MAX = 120;
export const BODY_MAX = 4000;
