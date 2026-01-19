/**
 * YourTJ Credit - 转账API
 * POST /api/transaction/transfer
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { queryOne, execute } from '../../lib/database';
import { generateTransactionId, verifySignedRequest } from '../../shared/utils/transaction-verification';
import { readJsonBody } from '../../lib/body';
import type { Transaction, ApiResponse } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { toUserHash, amount, title, description } = await readJsonBody<any>(req);

    // 验证参数
    if (!toUserHash || !amount || !title) {
      res.status(400).json({ success: false, error: '缺少必要参数' });
      return;
    }

    if (amount <= 0) {
      res.status(400).json({ success: false, error: '转账金额必须大于0' });
      return;
    }

    // 获取请求头
    const userHash = req.headers['x-user-hash'] as string;
    const signature = req.headers['x-signature'] as string;
    const timestampHeader = req.headers['x-timestamp'] as string;
    const nonceHeader = req.headers['x-nonce'] as string;

    if (!userHash || !signature || !timestampHeader || !nonceHeader) {
      res.status(401).json({ success: false, error: '缺少认证信息' });
      return;
    }

    // 检查是否转账给自己
    if (userHash === toUserHash) {
      res.status(400).json({ success: false, error: '不能转账给自己' });
      return;
    }

    // 1. 获取发送方钱包和密钥
    const senderWallet = await queryOne<any>(
      'SELECT user_hash, user_secret, balance FROM wallets WHERE user_hash = ?',
      [userHash]
    );

    if (!senderWallet) {
      res.status(404).json({ success: false, error: '发送方钱包不存在' });
      return;
    }
    if (!senderWallet.user_secret) {
      res.status(400).json({ success: false, error: '钱包未绑定密钥，无法进行签名验证' });
      return;
    }

    // 2. 验证签名
    const verifyResult = await verifySignedRequest(
      { toUserHash, amount, title, description },
      {
        'x-user-hash': userHash,
        'x-signature': signature,
        'x-timestamp': timestampHeader,
        'x-nonce': nonceHeader
      },
      senderWallet.user_secret
    );

    if (!verifyResult.valid) {
      res.status(401).json({
        success: false,
        error: verifyResult.error || '签名验证失败'
      });
      return;
    }

    // 3. 检查余额
    if (senderWallet.balance < amount) {
      res.status(400).json({ success: false, error: '余额不足' });
      return;
    }

    // 4. 检查接收方钱包是否存在
    const receiverWallet = await queryOne<any>(
      'SELECT user_hash FROM wallets WHERE user_hash = ?',
      [toUserHash]
    );

    if (!receiverWallet) {
      res.status(404).json({ success: false, error: '接收方钱包不存在' });
      return;
    }

    // 5. 获取transfer交易类型ID
    const typeRow = await queryOne<any>(
      'SELECT id FROM transaction_types WHERE name = ?',
      ['transfer']
    );

    if (!typeRow) {
      res.status(500).json({ success: false, error: '交易类型配置错误' });
      return;
    }

    const typeId = typeRow.id;

    // 6. 开始事务：扣除发送方余额
    await execute(
      'UPDATE wallets SET balance = balance - ?, last_active_at = ? WHERE user_hash = ?',
      [amount, Math.floor(Date.now() / 1000), userHash]
    );

    // 7. 增加接收方余额
    await execute(
      'UPDATE wallets SET balance = balance + ?, last_active_at = ? WHERE user_hash = ?',
      [amount, Math.floor(Date.now() / 1000), toUserHash]
    );

    // 8. 创建交易记录
    const txId = generateTransactionId();
    const now = Math.floor(Date.now() / 1000);

    await execute(
      `INSERT INTO transactions
      (tx_id, type_id, from_user_hash, to_user_hash, amount, status, title, description, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txId,
        typeId,
        userHash,
        toUserHash,
        amount,
        'completed',
        title,
        description || null,
        now,
        now
      ]
    );

    // 9. 查询完整的交易信息
    const txRow = await queryOne<any>(
      `SELECT t.*, tt.name as type_name, tt.display_name as type_display_name
       FROM transactions t
       JOIN transaction_types tt ON t.type_id = tt.id
       WHERE t.tx_id = ?`,
      [txId]
    );

    if (!txRow) {
      res.status(500).json({ success: false, error: '交易创建失败' });
      return;
    }

    const tx: Transaction = {
      id: txRow.id,
      txId: txRow.tx_id,
      typeId: txRow.type_id,
      typeName: txRow.type_name,
      typeDisplayName: txRow.type_display_name,
      fromUserHash: txRow.from_user_hash,
      toUserHash: txRow.to_user_hash,
      amount: txRow.amount,
      status: txRow.status,
      title: txRow.title,
      description: txRow.description,
      metadata: txRow.metadata,
      createdAt: txRow.created_at * 1000,
      completedAt: txRow.completed_at ? txRow.completed_at * 1000 : undefined
    };

    res.status(201).json({
      success: true,
      data: tx,
      message: '转账成功'
    } as ApiResponse<Transaction>);
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
