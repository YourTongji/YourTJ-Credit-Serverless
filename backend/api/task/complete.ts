/**
 * YourTJ Credit - 完成任务API
 * POST /api/task/complete
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { queryOne, execute } from '../../lib/database';
import { generateTransactionId, verifySignedRequest } from '../../shared/utils/transaction-verification';
import type { Task, ApiResponse } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { taskId, timestamp, nonce } = req.body;

    // 验证参数
    if (!taskId) {
      res.status(400).json({ success: false, error: '缺少任务ID' });
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

    // 1. 获取创建者钱包和密钥
    const creatorWallet = await queryOne<any>(
      'SELECT user_hash, user_secret FROM wallets WHERE user_hash = ?',
      [userHash]
    );

    if (!creatorWallet) {
      res.status(404).json({ success: false, error: '钱包不存在' });
      return;
    }
    if (!creatorWallet.user_secret) {
      res.status(400).json({ success: false, error: '钱包未绑定密钥，无法进行签名验证' });
      return;
    }

    // 2. 验证签名
    const verifyResult = await verifySignedRequest(
      { taskId },
      {
        'x-user-hash': userHash,
        'x-signature': signature,
        'x-timestamp': timestampHeader,
        'x-nonce': nonceHeader
      },
      creatorWallet.user_secret
    );

    if (!verifyResult.valid) {
      res.status(401).json({
        success: false,
        error: verifyResult.error || '签名验证失败'
      });
      return;
    }

    // 3. 查询任务
    const task = await queryOne<any>(
      'SELECT * FROM tasks WHERE task_id = ?',
      [taskId]
    );

    if (!task) {
      res.status(404).json({ success: false, error: '任务不存在' });
      return;
    }

    // 4. 检查是否是创建者
    if (task.creator_user_hash !== userHash) {
      res.status(403).json({ success: false, error: '只有任务创建者可以确认完成' });
      return;
    }

    // 5. 检查任务状态
    if (task.status !== 'in_progress') {
      res.status(400).json({ success: false, error: '任务未在进行中' });
      return;
    }

    // 6. 检查是否有接受者
    if (!task.acceptor_user_hash) {
      res.status(400).json({ success: false, error: '任务未被接受' });
      return;
    }

    // 7. 获取task_reward交易类型ID
    const typeRow = await queryOne<any>(
      'SELECT id FROM transaction_types WHERE name = ?',
      ['task_reward']
    );

    if (!typeRow) {
      res.status(500).json({ success: false, error: '交易类型配置错误' });
      return;
    }

    const typeId = typeRow.id;

    // 8. 创建交易记录（将悬赏金额转给接受者）
    const txId = generateTransactionId();
    const now = Math.floor(Date.now() / 1000);

    await execute(
      `INSERT INTO transactions
      (tx_id, type_id, from_user_hash, to_user_hash, amount, status, title, description, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txId,
        typeId,
        task.creator_user_hash,
        task.acceptor_user_hash,
        task.reward_amount,
        'completed',
        `任务悬赏：${task.title}`,
        task.description,
        now,
        now
      ]
    );

    // 9. 增加接受者余额
    await execute(
      'UPDATE wallets SET balance = balance + ?, last_active_at = ? WHERE user_hash = ?',
      [task.reward_amount, now, task.acceptor_user_hash]
    );

    // 10. 更新任务状态
    await execute(
      `UPDATE tasks
       SET status = ?, tx_id = ?, completed_at = ?
       WHERE task_id = ?`,
      ['completed', txId, now, taskId]
    );

    // 11. 查询更新后的任务
    const updatedTask = await queryOne<any>(
      'SELECT * FROM tasks WHERE task_id = ?',
      [taskId]
    );

    if (!updatedTask) {
      res.status(500).json({ success: false, error: '任务更新失败' });
      return;
    }

    const taskData: Task = {
      id: updatedTask.id,
      taskId: updatedTask.task_id,
      creatorUserHash: updatedTask.creator_user_hash,
      title: updatedTask.title,
      description: updatedTask.description,
      rewardAmount: updatedTask.reward_amount,
      status: updatedTask.status,
      acceptorUserHash: updatedTask.acceptor_user_hash,
      txId: updatedTask.tx_id,
      createdAt: updatedTask.created_at * 1000,
      acceptedAt: updatedTask.accepted_at ? updatedTask.accepted_at * 1000 : undefined,
      completedAt: updatedTask.completed_at ? updatedTask.completed_at * 1000 : undefined
    };

    res.status(200).json({
      success: true,
      data: taskData,
      message: '任务完成，悬赏已发放'
    } as ApiResponse<Task>);
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
