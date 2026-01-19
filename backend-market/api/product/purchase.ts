/**
 * YourTJ Credit - 购买商品API
 * POST /api/product/purchase
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { query, queryOne, transaction } from '../../lib/database';
import { generatePurchaseId, generateTransactionId, verifySignedRequest } from '../../shared/utils/transaction-verification';
import { readJsonBody } from '../../lib/body';
import type { Purchase, ApiResponse } from '../../shared/types';

type PurchaseAction =
  | 'create'
  | 'seller_accept'
  | 'seller_deliver'
  | 'buyer_confirm'
  | 'list';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'GET') {
      const action = (req.query.action as string) || 'list';
      if (action !== 'list') {
        res.status(400).json({ success: false, error: '无效操作' });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;
      const role = (req.query.role as string) || 'buyer';
      const status = (req.query.status as string) || 'all';

      const userHash = req.headers['x-user-hash'] as string;
      const signature = req.headers['x-signature'] as string;
      const timestampHeader = req.headers['x-timestamp'] as string;
      const nonceHeader = req.headers['x-nonce'] as string;

      if (!userHash || !signature || !timestampHeader || !nonceHeader) {
        res.status(401).json({ success: false, error: '缺少认证信息' });
        return;
      }

      const wallet = await queryOne<any>(
        'SELECT user_hash, user_secret FROM wallets WHERE user_hash = ?',
        [userHash]
      );
      if (!wallet) {
        res.status(404).json({ success: false, error: '钱包不存在' });
        return;
      }
      if (!wallet.user_secret) {
        res.status(400).json({ success: false, error: '钱包未绑定密钥，无法进行签名验证' });
        return;
      }

      const verifyResult = await verifySignedRequest(
        { action: 'list', role, status, page, limit },
        {
          'x-user-hash': userHash,
          'x-signature': signature,
          'x-timestamp': timestampHeader,
          'x-nonce': nonceHeader
        },
        wallet.user_secret
      );
      if (!verifyResult.valid) {
        res.status(401).json({ success: false, error: verifyResult.error || '签名验证失败' });
        return;
      }

      const where: string[] = [];
      const args: any[] = [];

      if (role === 'seller') {
        where.push('p.seller_user_hash = ?');
      } else {
        where.push('p.buyer_user_hash = ?');
      }
      args.push(userHash);

      if (status !== 'all') {
        where.push('p.status = ?');
        args.push(status);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const rows = await query<any>(
        `SELECT
           p.*,
           pr.title as product_title,
           pr.description as product_description,
           pr.price as product_price,
           pr.delivery_info as delivery_info
         FROM purchases p
         JOIN products pr ON p.product_id = pr.product_id
         ${whereSql}
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
        [...args, limit, offset]
      );

      const countRow = await queryOne<any>(
        `SELECT COUNT(*) as total
         FROM purchases p
         ${whereSql}`,
        args
      );
      const total = countRow?.total || 0;

      const list: Purchase[] = rows.map((row) => ({
        id: row.id,
        purchaseId: row.purchase_id,
        productId: row.product_id,
        buyerUserHash: row.buyer_user_hash,
        sellerUserHash: row.seller_user_hash,
        amount: row.amount,
        quantity: row.quantity,
        txId: row.tx_id,
        status: row.status,
        createdAt: row.created_at * 1000,
        acceptedAt: row.accepted_at ? row.accepted_at * 1000 : undefined,
        deliveredAt: row.delivered_at ? row.delivered_at * 1000 : undefined,
        confirmedAt: row.confirmed_at ? row.confirmed_at * 1000 : undefined,
        updatedAt: row.updated_at ? row.updated_at * 1000 : undefined,
        productTitle: row.product_title,
        productDescription: row.product_description,
        productPrice: row.product_price,
        deliveryInfo: row.delivery_info || undefined
      }));

      res.status(200).json({
        success: true,
        data: {
          data: list,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      } as ApiResponse);
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { action, productId, quantity, purchaseId } = await readJsonBody<any>(req);

    let resolvedAction: PurchaseAction = 'create';
    if (!action || action === 'create') {
      resolvedAction = 'create';
    } else if (action === 'seller_accept' || action === 'seller_deliver' || action === 'buyer_confirm') {
      resolvedAction = action;
    } else {
      res.status(400).json({ success: false, error: '无效操作' });
      return;
    }

    // 验证参数
    if (resolvedAction === 'create') {
      if (!productId || !quantity) {
        res.status(400).json({ success: false, error: '缺少必要参数' });
        return;
      }
      if (quantity <= 0) {
        res.status(400).json({ success: false, error: '购买数量必须大于0' });
        return;
      }
    } else {
      if (!purchaseId) {
        res.status(400).json({ success: false, error: '缺少订单ID' });
        return;
      }
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

    // 1. 获取操作者钱包和密钥
    const actorWallet = await queryOne<any>(
      'SELECT user_hash, user_secret, balance FROM wallets WHERE user_hash = ?',
      [userHash]
    );

    if (!actorWallet) {
      res.status(404).json({ success: false, error: '钱包不存在' });
      return;
    }
    if (!actorWallet.user_secret) {
      res.status(400).json({ success: false, error: '钱包未绑定密钥，无法进行签名验证' });
      return;
    }

    // 2. 验证签名
    const signaturePayload =
      resolvedAction === 'create'
        ? { productId, quantity }
        : { action: resolvedAction, purchaseId };

    const verifyResult = await verifySignedRequest(
      signaturePayload,
      {
        'x-user-hash': userHash,
        'x-signature': signature,
        'x-timestamp': timestampHeader,
        'x-nonce': nonceHeader
      },
      actorWallet.user_secret
    );

    if (!verifyResult.valid) {
      res.status(401).json({
        success: false,
        error: verifyResult.error || '签名验证失败'
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);

    // 获取product_purchase交易类型ID（订单创建时生成 pending 交易，确认时完成）
    const typeRow = await queryOne<any>('SELECT id FROM transaction_types WHERE name = ?', ['product_purchase']);
    if (!typeRow) {
      res.status(500).json({ success: false, error: '交易类型配置错误' });
      return;
    }
    const typeId = typeRow.id;

    if (resolvedAction === 'create') {
      // 订单创建：扣除买家余额（托管），预占库存，生成 pending 交易，等待卖家处理与买家确认
      const product = await queryOne<any>('SELECT * FROM products WHERE product_id = ?', [productId]);
      if (!product) {
        res.status(404).json({ success: false, error: '商品不存在' });
        return;
      }
      if (product.status !== 'available') {
        res.status(400).json({ success: false, error: '商品不可购买' });
        return;
      }
      if (product.stock < quantity) {
        res.status(400).json({ success: false, error: '库存不足' });
        return;
      }
      if (product.seller_user_hash === userHash) {
        res.status(400).json({ success: false, error: '不能购买自己的商品' });
        return;
      }

      const totalAmount = product.price * quantity;
      if (actorWallet.balance < totalAmount) {
        res.status(400).json({ success: false, error: '余额不足' });
        return;
      }

      const txId = generateTransactionId();
      const newPurchaseId = generatePurchaseId();

      await transaction(async (tx) => {
        await tx.execute({
          sql: 'UPDATE wallets SET balance = balance - ?, last_active_at = ? WHERE user_hash = ?',
          args: [totalAmount, now, userHash]
        });

        const newStock = product.stock - quantity;
        const newStatus = newStock === 0 ? 'sold_out' : 'available';
        await tx.execute({
          sql: 'UPDATE products SET stock = ?, status = ?, updated_at = ? WHERE product_id = ?',
          args: [newStock, newStatus, now, productId]
        });

        await tx.execute({
          sql: `INSERT INTO transactions
                (tx_id, type_id, from_user_hash, to_user_hash, amount, status, title, description, metadata, created_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            txId,
            typeId,
            userHash,
            product.seller_user_hash,
            totalAmount,
            'pending',
            `购买商品（待确认）：${product.title}`,
            `数量：${quantity}`,
            JSON.stringify({ purchaseId: newPurchaseId, productId, quantity }),
            now,
            null
          ]
        });

        await tx.execute({
          sql: `INSERT INTO purchases
                (purchase_id, product_id, buyer_user_hash, seller_user_hash, amount, quantity, tx_id, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            newPurchaseId,
            productId,
            userHash,
            product.seller_user_hash,
            totalAmount,
            quantity,
            txId,
            'pending',
            now,
            now
          ]
        });
      });

      const purchaseRow = await queryOne<any>(
        `SELECT
           p.*,
           pr.title as product_title,
           pr.description as product_description,
           pr.price as product_price,
           pr.delivery_info as delivery_info
         FROM purchases p
         JOIN products pr ON p.product_id = pr.product_id
         WHERE p.purchase_id = ?`,
        [newPurchaseId]
      );

      if (!purchaseRow) {
        res.status(500).json({ success: false, error: '订单创建失败' });
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
        createdAt: purchaseRow.created_at * 1000,
        acceptedAt: purchaseRow.accepted_at ? purchaseRow.accepted_at * 1000 : undefined,
        deliveredAt: purchaseRow.delivered_at ? purchaseRow.delivered_at * 1000 : undefined,
        confirmedAt: purchaseRow.confirmed_at ? purchaseRow.confirmed_at * 1000 : undefined,
        updatedAt: purchaseRow.updated_at ? purchaseRow.updated_at * 1000 : undefined,
        productTitle: purchaseRow.product_title,
        productDescription: purchaseRow.product_description,
        productPrice: purchaseRow.product_price,
        deliveryInfo: purchaseRow.delivery_info || undefined
      };

      res.status(201).json({
        success: true,
        data: purchase,
        message: '已下单，等待卖家处理与确认'
      } as ApiResponse<Purchase>);
      return;
    }

    // 其余动作：基于 purchaseId 更新订单状态
    const purchaseRow = await queryOne<any>('SELECT * FROM purchases WHERE purchase_id = ?', [purchaseId]);
    if (!purchaseRow) {
      res.status(404).json({ success: false, error: '订单不存在' });
      return;
    }

    const product = await queryOne<any>('SELECT * FROM products WHERE product_id = ?', [purchaseRow.product_id]);
    if (!product) {
      res.status(404).json({ success: false, error: '商品不存在' });
      return;
    }

    if (resolvedAction === 'seller_accept') {
      if (purchaseRow.seller_user_hash !== userHash) {
        res.status(403).json({ success: false, error: '只有卖家可以接单' });
        return;
      }
      if (purchaseRow.status !== 'pending') {
        res.status(400).json({ success: false, error: '订单状态不允许接单' });
        return;
      }

      await transaction(async (tx) => {
        await tx.execute({
          sql: `UPDATE purchases
                SET status = ?, accepted_at = ?, updated_at = ?
                WHERE purchase_id = ?`,
          args: ['accepted', now, now, purchaseId]
        });
      });
    } else if (resolvedAction === 'seller_deliver') {
      if (purchaseRow.seller_user_hash !== userHash) {
        res.status(403).json({ success: false, error: '只有卖家可以标记交付' });
        return;
      }
      if (purchaseRow.status !== 'accepted') {
        res.status(400).json({ success: false, error: '订单状态不允许标记交付' });
        return;
      }

      await transaction(async (tx) => {
        await tx.execute({
          sql: `UPDATE purchases
                SET status = ?, delivered_at = ?, updated_at = ?
                WHERE purchase_id = ?`,
          args: ['delivered', now, now, purchaseId]
        });
      });
    } else if (resolvedAction === 'buyer_confirm') {
      if (purchaseRow.buyer_user_hash !== userHash) {
        res.status(403).json({ success: false, error: '只有买家可以确认' });
        return;
      }
      if (purchaseRow.status !== 'delivered') {
        res.status(400).json({ success: false, error: '订单未交付，无法确认结算' });
        return;
      }

      await transaction(async (tx) => {
        await tx.execute({
          sql: 'UPDATE wallets SET balance = balance + ?, last_active_at = ? WHERE user_hash = ?',
          args: [purchaseRow.amount, now, purchaseRow.seller_user_hash]
        });

        await tx.execute({
          sql: `UPDATE transactions
                SET status = ?, completed_at = ?
                WHERE tx_id = ?`,
          args: ['completed', now, purchaseRow.tx_id]
        });

        await tx.execute({
          sql: `UPDATE purchases
                SET status = ?, confirmed_at = ?, updated_at = ?
                WHERE purchase_id = ?`,
          args: ['completed', now, now, purchaseId]
        });
      });
    }

    const updatedRow = await queryOne<any>(
      `SELECT
         p.*,
         pr.title as product_title,
         pr.description as product_description,
         pr.price as product_price,
         pr.delivery_info as delivery_info
       FROM purchases p
       JOIN products pr ON p.product_id = pr.product_id
       WHERE p.purchase_id = ?`,
      [purchaseId]
    );

    if (!updatedRow) {
      res.status(500).json({ success: false, error: '订单更新失败' });
      return;
    }

    const purchase: Purchase = {
      id: updatedRow.id,
      purchaseId: updatedRow.purchase_id,
      productId: updatedRow.product_id,
      buyerUserHash: updatedRow.buyer_user_hash,
      sellerUserHash: updatedRow.seller_user_hash,
      amount: updatedRow.amount,
      quantity: updatedRow.quantity,
      txId: updatedRow.tx_id,
      status: updatedRow.status,
      createdAt: updatedRow.created_at * 1000,
      acceptedAt: updatedRow.accepted_at ? updatedRow.accepted_at * 1000 : undefined,
      deliveredAt: updatedRow.delivered_at ? updatedRow.delivered_at * 1000 : undefined,
      confirmedAt: updatedRow.confirmed_at ? updatedRow.confirmed_at * 1000 : undefined,
      updatedAt: updatedRow.updated_at ? updatedRow.updated_at * 1000 : undefined,
      productTitle: updatedRow.product_title,
      productDescription: updatedRow.product_description,
      productPrice: updatedRow.product_price,
      deliveryInfo: updatedRow.delivery_info || undefined
    };

    const messageMap: Record<string, string> = {
      seller_accept: '已接单',
      seller_deliver: '已标记交付，等待买家确认',
      buyer_confirm: '已确认，交易完成'
    };

    res.status(200).json({
      success: true,
      data: purchase,
      message: messageMap[resolvedAction] || '操作成功'
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
