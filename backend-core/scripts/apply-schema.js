/* eslint-disable no-console */
/**
 * Apply schema.sql to the configured LibSQL database.
 *
 * Usage:
 *  node scripts/apply-schema.js
 *
 * It loads backend/.env if present (minimal parser).
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

function loadDotEnvIfPresent(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function stripSqlComments(sql) {
  return sql
    .split(/\r?\n/)
    .map((line) => {
      const idx = line.indexOf('--');
      if (idx === -1) return line;
      return line.slice(0, idx);
    })
    .join('\n');
}

function splitStatements(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function tableExists(client, table) {
  const result = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;",
    args: [table]
  });
  return Boolean(result.rows?.[0]?.name);
}

async function getTableColumns(client, table) {
  const result = await client.execute(`PRAGMA table_info(${table});`);
  const names = new Set();
  for (const row of result.rows || []) {
    if (row && row.name) names.add(row.name);
  }
  return names;
}

async function ensureWalletColumns(client) {
  if (!(await tableExists(client, 'wallets'))) return;
  const columns = await getTableColumns(client, 'wallets');

  if (!columns.has('user_secret')) {
    await client.execute('ALTER TABLE wallets ADD COLUMN user_secret TEXT;');
  }

  if (!columns.has('public_key')) {
    await client.execute('ALTER TABLE wallets ADD COLUMN public_key TEXT;');
  }
}

async function ensureReportColumns(client) {
  if (!(await tableExists(client, 'reports'))) return;
  const columns = await getTableColumns(client, 'reports');

  if (!columns.has('report_id')) {
    await client.execute('ALTER TABLE reports ADD COLUMN report_id TEXT;');
    await client.execute(`UPDATE reports SET report_id = 'RPT-LEGACY-' || id WHERE report_id IS NULL;`);
  }

  await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_report_id ON reports(report_id);');
}

async function main() {
  const backendDir = path.resolve(__dirname, '..');
  loadDotEnvIfPresent(path.join(backendDir, '.env'));

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');

  const schemaPath = path.join(backendDir, 'schema.sql');
  const raw = fs.readFileSync(schemaPath, 'utf8');
  const noComments = stripSqlComments(raw);
  const statements = splitStatements(noComments);

  const client = createClient({ url, authToken });
  console.log(`Applying schema to ${url} ...`);

  // If this is an existing database, schema.sql may not be able to add new columns.
  // Ensure critical columns exist before applying indexes/views from schema.sql.
  await ensureWalletColumns(client);
  await ensureReportColumns(client);

  for (const stmt of statements) {
    try {
      await client.execute(stmt);
    } catch (err) {
      // A common case: applying schema.sql onto an older DB where columns were added later.
      // In this case, keep going because migrations above already ensure the required columns.
      const msg = String(err && err.message ? err.message : err);
      if (msg.includes('no such column: report_id') && stmt.includes('idx_reports_report_id')) {
        continue;
      }
      console.error('Failed statement:\n', stmt);
      throw err;
    }
  }

  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
  );
  console.log('Tables:', tables.rows.map((r) => r.name).join(', '));

  await client.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
