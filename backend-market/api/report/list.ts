/**
 * YourTJ Credit - 获取举报列表API
 * GET /api/report/list
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { query } from '../../lib/database';
import type { Report, ApiResponse, PaginatedResponse } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const userHash = req.query.userHash as string;
    const offset = (page - 1) * limit;

    // 构建查询条件
    let whereClause = '1=1';
    const params: any[] = [];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (userHash) {
      whereClause += ' AND reporter_user_hash = ?';
      params.push(userHash);
    }

    // 查询举报列表
    const reports = await query<any>(
      `SELECT * FROM reports
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // 查询总数
    const countResult = await query<any>(
      `SELECT COUNT(*) as total FROM reports WHERE ${whereClause}`,
      params
    );
    const total = countResult[0]?.total || 0;

    const reportList: Report[] = reports.map(row => ({
      id: row.id,
      reportId: row.report_id,
      txId: row.tx_id,
      reporterUserHash: row.reporter_user_hash,
      type: row.type,
      reason: row.reason,
      description: row.description,
      status: row.status,
      adminNote: row.admin_note,
      createdAt: row.created_at * 1000,
      resolvedAt: row.resolved_at ? row.resolved_at * 1000 : undefined
    }));

    const response: PaginatedResponse<Report> = {
      data: reportList,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };

    res.status(200).json({
      success: true,
      data: response
    } as ApiResponse<PaginatedResponse<Report>>);
  } catch (error) {
    console.error('List reports error:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
