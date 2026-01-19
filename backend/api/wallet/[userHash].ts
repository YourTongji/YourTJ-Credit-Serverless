/**
 * YourTJ Credit - 获取钱包信息API
 * GET /api/wallet/[userHash]
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { queryOne, execute } from '../../lib/database';
import type { Wallet, ApiResponse } from '../../shared/types';

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
      'SELECT * FROM wallets WHERE user_hash = ?',
      [userHash]
    );

    if (!row) {
      res.status(404).json({
        success: false,
        error: '钱包不存在'
      } as ApiResponse);
      return;
    }

    // 更新最后活跃时间
    await execute(
      'UPDATE wallets SET last_active_at = ? WHERE user_hash = ?',
      [Math.floor(Date.now() / 1000), userHash]
    );

    const wallet: Wallet = {
      userHash: row.user_hash,
      balance: row.balance,
      createdAt: row.created_at * 1000,
      lastActiveAt: Math.floor(Date.now() / 1000) * 1000
    };

    res.status(200).json({
      success: true,
      data: wallet
    } as ApiResponse<Wallet>);
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
