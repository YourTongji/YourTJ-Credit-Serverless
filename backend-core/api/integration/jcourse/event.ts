/**
 * YourTJ Credit - YOURTJ 选课社区积分联动
 * POST /api/integration/jcourse/event
 *
 * 说明：
 * - review_reward：点评 >= 50 字 -> +5（立即入账，幂等）
 * - like / unlike：点赞状态变更（不立即入账，日结时结算，可撤销）
 *
 * 鉴权：
 * - 需要请求头 X-JCourse-Secret == process.env.JCOURSE_INTEGRATION_SECRET
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../../lib/cors';
import { execute, queryOne, transaction } from '../../../lib/database';
import { readJsonBody } from '../../../lib/body';
import { generateTransactionId } from '../../../shared/utils/transaction-verification';
import type { ApiResponse } from '../../../shared/types';

type ReviewRewardEvent = {
  kind: 'review_reward';
  eventId: string;
  userHash: string;
  amount?: number; // default 5
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

      const metadata = {
        source: 'jcourse',
        kind: 'review_reward',
        ...body.metadata
      };

      const result = await transaction(async () => {
        await ensureWallet(userHash);
        const txId = await createSystemRewardTx({
          toUserHash: userHash,
          amount,
          title: 'YOURTJ 点评奖励',
          description: 'YOURTJ 选课社区：50 字以上点评奖励',
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
  } catch (error) {
    console.error('JCourse integration event error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal Server Error'
    } as ApiResponse);
  }
}

export default withCors(handler);

