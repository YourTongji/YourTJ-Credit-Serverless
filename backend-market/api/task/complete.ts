/**
 * YourTJ Credit - 完成任务API
 * POST /api/task/complete
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { queryOne, transaction } from '../../lib/database';
import { generateTransactionId, verifySignedRequest } from '../../shared/utils/transaction-verification';
import { readJsonBody } from '../../lib/body';
import type { Task, ApiResponse } from '../../shared/types';

type TaskCompleteAction = 'submit' | 'confirm' | 'cancel' | 'reject' | 'delete';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { taskId, action } = await readJsonBody<any>(req);

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
      action ? { taskId, action } : { taskId },
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

    const resolvedAction: TaskCompleteAction | null = (() => {
      if (
        action === 'submit' ||
        action === 'confirm' ||
        action === 'cancel' ||
        action === 'reject' ||
        action === 'delete'
      ) {
        return action;
      }
      if (task.acceptor_user_hash && task.acceptor_user_hash === userHash) return 'submit';
      if (task.creator_user_hash === userHash) return 'confirm';
      return null;
    })();

    if (!resolvedAction) {
      res.status(403).json({ success: false, error: '无权操作此任务' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);

    if (resolvedAction === 'submit') {
      if (!task.acceptor_user_hash || task.acceptor_user_hash !== userHash) {
        res.status(403).json({ success: false, error: '只有接单者可以提交任务' });
        return;
      }
      if (task.status !== 'in_progress') {
        res.status(400).json({ success: false, error: '任务未在进行中，无法提交' });
        return;
      }

      await transaction(async (tx) => {
        await tx.execute({
          sql: `UPDATE tasks
                SET status = ?, submitted_at = ?
                WHERE task_id = ?`,
          args: ['submitted', now, taskId]
        });
      });
    } else if (resolvedAction === 'cancel') {
      if (!task.acceptor_user_hash || task.acceptor_user_hash !== userHash) {
        res.status(403).json({ success: false, error: '只有接单者可以取消接单' });
        return;
      }
      if (task.status !== 'in_progress' && task.status !== 'submitted') {
        res.status(400).json({ success: false, error: '当前状态无法取消接单' });
        return;
      }

      await transaction(async (tx) => {
        await tx.execute({
          sql: `UPDATE tasks
                SET status = ?, acceptor_user_hash = NULL, accepted_at = NULL, submitted_at = NULL
                WHERE task_id = ?`,
          args: ['open', taskId]
        });
      });
    } else if (resolvedAction === 'reject') {
      if (task.creator_user_hash !== userHash) {
        res.status(403).json({ success: false, error: '只有任务创建者可以打回任务' });
        return;
      }
      if (!task.acceptor_user_hash) {
        res.status(400).json({ success: false, error: '任务未被接受' });
        return;
      }
      if (task.status !== 'submitted' && task.status !== 'in_progress') {
        res.status(400).json({ success: false, error: '当前状态无法打回' });
        return;
      }

      await transaction(async (tx) => {
        await tx.execute({
          sql: `UPDATE tasks
                SET status = ?, acceptor_user_hash = NULL, accepted_at = NULL, submitted_at = NULL
                WHERE task_id = ?`,
          args: ['open', taskId]
        });
      });
    } else if (resolvedAction === 'delete') {
      if (task.creator_user_hash !== userHash) {
        res.status(403).json({ success: false, error: '只有任务创建者可以删除任务' });
        return;
      }
      if (task.status !== 'open') {
        res.status(400).json({ success: false, error: '任务已被接单，无法删除' });
        return;
      }

      await transaction(async (tx) => {
        await tx.execute({
          sql: 'UPDATE wallets SET balance = balance + ?, last_active_at = ? WHERE user_hash = ?',
          args: [task.reward_amount, now, task.creator_user_hash]
        });
        await tx.execute({
          sql: `UPDATE tasks
                SET status = ?
                WHERE task_id = ?`,
          args: ['cancelled', taskId]
        });
      });
    } else {
      // confirm
      if (task.creator_user_hash !== userHash) {
        res.status(403).json({ success: false, error: '只有任务创建者可以确认完成' });
        return;
      }
      if (!task.acceptor_user_hash) {
        res.status(400).json({ success: false, error: '任务未被接受' });
        return;
      }
      if (task.status !== 'submitted') {
        res.status(400).json({ success: false, error: '任务未提交，无法确认结算' });
        return;
      }

      // 获取task_reward交易类型ID
      const typeRow = await queryOne<any>(
        'SELECT id FROM transaction_types WHERE name = ?',
        ['task_reward']
      );
      if (!typeRow) {
        res.status(500).json({ success: false, error: '交易类型配置错误' });
        return;
      }

      const typeId = typeRow.id;
      const txId = generateTransactionId();

      await transaction(async (tx) => {
        await tx.execute({
          sql: `INSERT INTO transactions
                (tx_id, type_id, from_user_hash, to_user_hash, amount, status, title, description, created_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
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
        });

        await tx.execute({
          sql: 'UPDATE wallets SET balance = balance + ?, last_active_at = ? WHERE user_hash = ?',
          args: [task.reward_amount, now, task.acceptor_user_hash]
        });

        await tx.execute({
          sql: `UPDATE tasks
                SET status = ?, tx_id = ?, completed_at = ?
                WHERE task_id = ?`,
          args: ['completed', txId, now, taskId]
        });
      });
    }

    const updatedTask = await queryOne<any>('SELECT * FROM tasks WHERE task_id = ?', [taskId]);
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
      contactInfo: undefined,
      rewardAmount: updatedTask.reward_amount,
      status: updatedTask.status,
      acceptorUserHash: updatedTask.acceptor_user_hash,
      txId: updatedTask.tx_id,
      createdAt: updatedTask.created_at * 1000,
      acceptedAt: updatedTask.accepted_at ? updatedTask.accepted_at * 1000 : undefined,
      submittedAt: updatedTask.submitted_at ? updatedTask.submitted_at * 1000 : undefined,
      completedAt: updatedTask.completed_at ? updatedTask.completed_at * 1000 : undefined
    };

    res.status(200).json({
      success: true,
      data: taskData,
      message:
        resolvedAction === 'submit'
          ? '任务已提交，等待发布者确认'
          : resolvedAction === 'cancel'
            ? '已取消接单，任务已重新开放'
            : resolvedAction === 'reject'
              ? '已打回任务，任务已重新开放'
              : resolvedAction === 'delete'
                ? '任务已删除并退回悬赏金额'
                : '任务确认完成，悬赏已发放'
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
