/**
 * YourTJ Credit - 购买商品API
 * POST /api/product/purchase
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { queryOne, execute } from '../../lib/database';
import { generatePurchaseId, generateTransactionId, verifySignedRequest } from '../../shared/utils/transaction-verification';
import type { Purchase, ApiResponse } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { productId, quantity, timestamp, nonce } = req.body;

    // 验证参数
    if (!productId || !quantity) {
      res.status(400).json({ success: false, error: '缺少必要参数' });
      return;
    }

    if (quantity <= 0) {
      res.status(400).json({ success: false, error: '购买数量必须大于0' });
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

    // 1. 获取买家钱包和密钥
    const buyerWallet = await queryOne<any>(
      'SELECT user_hash, user_secret, balance FROM wallets WHERE user_hash = ?',
      [userHash]
    );

    if (!buyerWallet) {
      res.status(404).json({ success: false, error: '钱包不存在' });
      return;
    }
    if (!buyerWallet.user_secret) {
      res.status(400).json({ success: false, error: '钱包未绑定密钥，无法进行签名验证' });
      return;
    }

    // 2. 验证签名
    const verifyResult = await verifySignedRequest(
      { productId, quantity },
      {
        'x-user-hash': userHash,
        'x-signature': signature,
        'x-timestamp': timestampHeader,
        'x-nonce': nonceHeader
      },
      buyerWallet.user_secret
    );

    if (!verifyResult.valid) {
      res.status(401).json({
        success: false,
        error: verifyResult.error || '签名验证失败'
      });
      return;
    }

    // 3. 查询商品
    const product = await queryOne<any>(
      'SELECT * FROM products WHERE product_id = ?',
      [productId]
    );

    if (!product) {
      res.status(404).json({ success: false, error: '商品不存在' });
      return;
    }

    // 4. 检查商品状态和库存
    if (product.status !== 'available') {
      res.status(400).json({ success: false, error: '商品不可购买' });
      return;
    }

    if (product.stock < quantity) {
      res.status(400).json({ success: false, error: '库存不足' });
      return;
    }

    // 5. 检查是否是卖家自己
    if (product.seller_user_hash === userHash) {
      res.status(400).json({ success: false, error: '不能购买自己的商品' });
      return;
    }

    // 6. 计算总价
    const totalAmount = product.price * quantity;

    // 7. 检查余额
    if (buyerWallet.balance < totalAmount) {
      res.status(400).json({ success: false, error: '余额不足' });
      return;
    }

    // 8. 获取product_purchase交易类型ID
    const typeRow = await queryOne<any>(
      'SELECT id FROM transaction_types WHERE name = ?',
      ['product_purchase']
    );

    if (!typeRow) {
      res.status(500).json({ success: false, error: '交易类型配置错误' });
      return;
    }

    const typeId = typeRow.id;
    const now = Math.floor(Date.now() / 1000);

    // 9. 扣除买家余额
    await execute(
      'UPDATE wallets SET balance = balance - ?, last_active_at = ? WHERE user_hash = ?',
      [totalAmount, now, userHash]
    );

    // 10. 增加卖家余额
    await execute(
      'UPDATE wallets SET balance = balance + ?, last_active_at = ? WHERE user_hash = ?',
      [totalAmount, now, product.seller_user_hash]
    );

    // 11. 减少商品库存
    const newStock = product.stock - quantity;
    const newStatus = newStock === 0 ? 'sold_out' : 'available';
    await execute(
      'UPDATE products SET stock = ?, status = ?, updated_at = ? WHERE product_id = ?',
      [newStock, newStatus, now, productId]
    );

    // 12. 创建交易记录
    const txId = generateTransactionId();
    await execute(
      `INSERT INTO transactions
      (tx_id, type_id, from_user_hash, to_user_hash, amount, status, title, description, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txId,
        typeId,
        userHash,
        product.seller_user_hash,
        totalAmount,
        'completed',
        `购买商品：${product.title}`,
        `数量：${quantity}`,
        now,
        now
      ]
    );

    // 13. 创建购买记录
    const purchaseId = generatePurchaseId();
    await execute(
      `INSERT INTO purchases
      (purchase_id, product_id, buyer_user_hash, seller_user_hash, amount, quantity, tx_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchaseId, productId, userHash, product.seller_user_hash, totalAmount, quantity, txId, 'completed', now]
    );

    // 14. 查询完整的购买信息
    const purchaseRow = await queryOne<any>(
      'SELECT * FROM purchases WHERE purchase_id = ?',
      [purchaseId]
    );

    if (!purchaseRow) {
      res.status(500).json({ success: false, error: '购买记录创建失败' });
      return;
    }

    const purchase: Purchase = {
      id: purchaseRow.id,
      purchaseId: purchaseRow.purchase_id,
      productId: purchaseRow.product_id,
      buyerUserHash: purchaseRow.buyer_user_hash,
      sellerUserHash: purchaseRow.seller_user_hash,
      amount: purchaseRow.amount,
      quantity: purchaseRow.quantity,
      txId: purchaseRow.tx_id,
      status: purchaseRow.status,
      createdAt: purchaseRow.created_at * 1000
    };

    res.status(201).json({
      success: true,
      data: purchase,
      message: '购买成功'
    } as ApiResponse<Purchase>);
  } catch (error) {
    console.error('Purchase product error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
