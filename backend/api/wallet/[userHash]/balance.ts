/**
 * YourTJ Credit - 获取钱包余额API
 * GET /api/wallet/[userHash]/balance
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../../lib/cors';
import { queryOne, execute } from '../../../lib/database';
import type { ApiResponse } from '../../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { userHash } = req.query;
    if (!userHash || typeof userHash !== 'string') {
      res.status(400).json({ success: false, error: '缺少userHash参数' });
      return;
    }

    const row = await queryOne<any>(
      'SELECT balance FROM wallets WHERE user_hash = ?',
      [userHash]
    );

    if (!row) {
      res.status(404).json({ success: false, error: '钱包不存在' } as ApiResponse);
      return;
    }

    await execute(
      'UPDATE wallets SET last_active_at = ? WHERE user_hash = ?',
      [Math.floor(Date.now() / 1000), userHash]
    );

    res.status(200).json({
      success: true,
      data: { balance: row.balance }
    } as ApiResponse<{ balance: number }>);
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ success: false, error: '服务器错误' } as ApiResponse);
  }
}

export default withCors(handler);

