#!/usr/bin/env node
/**
 * One-off copy of the old SQLite database (data/dreamchat.db) into PostgreSQL.
 *
 *   DATABASE_URL=postgres://… node scripts/sqlite-to-postgres.mjs [path/to/dreamchat.db]
 *
 * Run it with the app stopped, after the app has started once against DATABASE_URL (so the
 * schema exists) or on an empty database (it then waits for you to start the app first).
 * Rows are upserted, so running it twice is safe; it never deletes anything in Postgres.
 */
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';

const file = process.argv[2] ?? 'data/dreamchat.db';
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

// Not read-only: SQLite has to fold its write-ahead log (dreamchat.db-wal) back in to see the latest rows.
const lite = new DatabaseSync(file);
const sql = postgres(url, { onnotice: () => {} });

const has = (table) => !!lite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
const cols = (table) => new Set(lite.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((c) => c.name));
const rows = (table) => (has(table) ? lite.prepare(`SELECT * FROM ${table}`).all() : []);
const json = (text) => (text == null ? null : sql.json(JSON.parse(text)));

const [{ exists }] = await sql`SELECT to_regclass('public.users') IS NOT NULL AS exists`;
if (!exists) {
  console.error('The Postgres schema does not exist yet. Start the app once with DATABASE_URL set, stop it, then run this again.');
  process.exit(1);
}

const userCols = cols('users');
const counts = {};
const count = (t) => (counts[t] = (counts[t] ?? 0) + 1);

await sql.begin(async (tx) => {
  for (const u of rows('users')) {
    await tx`
      INSERT INTO users (id, username, password_hash, created_at, is_admin, email, phone, consent_version, consent_at, marketing_consent, stripe_customer_id)
      OVERRIDING SYSTEM VALUE
      VALUES (${u.id}, ${u.username}, ${u.password_hash}, ${u.created_at}, ${!!u.is_admin}, ${userCols.has('email') ? u.email : null},
        ${userCols.has('phone') ? u.phone : null}, ${u.consent_version ?? 0}, ${u.consent_at ?? null}, ${!!u.marketing_consent},
        ${u.stripe_customer_id ?? null})
      ON CONFLICT (id) DO UPDATE SET username = excluded.username, password_hash = excluded.password_hash, is_admin = excluded.is_admin,
        email = excluded.email, phone = excluded.phone, consent_version = excluded.consent_version, consent_at = excluded.consent_at,
        marketing_consent = excluded.marketing_consent, stripe_customer_id = excluded.stripe_customer_id`;
    count('users');
  }
  // New sign-ups must continue after the highest copied id.
  await tx`SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT max(id) FROM users), 1))`;

  for (const s of rows('sessions')) {
    if (s.expires_at < Date.now()) continue;
    await tx`INSERT INTO sessions ${tx(s)} ON CONFLICT (token_hash) DO NOTHING`;
    count('sessions');
  }
  for (const c of rows('characters')) {
    await tx`
      INSERT INTO characters (user_id, id, data, updated_at) VALUES (${c.user_id}, ${c.id}, ${json(c.data)}, ${c.updated_at})
      ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`;
    count('characters');
  }
  for (const s of rows('settings')) {
    await tx`INSERT INTO settings ${tx(s)} ON CONFLICT (key) DO UPDATE SET value = excluded.value`;
    count('settings');
  }
  for (const p of rows('plans')) {
    await tx`
      INSERT INTO plans (id, name, level, price, interval, active, features, perks)
      VALUES (${p.id}, ${p.name}, ${p.level}, ${p.price}, ${p.interval}, ${!!p.active}, ${json(p.features)}, ${json(p.perks)})
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, level = excluded.level, price = excluded.price, interval = excluded.interval,
        active = excluded.active, features = excluded.features, perks = excluded.perks`;
    count('plans');
  }
  for (const c of rows('catalog')) {
    await tx`
      INSERT INTO catalog (id, author_id, source_id, data, status, tier, review_note, created_at, updated_at, published_at)
      VALUES (${c.id}, ${c.author_id}, ${c.source_id}, ${json(c.data)}, ${c.status}, ${c.tier}, ${c.review_note}, ${c.created_at}, ${c.updated_at}, ${c.published_at})
      ON CONFLICT (id) DO UPDATE SET data = excluded.data, status = excluded.status, tier = excluded.tier, review_note = excluded.review_note,
        updated_at = excluded.updated_at, published_at = excluded.published_at`;
    count('catalog');
  }
  for (const s of rows('subscriptions')) {
    await tx`
      INSERT INTO subscriptions (user_id, plan_id, source, status, current_period_end, cancel_at_period_end, stripe_subscription_id, updated_at)
      VALUES (${s.user_id}, ${s.plan_id}, ${s.source}, ${s.status}, ${s.current_period_end}, ${!!s.cancel_at_period_end}, ${s.stripe_subscription_id}, ${s.updated_at})
      ON CONFLICT (user_id) DO UPDATE SET plan_id = excluded.plan_id, source = excluded.source, status = excluded.status,
        current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
        stripe_subscription_id = excluded.stripe_subscription_id, updated_at = excluded.updated_at`;
    count('subscriptions');
  }
  for (const c of rows('coupons')) {
    await tx`
      INSERT INTO coupons (code, kind, value, duration, plan_ids, max_redemptions, expires_at, active, note, stripe_coupon_id, created_at)
      VALUES (${c.code}, ${c.kind}, ${c.value}, ${c.duration}, ${json(c.plan_ids)}, ${c.max_redemptions}, ${c.expires_at}, ${!!c.active},
        ${c.note}, ${c.stripe_coupon_id}, ${c.created_at})
      ON CONFLICT (code) DO NOTHING`;
    count('coupons');
  }
  for (const r of rows('coupon_redemptions')) {
    await tx`INSERT INTO coupon_redemptions ${tx(r)} ON CONFLICT DO NOTHING`;
    count('coupon_redemptions');
  }
  for (const u of rows('usage')) {
    await tx`INSERT INTO usage ${tx(u)} ON CONFLICT (user_id, day) DO UPDATE SET chat = excluded.chat, other = excluded.other`;
    count('usage');
  }
  for (const e of rows('stripe_events')) {
    await tx`INSERT INTO stripe_events ${tx(e)} ON CONFLICT DO NOTHING`;
    count('stripe_events');
  }
});

console.log('Copied:', counts);
await sql.end();
