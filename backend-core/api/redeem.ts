/**
 * YourTJ Credit - 兑换码兑换
 * POST /api/redeem
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { withCors } from '../lib/cors';
import { queryOne, transaction } from '../lib/database';
import { readJsonBody } from '../lib/body';
import { verifySignedRequest, generateTransactionId } from '../shared/utils/transaction-verification';

function hmacSha256Hex(secret: string, input: string): string {
  return crypto.createHmac('sha256', secret).update(input, 'utf8').digest('hex');
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const body = await readJsonBody<any>(req);
    const code = String(body?.code || '').trim();
    if (!code || code.length < 3 || code.length > 64) {
      res.status(400).json({ success: false, error: '兑换码无效' });
      return;
    }

    const userHash = req.headers['x-user-hash'] as string;
    const signature = req.headers['x-signature'] as string;
    const timestampHeader = req.headers['x-timestamp'] as string;
    const nonceHeader = req.headers['x-nonce'] as string;

    if (!userHash || !signature || !timestampHeader || !nonceHeader) {
      res.status(401).json({ success: false, error: '缺少认证信息' });
      return;
    }

    const wallet = await queryOne<any>('SELECT user_hash, user_secret FROM wallets WHERE user_hash = ? LIMIT 1', [
      userHash
    ]);
    if (!wallet) {
      res.status(404).json({ success: false, error: '钱包不存在' });
      return;
    }
    if (!wallet.user_secret) {
      res.status(400).json({ success: false, error: '钱包未绑定密钥，无法进行签名验证' });
      return;
    }

    const verify = await verifySignedRequest(
      { code },
      {
        'x-user-hash': userHash,
        'x-signature': signature,
        'x-timestamp': timestampHeader,
        'x-nonce': nonceHeader
      },
      wallet.user_secret
    );
    if (!verify.valid) {
      res.status(401).json({ success: false, error: verify.error || '签名验证失败' });
      return;
    }

    const redeemSecret = process.env.REDEEM_CODE_SECRET?.trim();
    if (!redeemSecret) {
      res.status(500).json({ success: false, error: '服务器未配置兑换密钥' });
      return;
    }

    const systemRewardRow = await queryOne<any>('SELECT id FROM transaction_types WHERE name = ? LIMIT 1', [
      'system_reward'
    ]);
    if (!systemRewardRow?.id) {
      res.status(500).json({ success: false, error: '交易类型配置错误' });
      return;
    }
    const systemRewardTypeId = Number(systemRewardRow.id);

    const codeHash = hmacSha256Hex(redeemSecret, code);
    const now = Math.floor(Date.now() / 1000);

    const result = await transaction(async (tx) => {
      const codeRowResult = await tx.execute({
        sql: 'SELECT * FROM redeem_codes WHERE code_hash = ? LIMIT 1',
        args: [codeHash]
      });
      const codeRow = (codeRowResult.rows as any[])?.[0];
      if (!codeRow) throw new Error('兑换码不存在');
      if (Number(codeRow.enabled) !== 1) throw new Error('兑换码已禁用');
      if (codeRow.expires_at && Number(codeRow.expires_at) > 0 && now >= Number(codeRow.expires_at)) {
        throw new Error('兑换码已过期');
      }
      if (codeRow.max_uses && Number(codeRow.max_uses) > 0 && Number(codeRow.used_count) >= Number(codeRow.max_uses)) {
        throw new Error('兑换码已被用完');
      }

      const existsResult = await tx.execute({
        sql: 'SELECT 1 FROM redeem_redemptions WHERE code_hash = ? AND user_hash = ? LIMIT 1',
        args: [codeHash, userHash]
      });
      if ((existsResult.rows as any[])?.length) throw new Error('您已兑换过该兑换码');

      const value = Number(codeRow.value);
      if (!Number.isFinite(value) || value <= 0) throw new Error('兑换码配置无效');

      const txId = generateTransactionId();
      const redemptionId = `RDM-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();

      await tx.execute({
        sql: `INSERT INTO transactions
              (tx_id, type_id, from_user_hash, to_user_hash, amount, status, title, description, metadata, created_at, completed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          txId,
          systemRewardTypeId,
          null,
          userHash,
          value,
          'completed',
          '兑换码奖励',
          codeRow.title ? String(codeRow.title) : '活动兑换',
          JSON.stringify({ redemptionId, codeHint: codeRow.code_hint || null }),
          now,
          now
        ]
      });

      await tx.execute({
        sql: 'UPDATE wallets SET balance = balance + ?, last_active_at = ? WHERE user_hash = ?',
        args: [value, now, userHash]
      });

      await tx.execute({
        sql: `INSERT INTO redeem_redemptions
              (redemption_id, code_hash, user_hash, tx_id, redeemed_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [redemptionId, codeHash, userHash, txId, now]
      });

      await tx.execute({
        sql: 'UPDATE redeem_codes SET used_count = used_count + 1, updated_at = ? WHERE code_hash = ?',
        args: [now, codeHash]
      });

      return { txId, redemptionId, value };
    });

    res.status(200).json({ success: true, data: result, message: '兑换成功' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '服务器错误';
    console.error('Redeem error:', error);
    res.status(400).json({ success: false, error: msg });
  }
}

export default withCors(handler);

