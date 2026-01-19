/**
 * YourTJ Credit - 创建商品API
 * POST /api/product/create
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { queryOne, execute } from '../../lib/database';
import { generateProductId, verifySignedRequest } from '../../shared/utils/transaction-verification';
import { readJsonBody } from '../../lib/body';
import type { Product, ApiResponse, ProductCreateParams } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const body = await readJsonBody<ProductCreateParams>(req);
    const { title, description, deliveryInfo, price, stock } = body;

    // 验证参数
    if (!title || !description || !price || stock === undefined) {
      res.status(400).json({ success: false, error: '缺少必要参数' });
      return;
    }

    if (price <= 0) {
      res.status(400).json({ success: false, error: '商品价格必须大于0' });
      return;
    }

    if (stock < 0) {
      res.status(400).json({ success: false, error: '库存数量不能为负数' });
      return;
    }

    if (deliveryInfo && String(deliveryInfo).length > 500) {
      res.status(400).json({ success: false, error: '发货信息过长' });
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

    // 1. 获取卖家钱包和密钥
    const sellerWallet = await queryOne<any>(
      'SELECT user_hash, user_secret FROM wallets WHERE user_hash = ?',
      [userHash]
    );

    if (!sellerWallet) {
      res.status(404).json({ success: false, error: '钱包不存在' });
      return;
    }
    if (!sellerWallet.user_secret) {
      res.status(400).json({ success: false, error: '钱包未绑定密钥，无法进行签名验证' });
      return;
    }

    // 2. 验证签名
    const verifyResult = await verifySignedRequest(
      deliveryInfo
        ? { title, description, deliveryInfo, price, stock }
        : { title, description, price, stock },
      {
        'x-user-hash': userHash,
        'x-signature': signature,
        'x-timestamp': timestampHeader,
        'x-nonce': nonceHeader
      },
      sellerWallet.user_secret
    );

    if (!verifyResult.valid) {
      res.status(401).json({
        success: false,
        error: verifyResult.error || '签名验证失败'
      });
      return;
    }

    // 3. 创建商品
    const productId = generateProductId();
    const now = Math.floor(Date.now() / 1000);

    await execute(
      `INSERT INTO products
      (product_id, seller_user_hash, title, description, delivery_info, price, stock, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [productId, userHash, title, description, deliveryInfo || null, price, stock, 'available', now, now]
    );

    // 4. 查询完整的商品信息
    const productRow = await queryOne<any>(
      'SELECT * FROM products WHERE product_id = ?',
      [productId]
    );

    if (!productRow) {
      res.status(500).json({ success: false, error: '商品创建失败' });
      return;
    }

    const product: Product = {
      id: productRow.id,
      productId: productRow.product_id,
      sellerUserHash: productRow.seller_user_hash,
      title: productRow.title,
      description: productRow.description,
      deliveryInfo: undefined,
      price: productRow.price,
      stock: productRow.stock,
      status: productRow.status,
      createdAt: productRow.created_at * 1000,
      updatedAt: productRow.updated_at * 1000
    };

    res.status(201).json({
      success: true,
      data: product,
      message: '商品创建成功'
    } as ApiResponse<Product>);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
