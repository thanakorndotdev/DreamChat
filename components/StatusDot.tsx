import type { OllamaStatus } from '@/lib/types';

const LABEL: Record<OllamaStatus, string> = {
  checking: 'กำลังเชื่อมต่อ AI',
  online: 'AI พร้อม',
  offline: 'AI ออฟไลน์',
};

export default function StatusDot({ status }: { status: OllamaStatus }) {
  return (
    <span className="status" data-status={status}>
      <span className="status-dot" aria-hidden />
      <span>{LABEL[status]}</span>
    </span>
  );
}
