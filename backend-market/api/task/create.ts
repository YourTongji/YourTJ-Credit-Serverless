/**
 * YourTJ Credit - 创建任务API
 * POST /api/task/create
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { queryOne, execute } from '../../lib/database';
import { generateTaskId, verifySignedRequest } from '../../shared/utils/transaction-verification';
import { readJsonBody } from '../../lib/body';
import type { Task, ApiResponse, TaskCreateParams } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const body = await readJsonBody<TaskCreateParams>(req);
    const { title, description, contactInfo, rewardAmount } = body;

    // 验证参数
    if (!title || !description || !rewardAmount) {
      res.status(400).json({ success: false, error: '缺少必要参数' });
      return;
    }

    if (rewardAmount <= 0) {
      res.status(400).json({ success: false, error: '悬赏金额必须大于0' });
      return;
    }

    if (contactInfo && String(contactInfo).length > 300) {
      res.status(400).json({ success: false, error: '联系方式过长' });
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
      'SELECT user_hash, user_secret, balance FROM wallets WHERE user_hash = ?',
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
      contactInfo ? { title, description, contactInfo, rewardAmount } : { title, description, rewardAmount },
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

    // 3. 检查余额
    if (creatorWallet.balance < rewardAmount) {
      res.status(400).json({ success: false, error: '余额不足' });
      return;
    }

    // 4. 冻结悬赏金额（扣除余额）
    await execute(
      'UPDATE wallets SET balance = balance - ? WHERE user_hash = ?',
      [rewardAmount, userHash]
    );

    // 5. 创建任务
    const taskId = generateTaskId();
    const now = Math.floor(Date.now() / 1000);

    await execute(
      `INSERT INTO tasks
      (task_id, creator_user_hash, title, description, contact_info, reward_amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, userHash, title, description, contactInfo || null, rewardAmount, 'open', now]
    );

    // 6. 查询完整的任务信息
    const taskRow = await queryOne<any>(
      'SELECT * FROM tasks WHERE task_id = ?',
      [taskId]
    );

    if (!taskRow) {
      res.status(500).json({ success: false, error: '任务创建失败' });
      return;
    }

    const task: Task = {
      id: taskRow.id,
      taskId: taskRow.task_id,
      creatorUserHash: taskRow.creator_user_hash,
      title: taskRow.title,
      description: taskRow.description,
      contactInfo: taskRow.contact_info || undefined,
      rewardAmount: taskRow.reward_amount,
      status: taskRow.status,
      acceptorUserHash: taskRow.acceptor_user_hash,
      txId: taskRow.tx_id,
      createdAt: taskRow.created_at * 1000,
      acceptedAt: taskRow.accepted_at ? taskRow.accepted_at * 1000 : undefined,
      completedAt: taskRow.completed_at ? taskRow.completed_at * 1000 : undefined
    };

    res.status(201).json({
      success: true,
      data: task,
      message: '任务创建成功'
    } as ApiResponse<Task>);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
