/**
 * YourTJ Credit - 数据库连接模块
 * 连接Turso数据库（LibSQL）
 */

import { createClient } from '@libsql/client';
import { ensureSchemaForDatabase } from './migrations';

/**
 * 数据库客户端
 */
let dbClient: ReturnType<typeof createClient> | null = null;

/**
 * 初始化数据库连接
 */
export function initDatabase() {
  if (dbClient) {
    return dbClient;
  }

  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;

  if (!url) {
    throw new Error('TURSO_DATABASE_URL environment variable is not set');
  }

  dbClient = createClient({
    url,
    authToken
  });

  return dbClient;
}

/**
 * 获取数据库客户端
 */
export function getDatabase() {
  if (!dbClient) {
    return initDatabase();
  }
  return dbClient;
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase() {
  if (dbClient) {
    await dbClient.close();
    dbClient = null;
  }
}

/**
 * 执行查询
 */
export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const db = getDatabase();
  await ensureSchemaForDatabase(db as any);
  const result = await db.execute({
    sql,
    args: params || []
  });
  return result.rows as T[];
}

/**
 * 执行单条查询
 */
export async function queryOne<T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const results = await query<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * 执行更新/插入/删除
 */
export async function execute(
  sql: string,
  params?: any[]
): Promise<{ changes: number; lastInsertRowid: number }> {
  const db = getDatabase();
  await ensureSchemaForDatabase(db as any);
  const result = await db.execute({
    sql,
    args: params || []
  });
  return {
    changes: result.rowsAffected,
    lastInsertRowid: Number(result.lastInsertRowid)
  };
}

/**
 * 执行事务
 */
export async function transaction<T>(
  callback: (tx: any) => Promise<T>
): Promise<T> {
  const db = getDatabase();
  await ensureSchemaForDatabase(db as any);

  // LibSQL (Turso) 的远程协议下，直接执行 BEGIN/COMMIT/ROLLBACK 可能不会绑定到同一个连接，
  // 从而出现“cannot rollback - no transaction is active”。
  // 优先使用 @libsql/client 提供的 transaction('write') 保证事务上下文一致。
  if (typeof (db as any).transaction === 'function') {
    const tx = await (db as any).transaction('write');
    try {
      const result = await callback(tx);
      await tx.commit();
      return result;
    } catch (error) {
      try {
        await tx.rollback();
      } catch {
        // ignore rollback error, keep original error
      }
      throw error;
    } finally {
      try {
        await tx.close();
      } catch {
        // ignore close error
      }
    }
  }

  // Fallback：本地 SQLite / 兼容实现
  await db.execute('BEGIN TRANSACTION');
  try {
    const result = await callback(db as any);
    await db.execute('COMMIT');
    return result;
  } catch (error) {
    try {
      await db.execute('ROLLBACK');
    } catch {
      // ignore rollback error, keep original error
    }
    throw error;
  }
}
