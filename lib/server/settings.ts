import { getDb } from './db';

export const SETTING_KEYS = ['cf_account_id', 'cf_api_token', 'cf_model', 'cf_fallback_model'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export function getSetting(key: SettingKey): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value.trim() || undefined;
}

/** An empty value removes the override, so the env variable applies again. */
export function setSetting(key: SettingKey, value: string) {
  const db = getDb();
  if (value.trim()) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value.trim());
  else db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}
