import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_CHARACTERS } from '../presets';
import { DEFAULT_PLANS } from '../plans';

/**
 * One SQLite file holds accounts, sessions, every private chat, the public character catalog and billing.
 * DATA_DIR is a mounted volume in Docker so the file survives rebuilds.
 */
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

let db: DatabaseSync | null = null;

function addColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const cols = db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, 'dreamchat.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    -- Each account's own chats. Private: no admin endpoint reads this table.
    CREATE TABLE IF NOT EXISTS characters (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );

    -- Admin-editable overrides (AI model, Workers AI credentials). Empty or missing falls back to env.
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Public characters anyone can start a chat with. Holds the character sheet only, never a conversation.
    CREATE TABLE IF NOT EXISTS catalog (
      id TEXT PRIMARY KEY,
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      -- The author's private character this was submitted from, so resubmitting updates the same entry.
      source_id TEXT,
      data TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft', -- draft | pending | published | rejected
      tier INTEGER NOT NULL DEFAULT 0,      -- lowest plan level that may chat with it
      review_note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      published_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS catalog_source ON catalog (author_id, source_id) WHERE source_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level INTEGER NOT NULL,
      price INTEGER NOT NULL,             -- satang per period; 0 for the free plan
      interval TEXT NOT NULL,             -- month | year
      active INTEGER NOT NULL DEFAULT 1,
      features TEXT NOT NULL,             -- JSON, see lib/plans.ts
      perks TEXT NOT NULL DEFAULT '[]'    -- JSON list of selling points shown on the membership page
    );

    -- At most one membership per account; no row (or an expired one) means the free plan.
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL REFERENCES plans(id),
      source TEXT NOT NULL,               -- stripe | code | admin
      status TEXT NOT NULL,               -- active | trialing | past_due | canceled | incomplete ...
      current_period_end INTEGER NOT NULL,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      stripe_subscription_id TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY COLLATE NOCASE,
      kind TEXT NOT NULL,                 -- percent | amount | free_days
      value INTEGER NOT NULL,             -- percent, satang, or days
      duration TEXT NOT NULL DEFAULT 'once', -- once | forever (discounts only)
      plan_ids TEXT,                      -- JSON list; NULL = every paid plan
      max_redemptions INTEGER,            -- people who may use it; NULL = unlimited
      expires_at INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      note TEXT NOT NULL DEFAULT '',
      stripe_coupon_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      code TEXT NOT NULL REFERENCES coupons(code) ON DELETE CASCADE ON UPDATE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      at INTEGER NOT NULL,
      PRIMARY KEY (code, user_id)
    );

    -- AI calls per account per day (Asia/Bangkok), for the plan's daily limit.
    CREATE TABLE IF NOT EXISTS usage (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      chat INTEGER NOT NULL DEFAULT 0,
      other INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );

    -- Stripe retries webhooks; remember which events were already applied.
    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      at INTEGER NOT NULL
    );
  `);

  addColumn(db, 'users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'users', 'email', 'TEXT');
  addColumn(db, 'users', 'phone', 'TEXT');
  addColumn(db, 'users', 'consent_version', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'users', 'consent_at', 'INTEGER');
  addColumn(db, 'users', 'marketing_consent', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'users', 'stripe_customer_id', 'TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (email COLLATE NOCASE) WHERE email IS NOT NULL');

  const insertPlan = db.prepare('INSERT OR IGNORE INTO plans (id, name, level, price, interval, features, perks) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const p of DEFAULT_PLANS) insertPlan.run(p.id, p.name, p.level, p.price, p.interval, JSON.stringify(p.features), JSON.stringify(p.perks));

  // A fresh install starts with the bundled sample character in the catalog.
  if (!(db.prepare('SELECT 1 FROM catalog LIMIT 1').get() as unknown)) {
    const now = Date.now();
    for (const c of DEFAULT_CHARACTERS) {
      const { messages: _m, notes: _n, notedUpTo: _u, updatedAt: _t, userName: _p, ...sheet } = c;
      db.prepare("INSERT INTO catalog (id, data, status, created_at, updated_at, published_at) VALUES (?, ?, 'published', ?, ?, ?)").run(
        c.id,
        JSON.stringify(sheet),
        now,
        now,
        now,
      );
    }
  }
  return db;
}
