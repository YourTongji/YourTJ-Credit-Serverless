/**
 * YourTJ Credit - 管理员统计数据API
 * GET /api/admin/stats
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { query, queryOne } from '../../lib/database';
import type { ApiResponse } from '../../shared/types';

// 简单的管理员验证
const ADMIN_SECRET = String(process.env.ADMIN_SECRET || 'admin-secret-key-2026').trim();

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const rawHeader = req.headers['x-admin-token'];
    const adminToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    // 验证管理员权限
    if (String(adminToken || '').trim() !== ADMIN_SECRET) {
      res.status(403).json({ success: false, error: '无管理员权限' });
      return;
    }

    // 1. 钱包总数
    const walletCount = await queryOne<any>('SELECT COUNT(*) as count FROM wallets');

    // 2. 交易总数和总金额
    const transactionStats = await queryOne<any>(
      'SELECT COUNT(*) as count, SUM(amount) as total_amount FROM transactions WHERE status = ?',
      ['completed']
    );

    // 3. 任务统计
    const taskStats = await query<any>(
      `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`
    );

    // 4. 商品统计
    const productStats = await query<any>(
      `SELECT status, COUNT(*) as count FROM products GROUP BY status`
    );

    // 5. 举报统计
    const reportStats = await query<any>(
      `SELECT status, COUNT(*) as count FROM reports GROUP BY status`
    );

    // 6. 最近7天交易趋势
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;
    const recentTransactions = await query<any>(
      `SELECT
        DATE(created_at, 'unixepoch') as date,
        COUNT(*) as count,
        SUM(amount) as amount
       FROM transactions
       WHERE created_at >= ? AND status = ?
       GROUP BY DATE(created_at, 'unixepoch')
       ORDER BY date DESC`,
      [sevenDaysAgo, 'completed']
    );

    // 7. 交易类型分布
    const transactionTypeStats = await query<any>(
      `SELECT
        tt.display_name,
        COUNT(*) as count,
        SUM(t.amount) as total_amount
       FROM transactions t
       JOIN transaction_types tt ON t.type_id = tt.id
       WHERE t.status = ?
       GROUP BY tt.id, tt.display_name`,
      ['completed']
    );

    const stats = {
      overview: {
        totalWallets: walletCount?.count || 0,
        totalTransactions: transactionStats?.count || 0,
        totalAmount: transactionStats?.total_amount || 0
      },
      tasks: taskStats.reduce((acc: any, row: any) => {
        acc[row.status] = row.count;
        return acc;
      }, {}),
      products: productStats.reduce((acc: any, row: any) => {
        acc[row.status] = row.count;
        return acc;
      }, {}),
      reports: reportStats.reduce((acc: any, row: any) => {
        acc[row.status] = row.count;
        return acc;
      }, {}),
      recentTrend: recentTransactions.map((row: any) => ({
        date: row.date,
        count: row.count,
        amount: row.amount
      })),
      transactionTypes: transactionTypeStats.map((row: any) => ({
        name: row.display_name,
        count: row.count,
        totalAmount: row.total_amount
      }))
    };

    res.status(200).json({
      success: true,
      data: stats
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
