/**
 * YourTJ Credit - 创建举报/申诉API
 * POST /api/report/create
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { queryOne, execute } from '../../lib/database';
import { generateReportId, verifySignedRequest } from '../../shared/utils/transaction-verification';
import type { Report, ApiResponse, ReportCreateParams } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { txId, type, reason, description, timestamp, nonce } = req.body as ReportCreateParams & { timestamp: number; nonce: string };

    // 验证参数
    if (!txId || !type || !reason) {
      res.status(400).json({ success: false, error: '缺少必要参数' });
      return;
    }

    if (!['appeal', 'report'].includes(type)) {
      res.status(400).json({ success: false, error: '无效的举报类型' });
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

    // 1. 获取举报人钱包和密钥
    const reporterWallet = await queryOne<any>(
      'SELECT user_hash, user_secret FROM wallets WHERE user_hash = ?',
      [userHash]
    );

    if (!reporterWallet) {
      res.status(404).json({ success: false, error: '钱包不存在' });
      return;
    }
    if (!reporterWallet.user_secret) {
      res.status(400).json({ success: false, error: '钱包未绑定密钥，无法进行签名验证' });
      return;
    }

    // 2. 验证签名
    const verifyResult = await verifySignedRequest(
      { txId, type, reason, description },
      {
        'x-user-hash': userHash,
        'x-signature': signature,
        'x-timestamp': timestampHeader,
        'x-nonce': nonceHeader
      },
      reporterWallet.user_secret
    );

    if (!verifyResult.valid) {
      res.status(401).json({
        success: false,
        error: verifyResult.error || '签名验证失败'
      });
      return;
    }

    // 3. 验证交易是否存在
    const transaction = await queryOne<any>(
      'SELECT * FROM transactions WHERE tx_id = ?',
      [txId]
    );

    if (!transaction) {
      res.status(404).json({ success: false, error: '交易不存在' });
      return;
    }

    // 4. 验证举报人是否与交易相关
    if (transaction.from_user_hash !== userHash && transaction.to_user_hash !== userHash) {
      res.status(403).json({ success: false, error: '只能举报与自己相关的交易' });
      return;
    }

    // 5. 检查是否已经举报过
    const existingReport = await queryOne<any>(
      'SELECT id FROM reports WHERE tx_id = ? AND reporter_user_hash = ?',
      [txId, userHash]
    );

    if (existingReport) {
      res.status(400).json({ success: false, error: '您已经对此交易提交过举报' });
      return;
    }

    // 6. 创建举报记录
    const reportId = generateReportId();
    const now = Math.floor(Date.now() / 1000);

    await execute(
      `INSERT INTO reports
      (report_id, tx_id, reporter_user_hash, type, reason, description, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [reportId, txId, userHash, type, reason, description || null, 'pending', now]
    );

    // 7. 查询完整的举报信息
    const reportRow = await queryOne<any>(
      'SELECT * FROM reports WHERE report_id = ?',
      [reportId]
    );

    if (!reportRow) {
      res.status(500).json({ success: false, error: '举报创建失败' });
      return;
    }

    const report: Report = {
      id: reportRow.id,
      reportId: reportRow.report_id,
      txId: reportRow.tx_id,
      reporterUserHash: reportRow.reporter_user_hash,
      type: reportRow.type,
      reason: reportRow.reason,
      description: reportRow.description,
      status: reportRow.status,
      adminNote: reportRow.admin_note,
      createdAt: reportRow.created_at * 1000,
      resolvedAt: reportRow.resolved_at ? reportRow.resolved_at * 1000 : undefined
    };

    res.status(201).json({
      success: true,
      data: report,
      message: '举报提交成功'
    } as ApiResponse<Report>);
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
