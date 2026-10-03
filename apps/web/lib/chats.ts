import type { Character } from '@longrak/shared/types';

const relative = new Intl.RelativeTimeFormat('th', { numeric: 'auto' });

export function ago(ts: number) {
  const minutes = Math.round((ts - Date.now()) / 60000);
  if (minutes > -1) return 'เมื่อสักครู่';
  if (minutes > -60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (days > -30) return relative.format(days, 'day');
  return new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

export function lastLine(c: Character) {
  const visible = c.messages.filter((m) => !m.failed);
  return visible.length ? visible[visible.length - 1].text : c.firstMessage;
}

export function lineCount(c: Character) {
  return c.messages.filter((m) => !m.failed).length;
}
