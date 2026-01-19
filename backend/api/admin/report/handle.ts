/**
 * YourTJ Credit - 管理员处理举报API
 * POST /api/admin/report/handle
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../../lib/cors';
import { queryOne, execute } from '../../../lib/database';
import type { Report, ApiResponse } from '../../../shared/types';

// 简单的管理员验证（实际应该使用更安全的方式）
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin-secret-key-2026';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { reportId, action, adminNote } = req.body;
    const adminToken = req.headers['x-admin-token'] as string;

    // 验证管理员权限
    if (adminToken !== ADMIN_SECRET) {
      res.status(403).json({ success: false, error: '无管理员权限' });
      return;
    }

    // 验证参数
    if (!reportId || !action) {
      res.status(400).json({ success: false, error: '缺少必要参数' });
      return;
    }

    if (!['resolved', 'rejected'].includes(action)) {
      res.status(400).json({ success: false, error: '无效的操作' });
      return;
    }

    // 查询举报
    const report = await queryOne<any>(
      'SELECT * FROM reports WHERE report_id = ?',
      [reportId]
    );

    if (!report) {
      res.status(404).json({ success: false, error: '举报不存在' });
      return;
    }

    if (report.status !== 'pending' && report.status !== 'reviewing') {
      res.status(400).json({ success: false, error: '该举报已被处理' });
      return;
    }

    // 更新举报状态
    const now = Math.floor(Date.now() / 1000);
    await execute(
      `UPDATE reports
       SET status = ?, admin_note = ?, resolved_at = ?
       WHERE report_id = ?`,
      [action, adminNote || null, now, reportId]
    );

    // 查询更新后的举报
    const updatedReport = await queryOne<any>(
      'SELECT * FROM reports WHERE report_id = ?',
      [reportId]
    );

    if (!updatedReport) {
      res.status(500).json({ success: false, error: '举报更新失败' });
      return;
    }

    const reportData: Report = {
      id: updatedReport.id,
      reportId: updatedReport.report_id,
      txId: updatedReport.tx_id,
      reporterUserHash: updatedReport.reporter_user_hash,
      type: updatedReport.type,
      reason: updatedReport.reason,
      description: updatedReport.description,
      status: updatedReport.status,
      adminNote: updatedReport.admin_note,
      createdAt: updatedReport.created_at * 1000,
      resolvedAt: updatedReport.resolved_at ? updatedReport.resolved_at * 1000 : undefined
    };

    res.status(200).json({
      success: true,
      data: reportData,
      message: '举报处理成功'
    } as ApiResponse<Report>);
  } catch (error) {
    console.error('Handle report error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
