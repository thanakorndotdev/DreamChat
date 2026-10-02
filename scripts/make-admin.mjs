#!/usr/bin/env node
/**
 * Gives (or with --revoke, takes away) admin rights for an existing account.
 *
 *   docker compose exec app node scripts/make-admin.mjs <username> [--revoke]
 *
 * Admin rights are only ever set here or by another admin, never by matching a name in env,
 * because anyone could register that name before the real admin does.
 */
import postgres from 'postgres';

const [username, flag] = process.argv.slice(2);
if (!username) {
  console.error('usage: node scripts/make-admin.mjs <username> [--revoke]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });
const admin = flag !== '--revoke';
const rows = await sql`UPDATE users SET is_admin = ${admin} WHERE username = ${username} RETURNING id, username, email`;
if (!rows.length) {
  console.error(`No account named "${username}". Sign up first, then run this again.`);
  process.exitCode = 1;
} else {
  const u = rows[0];
  console.log(`${admin ? 'Granted' : 'Revoked'} admin for ${u.username} (id ${u.id}, ${u.email ?? 'no email'})`);
}
await sql.end();
