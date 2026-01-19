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
    await maybeCleanupExpiredData(db);
    schemaEnsured = true;
    ensurePromise = null;
  })();

  return ensurePromise;
}
