/**
 * YourTJ Credit - 创建交易API
 * POST /api/transaction/create
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { query, queryOne, execute } from '../../lib/database';
import { generateTransactionId } from '../../shared/utils/transaction-verification';
import type { Transaction, ApiResponse, TransactionCreateParams } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { type, fromUserHash, toUserHash, amount, title, description, metadata } = req.body as TransactionCreateParams;

    // 验证参数
    if (!type || !amount || !title) {
      res.status(400).json({ success: false, error: '缺少必要参数' });
      return;
    }

    if (amount <= 0) {
      res.status(400).json({ success: false, error: '交易金额必须大于0' });
      return;
    }

    // 开始事务
    const db = await import('../../lib/database');

    // 1. 获取交易类型ID
    const typeRow = await queryOne<any>(
      'SELECT id FROM transaction_types WHERE name = ?',
      [type]
    );

    if (!typeRow) {
      res.status(400).json({ success: false, error: '无效的交易类型' });
      return;
    }

    const typeId = typeRow.id;

    // 2. 检查发送方余额（如果有发送方）
    if (fromUserHash) {
      const senderWallet = await queryOne<any>(
        'SELECT balance FROM wallets WHERE user_hash = ?',
        [fromUserHash]
      );

      if (!senderWallet) {
        res.status(404).json({ success: false, error: '发送方钱包不存在' });
        return;
      }

      if (senderWallet.balance < amount) {
        res.status(400).json({ success: false, error: '余额不足' });
        return;
      }

      // 扣除发送方余额
      await execute(
        'UPDATE wallets SET balance = balance - ? WHERE user_hash = ?',
        [amount, fromUserHash]
      );
    }

    // 3. 增加接收方余额（如果有接收方）
    if (toUserHash) {
      const receiverWallet = await queryOne<any>(
        'SELECT id FROM wallets WHERE user_hash = ?',
        [toUserHash]
      );

      if (!receiverWallet) {
        res.status(404).json({ success: false, error: '接收方钱包不存在' });
        return;
      }

      await execute(
        'UPDATE wallets SET balance = balance + ? WHERE user_hash = ?',
        [amount, toUserHash]
      );
    }

    // 4. 创建交易记录
    const txId = generateTransactionId();
    const now = Math.floor(Date.now() / 1000);

    await execute(
      `INSERT INTO transactions
      (tx_id, type_id, from_user_hash, to_user_hash, amount, status, title, description, metadata, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txId,
        typeId,
        fromUserHash || null,
        toUserHash || null,
        amount,
        'completed',
        title,
        description || null,
        metadata ? JSON.stringify(metadata) : null,
        now,
        now
      ]
    );

    // 5. 查询完整的交易信息
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
      message: '交易创建成功'
    } as ApiResponse<Transaction>);
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
