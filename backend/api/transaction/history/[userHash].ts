/**
 * YourTJ Credit - 获取交易历史API
 * GET /api/transaction/history/[userHash]
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../../lib/cors';
import { query, queryOne } from '../../../lib/database';
import type { Transaction, ApiResponse } from '../../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { userHash } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    if (!userHash || typeof userHash !== 'string') {
      res.status(400).json({ success: false, error: '缺少userHash参数' });
      return;
    }

    // 查询总数
    const countRow = await queryOne<any>(
      `SELECT COUNT(*) as total FROM transactions
       WHERE from_user_hash = ? OR to_user_hash = ?`,
      [userHash, userHash]
    );

    const total = countRow?.total || 0;

    // 查询交易列表
    const rows = await query<any>(
      `SELECT t.*, tt.name as type_name, tt.display_name as type_display_name
       FROM transactions t
       JOIN transaction_types tt ON t.type_id = tt.id
       WHERE t.from_user_hash = ? OR t.to_user_hash = ?
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [userHash, userHash, limit, offset]
    );

    const transactions: Transaction[] = rows.map(row => ({
      id: row.id,
      txId: row.tx_id,
      typeId: row.type_id,
      typeName: row.type_name,
      typeDisplayName: row.type_display_name,
      fromUserHash: row.from_user_hash,
      toUserHash: row.to_user_hash,
      amount: row.amount,
      status: row.status,
      title: row.title,
      description: row.description,
      metadata: row.metadata,
      createdAt: row.created_at * 1000,
      completedAt: row.completed_at ? row.completed_at * 1000 : undefined
    }));

    res.status(200).json({
      success: true,
      data: {
        data: transactions,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
