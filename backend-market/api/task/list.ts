/**
 * YourTJ Credit - 获取任务列表API
 * GET /api/task/list
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { query, queryOne } from '../../lib/database';
import { verifySignedRequest } from '../../shared/utils/transaction-verification';
import type { Task, ApiResponse, PaginatedResponse } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = (req.query.status as string) || 'open';
    const creatorUserHash = req.query.creatorUserHash as string | undefined;
    const acceptorUserHash = req.query.acceptorUserHash as string | undefined;
    const offset = (page - 1) * limit;

    // 可选：签名鉴权（用于返回敏感字段，如联系方式）
    const authUserHash = (req.headers['x-user-hash'] as string) || '';
    const authSignature = (req.headers['x-signature'] as string) || '';
    const authTimestamp = (req.headers['x-timestamp'] as string) || '';
    const authNonce = (req.headers['x-nonce'] as string) || '';

    const hasAuth =
      Boolean(authUserHash) &&
      Boolean(authSignature) &&
      Boolean(authTimestamp) &&
      Boolean(authNonce);

    const signedPayload: Record<string, any> = {
      status,
      page,
      limit
    };
    if (creatorUserHash) signedPayload.creatorUserHash = creatorUserHash;
    if (acceptorUserHash) signedPayload.acceptorUserHash = acceptorUserHash;

    let viewerUserHash: string | null = null;
    if (hasAuth) {
      const wallet = await queryOne<any>(
        'SELECT user_hash, user_secret FROM wallets WHERE user_hash = ?',
        [authUserHash]
      );
      if (wallet?.user_secret) {
        const verifyResult = await verifySignedRequest(
          signedPayload,
          {
            'x-user-hash': authUserHash,
            'x-signature': authSignature,
            'x-timestamp': authTimestamp,
            'x-nonce': authNonce
          },
          wallet.user_secret
        );
        if (verifyResult.valid) {
          viewerUserHash = authUserHash;
        }
      }
    }

    const where: string[] = [];
    const args: any[] = [];

    if (status && status !== 'all') {
      where.push('status = ?');
      args.push(status);
    }

    if (creatorUserHash) {
      where.push('creator_user_hash = ?');
      args.push(creatorUserHash);
    }

    if (acceptorUserHash) {
      where.push('acceptor_user_hash = ?');
      args.push(acceptorUserHash);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // 查询任务列表
    const tasks = await query<any>(
      `SELECT * FROM tasks
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );

    // 查询总数
    const countResult = await query<any>(
      `SELECT COUNT(*) as total FROM tasks ${whereSql}`,
      args
    );
    const total = countResult[0]?.total || 0;

    const taskList: Task[] = tasks.map(row => ({
      id: row.id,
      taskId: row.task_id,
      creatorUserHash: row.creator_user_hash,
      title: row.title,
      description: row.description,
      contactInfo:
        viewerUserHash &&
        (row.creator_user_hash === viewerUserHash ||
          (row.acceptor_user_hash === viewerUserHash && row.status !== 'open'))
          ? (row.contact_info || undefined)
          : undefined,
      rewardAmount: row.reward_amount,
      status: row.status,
      acceptorUserHash: row.acceptor_user_hash,
      txId: row.tx_id,
      createdAt: row.created_at * 1000,
      acceptedAt: row.accepted_at ? row.accepted_at * 1000 : undefined,
      submittedAt: row.submitted_at ? row.submitted_at * 1000 : undefined,
      completedAt: row.completed_at ? row.completed_at * 1000 : undefined
    }));

    const response: PaginatedResponse<Task> = {
      data: taskList,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };

    res.status(200).json({
      success: true,
      data: response
    } as ApiResponse<PaginatedResponse<Task>>);
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
