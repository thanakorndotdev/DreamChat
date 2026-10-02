import { db } from './db';

export const SETTING_KEYS = ['cf_account_id', 'cf_api_token', 'cf_model', 'cf_fallback_model'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export async function getSetting(key: SettingKey): Promise<string | undefined> {
  const sql = await db();
  const [row] = await sql<{ value: string }[]>`SELECT value FROM settings WHERE key = ${key}`;
  return row?.value.trim() || undefined;
}

/** An empty value removes the override, so the env variable applies again. */
export async function setSetting(key: SettingKey, value: string) {
  const sql = await db();
  if (value.trim()) {
    await sql`INSERT INTO settings (key, value) VALUES (${key}, ${value.trim()}) ON CONFLICT (key) DO UPDATE SET value = excluded.value`;
  } else {
    await sql`DELETE FROM settings WHERE key = ${key}`;
  }
}
