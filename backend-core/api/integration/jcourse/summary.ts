/**
 * YourTJ Credit - YOURTJ 选课社区积分联动
 * GET /api/integration/jcourse/summary?userHash=...&date=YYYY-MM-DD
 *
 * 说明：
 * - 用于选课站前端展示：余额 + 今日预计（主要是点赞的待结算净变化 + 今日点评奖励）
 * - 这里不做鉴权：userHash 为 64hex，不可逆，泄露风险可控
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../../lib/cors';
import { queryOne, query } from '../../../lib/database';
import type { ApiResponse } from '../../../shared/types';

function parseDateParam(raw?: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function shanghaiDayRange(date: string): { startSec: number; endSec: number } {
  // 固定使用 +08:00，避免运行环境时区差异
  const startMs = new Date(`${date}T00:00:00+08:00`).getTime();
  const endMs = new Date(`${date}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000;
  return { startSec: Math.floor(startMs / 1000), endSec: Math.floor(endMs / 1000) };
}

function todayShanghai(): string {
  const now = new Date();
  const sh = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = sh.getUTCFullYear();
  const m = String(sh.getUTCMonth() + 1).padStart(2, '0');
  const d = String(sh.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' } as ApiResponse);
      return;
    }

    const userHash = String(req.query.userHash || '').trim();
    if (!userHash || !/^[a-f0-9]{64}$/i.test(userHash)) {
      res.status(400).json({ success: false, error: 'Invalid userHash' } as ApiResponse);
      return;
    }

    const date = parseDateParam(req.query.date as any) || todayShanghai();
    const { startSec, endSec } = shanghaiDayRange(date);

    const wallet = await queryOne<any>('SELECT user_hash, balance FROM wallets WHERE user_hash = ? LIMIT 1', [userHash]);

    const rewardRow = await queryOne<any>(
      `SELECT COALESCE(SUM(amount), 0) as sum
       FROM transactions
       WHERE to_user_hash = ?
         AND created_at >= ? AND created_at < ?
         AND type_id = 5
         AND metadata LIKE '%"source":"jcourse"%'
         AND metadata LIKE '%"kind":"review_reward"%'`,
      [userHash, startSec, endSec]
    );

    const likeRows = await query<any>(
      `SELECT is_liked, settled_is_liked
       FROM jcourse_review_likes
       WHERE target_user_hash = ?
         AND updated_at >= ? AND updated_at < ?`,
      [userHash, startSec, endSec]
    );

    let likePendingDelta = 0;
    let likePendingPositive = 0;
    let likePendingNegative = 0;
    for (const r of likeRows || []) {
      const delta = Number((r as any).is_liked) - Number((r as any).settled_is_liked);
      likePendingDelta += delta;
      if (delta > 0) likePendingPositive += delta;
      if (delta < 0) likePendingNegative += delta;
    }

    res.status(200).json({
      success: true,
      data: {
        userHash,
        balance: wallet ? Number(wallet.balance || 0) : 0,
        date,
        today: {
          reviewReward: Number(rewardRow?.sum || 0),
          likePendingDelta,
          likePendingPositive,
          likePendingNegative
        }
      }
    } as ApiResponse);
  } catch (error) {
    console.error('JCourse integration summary error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error'
    } as ApiResponse);
  }
}

export default withCors(handler);

