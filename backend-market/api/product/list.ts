/**
 * YourTJ Credit - 获取商品列表API
 * GET /api/product/list
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { query } from '../../lib/database';
import type { Product, ApiResponse, PaginatedResponse } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = (req.query.status as string) || 'available';
    const offset = (page - 1) * limit;

    const whereSql = status && status !== 'all' ? 'WHERE status = ?' : '';
    const whereArgs = status && status !== 'all' ? [status] : [];

    // 查询商品列表
    const products = await query<any>(
      `SELECT * FROM products
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...whereArgs, limit, offset]
    );

    // 查询总数
    const countResult = await query<any>(
      `SELECT COUNT(*) as total FROM products ${whereSql}`,
      whereArgs
    );
    const total = countResult[0]?.total || 0;

    const productList: Product[] = products.map(row => ({
      id: row.id,
      productId: row.product_id,
      sellerUserHash: row.seller_user_hash,
      title: row.title,
      description: row.description,
      price: row.price,
      stock: row.stock,
      status: row.status,
      createdAt: row.created_at * 1000,
      updatedAt: row.updated_at * 1000
    }));

    const response: PaginatedResponse<Product> = {
      data: productList,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };

    res.status(200).json({
      success: true,
      data: response
    } as ApiResponse<PaginatedResponse<Product>>);
  } catch (error) {
    console.error('List products error:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
