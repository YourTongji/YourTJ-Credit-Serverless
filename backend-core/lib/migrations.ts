/**
 * YourTJ Credit - 数据库迁移与自检
 * 目的：修复早期 schema 与 API 不一致导致的运行时错误
 */

let schemaEnsured = false;
let ensurePromise: Promise<void> | null = null;

type DbClient = {
  execute: (arg: any) => Promise<any>;
};

type TableInfoRow = {
  name?: string;
};

async function tableExists(db: DbClient, table: string): Promise<boolean> {
  const result = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;",
    args: [table]
  });
  return Boolean((result.rows as any[])?.[0]?.name);
}

async function getTableColumns(db: DbClient, table: string): Promise<Set<string>> {
  const result = await db.execute(`PRAGMA table_info(${table});`);
  const names = new Set<string>();
  for (const row of result.rows as unknown as TableInfoRow[]) {
    if (row?.name) names.add(row.name);
  }
  return names;
}

async function ensureWalletColumns(db: DbClient) {
  if (!(await tableExists(db, 'wallets'))) return;
  const columns = await getTableColumns(db, 'wallets');

  if (!columns.has('user_secret')) {
    await db.execute('ALTER TABLE wallets ADD COLUMN user_secret TEXT;');
  }

  if (!columns.has('public_key')) {
    await db.execute('ALTER TABLE wallets ADD COLUMN public_key TEXT;');
  }
}

async function ensureReportColumns(db: DbClient) {
  if (!(await tableExists(db, 'reports'))) return;
  const columns = await getTableColumns(db, 'reports');

  if (!columns.has('report_id')) {
    await db.execute('ALTER TABLE reports ADD COLUMN report_id TEXT;');
    await db.execute(`UPDATE reports SET report_id = 'RPT-LEGACY-' || id WHERE report_id IS NULL;`);
    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_report_id ON reports(report_id);');
  }
}

async function ensureContentReportsTable(db: DbClient) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS content_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL UNIQUE,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_owner_user_hash TEXT,
      reporter_user_hash TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      resolved_at INTEGER
    );
  `);

  await db.execute('CREATE INDEX IF NOT EXISTS idx_content_reports_target ON content_reports(target_type, target_id);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_content_reports_reporter ON content_reports(reporter_user_hash);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_content_reports_created_at ON content_reports(created_at);');
}

async function ensureRecoveryCasesTable(db: DbClient) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS recovery_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL UNIQUE,
      report_id TEXT,
      victim_user_hash TEXT NOT NULL,
      offender_user_hash TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      admin_note TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      recovered_at INTEGER
    );
  `);

  await db.execute('CREATE INDEX IF NOT EXISTS idx_recovery_cases_status ON recovery_cases(status);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_recovery_cases_offender ON recovery_cases(offender_user_hash);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_recovery_cases_victim ON recovery_cases(victim_user_hash);');
}

async function ensureRedeemTables(db: DbClient) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS redeem_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code_hash TEXT NOT NULL UNIQUE,
      code_hint TEXT,
      title TEXT,
      value INTEGER NOT NULL,
      expires_at INTEGER,
      max_uses INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `);

  await db.execute('CREATE INDEX IF NOT EXISTS idx_redeem_codes_enabled ON redeem_codes(enabled);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_redeem_codes_expires ON redeem_codes(expires_at);');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS redeem_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      redemption_id TEXT NOT NULL UNIQUE,
      code_hash TEXT NOT NULL,
      user_hash TEXT NOT NULL,
      tx_id TEXT NOT NULL,
      redeemed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `);

  await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_redeem_redemptions_code_user ON redeem_redemptions(code_hash, user_hash);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_redeem_redemptions_user ON redeem_redemptions(user_hash);');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_redeem_redemptions_code ON redeem_redemptions(code_hash);');
}

async function maybeCleanupExpiredData(db: DbClient) {
  const nowSec = Math.floor(Date.now() / 1000);

  // 默认 30 天，允许通过 settings 覆盖
  let retentionDays = 30;
  try {
    const setting = await db.execute({
      sql: "SELECT value FROM settings WHERE key = 'transaction_retention_days' LIMIT 1;",
      args: []
    });
    const val = (setting.rows?.[0] as any)?.value;
    const parsed = parseInt(String(val), 10);
    if (!Number.isNaN(parsed) && parsed > 0) retentionDays = parsed;
  } catch {
    // settings 表可能不存在（未初始化），忽略
  }

  const expirySec = nowSec - retentionDays * 24 * 60 * 60;

  // 删除过期交易（已完成/已取消）
  try {
    await db.execute({
      sql: `DELETE FROM transactions
            WHERE created_at < ?
              AND status IN ('completed', 'cancelled');`,
      args: [expirySec]
    });
  } catch {
    // transactions 表可能不存在（未初始化），忽略
  }

  // 删除过期举报（已解决/已拒绝）
  try {
    await db.execute({
      sql: `DELETE FROM reports
            WHERE created_at < ?
              AND status IN ('resolved', 'rejected');`,
      args: [expirySec]
    });
  } catch {
    // reports 表可能不存在（未初始化），忽略
  }
}

export async function ensureSchemaForDatabase(db: DbClient): Promise<void> {
  if (schemaEnsured) return;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    // 这些迁移假设基础表已经通过 schema.sql 初始化过
    await ensureWalletColumns(db);
    await ensureReportColumns(db);
    await ensureContentReportsTable(db);
    await ensureRecoveryCasesTable(db);
    await ensureRedeemTables(db);
    await maybeCleanupExpiredData(db);
    schemaEnsured = true;
    ensurePromise = null;
  })();

  return ensurePromise;
}
