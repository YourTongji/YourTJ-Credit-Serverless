/**
 * YourTJ Credit - 接受任务API
 * POST /api/task/accept
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { queryOne, execute } from '../../lib/database';
import { verifySignedRequest } from '../../shared/utils/transaction-verification';
import { readJsonBody } from '../../lib/body';
import type { Task, ApiResponse } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { taskId } = await readJsonBody<any>(req);

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

    // 1. 获取接受者钱包和密钥
    const acceptorWallet = await queryOne<any>(
      'SELECT user_hash, user_secret FROM wallets WHERE user_hash = ?',
      [userHash]
    );

    if (!acceptorWallet) {
      res.status(404).json({ success: false, error: '钱包不存在' });
      return;
    }
    if (!acceptorWallet.user_secret) {
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
      acceptorWallet.user_secret
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

    // 4. 检查任务状态
    if (task.status !== 'open') {
      res.status(400).json({ success: false, error: '任务已被接受或已完成' });
      return;
    }

    // 5. 检查是否是创建者
    if (task.creator_user_hash === userHash) {
      res.status(400).json({ success: false, error: '不能接受自己发布的任务' });
      return;
    }

    // 6. 更新任务状态
    const now = Math.floor(Date.now() / 1000);
    await execute(
      `UPDATE tasks
       SET status = ?, acceptor_user_hash = ?, accepted_at = ?
       WHERE task_id = ?`,
      ['in_progress', userHash, now, taskId]
    );

    // 7. 查询更新后的任务
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
      message: '任务接受成功'
    } as ApiResponse<Task>);
  } catch (error) {
    console.error('Accept task error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
