/**
 * YourTJ Credit - 获取交易详情API
 * GET /api/transaction/[txId]
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { queryOne } from '../../lib/database';
import type { Transaction, ApiResponse } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { txId } = req.query;

    if (!txId || typeof txId !== 'string') {
      res.status(400).json({ success: false, error: '缺少txId参数' });
      return;
    }

    const row = await queryOne<any>(
      `SELECT t.*, tt.name as type_name, tt.display_name as type_display_name
       FROM transactions t
       JOIN transaction_types tt ON t.type_id = tt.id
       WHERE t.tx_id = ?`,
      [txId]
    );

    if (!row) {
      res.status(404).json({
        success: false,
        error: '交易不存在'
      } as ApiResponse);
      return;
    }

    const tx: Transaction = {
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
    };

    res.status(200).json({
      success: true,
      data: tx
    } as ApiResponse<Transaction>);
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
