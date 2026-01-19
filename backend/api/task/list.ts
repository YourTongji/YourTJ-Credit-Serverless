/**
 * YourTJ Credit - 获取任务列表API
 * GET /api/task/list
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { query } from '../../lib/database';
import type { Task, ApiResponse, PaginatedResponse } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string || 'open';
    const offset = (page - 1) * limit;

    // 查询任务列表
    const tasks = await query<any>(
      `SELECT * FROM tasks
       WHERE status = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [status, limit, offset]
    );

    // 查询总数
    const countResult = await query<any>(
      'SELECT COUNT(*) as total FROM tasks WHERE status = ?',
      [status]
    );
    const total = countResult[0]?.total || 0;

    const taskList: Task[] = tasks.map(row => ({
      id: row.id,
      taskId: row.task_id,
      creatorUserHash: row.creator_user_hash,
      title: row.title,
      description: row.description,
      rewardAmount: row.reward_amount,
      status: row.status,
      acceptorUserHash: row.acceptor_user_hash,
      txId: row.tx_id,
      createdAt: row.created_at * 1000,
      acceptedAt: row.accepted_at ? row.accepted_at * 1000 : undefined,
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
