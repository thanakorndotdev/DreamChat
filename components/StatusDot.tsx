import type { OllamaStatus } from '@/lib/types';

const LABEL: Record<OllamaStatus, string> = {
  checking: 'กำลังตรวจ Ollama',
  online: 'Ollama พร้อม',
  offline: 'Ollama ออฟไลน์',
};

export default function StatusDot({ status, model }: { status: OllamaStatus; model?: string }) {
  return (
    <span className="status" data-status={status}>
      <span className="status-dot" aria-hidden />
      <span>{status === 'online' && model ? model : LABEL[status]}</span>
    </span>
  );
}
