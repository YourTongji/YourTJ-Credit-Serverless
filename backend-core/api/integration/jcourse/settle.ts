/**
 * YourTJ Credit - YOURTJ 选课社区积分联动
 * POST /api/integration/jcourse/settle { date: 'YYYY-MM-DD', dryRun?: boolean }
 *
 * 日结逻辑（固定 Asia/Shanghai +08:00）：
 * - 取该日期内发生“点赞状态变更”的记录：updated_at in [00:00, 24:00)
 * - 对每条记录计算 delta = is_liked - settled_is_liked（+1 或 -1）
 * - 聚合到 target_user_hash，生成 system_reward 交易（amount 允许为负）
 * - 写回：settled_is_liked = is_liked，settled_at=now，last_settle_date=date
 *
 * 鉴权：X-JCourse-Secret
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../../lib/cors';
import { query, execute, transaction, queryOne } from '../../../lib/database';
import { readJsonBody } from '../../../lib/body';
import { generateTransactionId } from '../../../shared/utils/transaction-verification';
import type { ApiResponse } from '../../../shared/types';

function assertSecret(req: VercelRequest): string | null {
  const expected = process.env.JCOURSE_INTEGRATION_SECRET?.trim();
  if (!expected) return 'JCOURSE_INTEGRATION_SECRET is not set';
  const got = String(req.headers['x-jcourse-secret'] || '').trim();
  if (!got || got !== expected) return 'Unauthorized';
  return null;
}

function shanghaiDayRange(date: string): { startSec: number; endSec: number } {
  const startMs = new Date(`${date}T00:00:00+08:00`).getTime();
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return { startSec: Math.floor(startMs / 1000), endSec: Math.floor(endMs / 1000) };
}

async function ensureWallet(userHash: string) {
  const existing = await queryOne<any>('SELECT user_hash FROM wallets WHERE user_hash = ? LIMIT 1', [userHash]);
  if (existing) return;
  const now = Math.floor(Date.now() / 1000);
  await execute(
    'INSERT INTO wallets (user_hash, user_secret, public_key, balance, created_at, last_active_at) VALUES (?, NULL, NULL, 0, ?, ?)',
    [userHash, now, now]
  );
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' } as ApiResponse);
      return;
    }

    const secretErr = assertSecret(req);
    if (secretErr) {
      res.status(secretErr === 'Unauthorized' ? 401 : 500).json({ success: false, error: secretErr } as ApiResponse);
      return;
    }

    const body = await readJsonBody<any>(req);
    const date = String(body?.date || '').trim();
    const dryRun = Boolean(body?.dryRun);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ success: false, error: 'Invalid date (YYYY-MM-DD)' } as ApiResponse);
      return;
    }

    const { startSec, endSec } = shanghaiDayRange(date);

    const rows = await query<any>(
      `SELECT review_id, actor_id, target_user_hash, is_liked, settled_is_liked
       FROM jcourse_review_likes
       WHERE updated_at >= ? AND updated_at < ?
         AND is_liked != settled_is_liked`,
      [startSec, endSec]
    );

    const byUser = new Map<string, { delta: number; rows: number }>();
    let totalRows = 0;
    for (const r of rows || []) {
      totalRows += 1;
      const user = String((r as any).target_user_hash || '').trim();
      const delta = Number((r as any).is_liked) - Number((r as any).settled_is_liked);
      if (!user || !Number.isFinite(delta) || delta === 0) continue;
      const cur = byUser.get(user) || { delta: 0, rows: 0 };
      cur.delta += delta;
      cur.rows += 1;
      byUser.set(user, cur);
    }

    const settlements = Array.from(byUser.entries())
      .map(([userHash, v]) => ({ userHash, delta: v.delta, rows: v.rows }))
      .filter((x) => x.delta !== 0);

    if (dryRun) {
      res.status(200).json({
        success: true,
        data: {
          date,
          dryRun: true,
          totalRows,
          wallets: settlements
        }
      } as ApiResponse);
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const txIds: Array<{ userHash: string; txId: string; amount: number }> = [];

    await transaction(async () => {
      for (const s of settlements) {
        await ensureWallet(s.userHash);
        const txId = generateTransactionId();
        const metadata = {
          source: 'jcourse',
          kind: 'like_settlement',
          date,
          delta: s.delta
        };

        await execute(
          `INSERT INTO transactions
           (tx_id, type_id, from_user_hash, to_user_hash, amount, status, title, description, metadata, created_at, completed_at)
           VALUES (?, 5, NULL, ?, ?, 'completed', ?, ?, ?, ?, ?)`,
          [
            txId,
            s.userHash,
            s.delta,
            'YOURTJ 点赞结算',
            `YOURTJ 选课社区：${date} 点赞积分日结`,
            JSON.stringify(metadata),
            now,
            now
          ]
        );

        await execute('UPDATE wallets SET balance = balance + ?, last_active_at = ? WHERE user_hash = ?', [
          s.delta,
          now,
          s.userHash
        ]);

        txIds.push({ userHash: s.userHash, txId, amount: s.delta });
      }

      // 写回 settled 状态（幂等：同一天重复执行会因为 is_liked==settled_is_liked 而不再命中）
      await execute(
        `UPDATE jcourse_review_likes
         SET settled_is_liked = is_liked,
             settled_at = ?,
             last_settle_date = ?
         WHERE updated_at >= ? AND updated_at < ?
           AND is_liked != settled_is_liked`,
        [now, date, startSec, endSec]
      );
    });

    res.status(200).json({
      success: true,
      data: {
        date,
        totalRows,
        walletsUpdated: settlements.length,
        txIds
      }
    } as ApiResponse);
  } catch (error) {
    console.error('JCourse integration settle error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error'
    } as ApiResponse);
  }
}

export default withCors(handler);

