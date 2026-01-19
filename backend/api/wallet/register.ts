/**
 * YourTJ Credit - 钱包注册API
 * POST /api/wallet/register
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { queryOne, execute } from '../../lib/database';
import type { Wallet, ApiResponse } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { userHash, userSecret, publicKey } = req.body;

    if (!userHash || typeof userHash !== 'string') {
      res.status(400).json({ success: false, error: '缺少userHash参数' });
      return;
    }

    // 基础格式校验（64位十六进制）
    if (!/^[a-f0-9]{64}$/i.test(userHash)) {
      res.status(400).json({ success: false, error: 'userHash格式无效' });
      return;
    }

    // 检查钱包是否已存在
    const existing = await queryOne<any>(
      'SELECT * FROM wallets WHERE user_hash = ?',
      [userHash]
    );

    if (existing) {
      // 如果钱包缺少 user_secret，且客户端提供了 userSecret，则补齐（用于验签）
      if (!existing.user_secret && userSecret && typeof userSecret === 'string') {
        await execute(
          'UPDATE wallets SET user_secret = ?, public_key = COALESCE(public_key, ?), last_active_at = ? WHERE user_hash = ?',
          [userSecret, publicKey || null, Math.floor(Date.now() / 1000), userHash]
        );
      } else {
      // 更新最后活跃时间
      await execute(
        'UPDATE wallets SET last_active_at = ? WHERE user_hash = ?',
        [Math.floor(Date.now() / 1000), userHash]
      );
      }

      const wallet: Wallet = {
        userHash: existing.user_hash,
        balance: existing.balance,
        createdAt: existing.created_at * 1000,
        lastActiveAt: Math.floor(Date.now() / 1000) * 1000
      };

      res.status(200).json({
        success: true,
        data: wallet,
        message: '钱包已存在'
      } as ApiResponse<Wallet>);
      return;
    }

    // 创建新钱包
    const now = Math.floor(Date.now() / 1000);
    await execute(
      'INSERT INTO wallets (user_hash, user_secret, public_key, balance, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?)',
      [userHash, userSecret || null, publicKey || null, 0, now, now]
    );

    const wallet: Wallet = {
      userHash,
      balance: 0,
      createdAt: now * 1000,
      lastActiveAt: now * 1000
    };

    res.status(201).json({
      success: true,
      data: wallet,
      message: '钱包创建成功'
    } as ApiResponse<Wallet>);
  } catch (error) {
    console.error('Register wallet error:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
