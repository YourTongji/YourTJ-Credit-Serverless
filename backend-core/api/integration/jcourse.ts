/**
 * YourTJ Credit - YOURTJ 选课社区积分联动（合并以降低 Vercel Function 数量）
 *
 * 通过 vercel.json rewrite 兼容原路径：
 * - POST /api/integration/jcourse/event   -> /api/integration/jcourse?action=event
 * - GET  /api/integration/jcourse/summary -> /api/integration/jcourse?action=summary
 * - POST /api/integration/jcourse/settle  -> /api/integration/jcourse?action=settle
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { execute, query, queryOne, transaction } from '../../lib/database';
import { readJsonBody } from '../../lib/body';
import { generateTransactionId } from '../../shared/utils/transaction-verification';
import type { ApiResponse } from '../../shared/types';

type ReviewRewardEvent = {
  kind: 'review_reward';
  eventId: string;
  userHash: string;
  amount?: number;
  metadata?: Record<string, any>;
};

type LikeStateEvent = {
  kind: 'like' | 'unlike';
  reviewId: string;
  actorId: string;
  targetUserHash: string;
  metadata?: Record<string, any>;
};

type EventBody = ReviewRewardEvent | LikeStateEvent;

function assertSecret(req: VercelRequest): string | null {
  const expected = process.env.JCOURSE_INTEGRATION_SECRET?.trim();
  if (!expected) return 'JCOURSE_INTEGRATION_SECRET is not set';
  const got = String(req.headers['x-jcourse-secret'] || '').trim();
  if (!got || got !== expected) return 'Unauthorized';
  return null;
}

function parseDateParam(raw?: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function todayShanghai(): string {
  const now = new Date();
  const sh = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = sh.getUTCFullYear();
  const m = String(sh.getUTCMonth() + 1).padStart(2, '0');
  const d = String(sh.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

async function createSystemRewardTx(opts: {
  toUserHash: string;
  amount: number;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}) {
  const now = Math.floor(Date.now() / 1000);
  const txId = generateTransactionId();

  await execute(
    `INSERT INTO transactions
     (tx_id, type_id, from_user_hash, to_user_hash, amount, status, title, description, metadata, created_at, completed_at)
     VALUES (?, ?, NULL, ?, ?, 'completed', ?, ?, ?, ?, ?)`,
    [
      txId,
      5, // system_reward
      opts.toUserHash,
      opts.amount,
      opts.title,
      opts.description || null,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
      now,
      now
    ]
  );

  await execute('UPDATE wallets SET balance = balance + ?, last_active_at = ? WHERE user_hash = ?', [
    opts.amount,
    now,
    opts.toUserHash
  ]);

  return txId;
}

async function handleEvent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' } as ApiResponse);
    return;
  }

  const secretErr = assertSecret(req);
  if (secretErr) {
    res.status(secretErr === 'Unauthorized' ? 401 : 500).json({ success: false, error: secretErr } as ApiResponse);
    return;
  }

  const body = await readJsonBody<EventBody>(req);

  if (body.kind === 'review_reward') {
    const { eventId, userHash } = body;
    const amount = body.amount ?? 5;

    if (!eventId || typeof eventId !== 'string') {
      res.status(400).json({ success: false, error: 'Missing eventId' } as ApiResponse);
      return;
    }
    if (!userHash || typeof userHash !== 'string' || !/^[a-f0-9]{64}$/i.test(userHash)) {
      res.status(400).json({ success: false, error: 'Invalid userHash' } as ApiResponse);
      return;
    }
    if (!Number.isFinite(amount) || amount === 0) {
      res.status(400).json({ success: false, error: 'Invalid amount' } as ApiResponse);
      return;
    }

    const existing = await queryOne<any>('SELECT event_id, tx_id FROM jcourse_events WHERE event_id = ? LIMIT 1', [
      eventId
    ]);
    if (existing) {
      res.status(200).json({
        success: true,
        data: { deduped: true, eventId, txId: existing.tx_id || null }
      } as ApiResponse);
      return;
    }

    const metadata = { source: 'jcourse', kind: 'review_reward', ...body.metadata };

    const result = await transaction(async () => {
      await ensureWallet(userHash);
      const txId = await createSystemRewardTx({
        toUserHash: userHash,
        amount,
        title: 'YOURTJ 评课激励',
        description: 'YOURTJ 选课社区：50 字以上点评评课激励',
        metadata
      });
      await execute(
        'INSERT INTO jcourse_events (event_id, kind, user_hash, amount, tx_id, metadata) VALUES (?, ?, ?, ?, ?, ?)',
        [eventId, 'review_reward', userHash, amount, txId, JSON.stringify(metadata)]
      );
      return { txId };
    });

    res.status(201).json({ success: true, data: { eventId, txId: result.txId } } as ApiResponse);
    return;
  }

  if (body.kind === 'like' || body.kind === 'unlike') {
    const { reviewId, actorId, targetUserHash } = body;
    if (!reviewId || typeof reviewId !== 'string') {
      res.status(400).json({ success: false, error: 'Missing reviewId' } as ApiResponse);
      return;
    }
    if (!actorId || typeof actorId !== 'string') {
      res.status(400).json({ success: false, error: 'Missing actorId' } as ApiResponse);
      return;
    }
    if (!targetUserHash || typeof targetUserHash !== 'string' || !/^[a-f0-9]{64}$/i.test(targetUserHash)) {
      res.status(400).json({ success: false, error: 'Invalid targetUserHash' } as ApiResponse);
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const isLiked = body.kind === 'like' ? 1 : 0;

    await transaction(async () => {
      await ensureWallet(targetUserHash);
      await execute(
        `INSERT INTO jcourse_review_likes
         (review_id, actor_id, target_user_hash, is_liked, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(review_id, actor_id) DO UPDATE SET
           target_user_hash=excluded.target_user_hash,
           is_liked=excluded.is_liked,
           updated_at=excluded.updated_at`,
        [reviewId, actorId, targetUserHash, isLiked, now]
      );
    });

    res.status(200).json({ success: true, data: { reviewId, actorId, isLiked: isLiked === 1 } } as ApiResponse);
    return;
  }

  res.status(400).json({ success: false, error: 'Unknown kind' } as ApiResponse);
}

async function handleSummary(req: VercelRequest, res: VercelResponse) {
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
}

async function handleSettle(req: VercelRequest, res: VercelResponse) {
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
      data: { date, dryRun: true, totalRows, wallets: settlements }
    } as ApiResponse);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const txIds: Array<{ userHash: string; txId: string; amount: number }> = [];

  await transaction(async () => {
    for (const s of settlements) {
      await ensureWallet(s.userHash);
      const txId = generateTransactionId();
      const metadata = { source: 'jcourse', kind: 'like_settlement', date, delta: s.delta };

      await execute(
        `INSERT INTO transactions
         (tx_id, type_id, from_user_hash, to_user_hash, amount, status, title, description, metadata, created_at, completed_at)
         VALUES (?, 5, NULL, ?, ?, 'completed', ?, ?, ?, ?, ?)`,
        [
          txId,
          s.userHash,
          s.delta,
          'YOURTJ 评课激励（点赞）',
          `YOURTJ 选课社区：${date} 点赞评课激励日结`,
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
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const action = String(req.query.action || '').trim().toLowerCase();
    if (action === 'event') {
      await handleEvent(req, res);
      return;
    }
    if (action === 'summary') {
      await handleSummary(req, res);
      return;
    }
    if (action === 'settle') {
      await handleSettle(req, res);
      return;
    }
    res.status(404).json({ success: false, error: 'Not found' } as ApiResponse);
  } catch (error) {
    console.error('JCourse integration error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error'
    } as ApiResponse);
  }
}

export default withCors(handler);
