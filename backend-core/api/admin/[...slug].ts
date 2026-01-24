/**
 * YourTJ Credit - 管理后台 API（聚合路由，避免 Vercel Function 数量超限）
 * Base: /api/admin/*
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { withCors } from '../../lib/cors';
import { execute, query, queryOne, transaction } from '../../lib/database';
import { readJsonBody } from '../../lib/body';
import { generateTransactionId } from '../../shared/utils/transaction-verification';
import { hashAdminPassword, signAdminJwt, verifyAdminJwt, verifyAdminPassword } from '../../shared/utils/admin-auth';

type Json = Record<string, any>;

const FEISHU_SETTINGS_WEBHOOK_URL_KEY = 'feishu_webhook_url';
const FEISHU_SETTINGS_WEBHOOK_SECRET_KEY = 'feishu_webhook_secret';
const FEISHU_CARD_LOGO_IMG_KEY = 'img_v3_02u9_4ca7644a-997d-4963-9d6a-30043ca697eg';

function json(res: VercelResponse, status: number, body: Json) {
  res.status(status).json(body);
}

function getSlug(req: VercelRequest): string[] {
  // 优先使用 query 参数：Vercel 对 catch-all 文件名在生产环境下的路由支持不稳定。
  // 通过 vercel.json rewrites 将 /api/admin/:path* 映射到 /api/admin?slug=:path*
  const rawFromQuery = (req.query as any)?.slug;
  if (rawFromQuery) {
    if (Array.isArray(rawFromQuery)) return rawFromQuery.map(String).filter(Boolean);
    const s = String(rawFromQuery).trim();
    if (s) return s.split('/').filter(Boolean);
  }

  // Prefer parsing from URL path to avoid runtime differences in how Vercel populates query params for dynamic routes.
  const url = typeof req.url === 'string' ? req.url : '';
  const path = url.split('?')[0] || '';
  const prefix = '/api/admin/';
  if (path === '/api/admin' || path === '/api/admin/') return [];
  if (path.startsWith(prefix)) {
    const rest = path.slice(prefix.length);
    return rest.split('/').filter(Boolean);
  }

  return [];
}

function getAdminJwtSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET?.trim();
  if (!secret) throw new Error('ADMIN_JWT_SECRET 未配置');
  return secret;
}

function getAdminMasterSecret(): string | null {
  return process.env.ADMIN_MASTER_SECRET?.trim() || null;
}

function getRedeemSecret(): string {
  const secret = process.env.REDEEM_CODE_SECRET?.trim();
  if (!secret) throw new Error('REDEEM_CODE_SECRET 未配置');
  return secret;
}

function readBearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization || req.headers.Authorization;
  const value = typeof header === 'string' ? header : '';
  if (!value) return null;
  const m = value.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const token = readBearerToken(req);
  if (!token) {
    json(res, 401, { success: false, error: '缺少管理凭证' });
    return false;
  }
  const secret = getAdminJwtSecret();
  const result = verifyAdminJwt(token, secret);
  if (!result.valid) {
    json(res, 401, { success: false, error: result.error || '管理凭证无效' });
    return false;
  }
  return true;
}

async function getSetting(key: string): Promise<string | null> {
  const row = await queryOne<any>('SELECT value FROM settings WHERE key = ? LIMIT 1', [key]);
  return row?.value ? String(row.value) : null;
}

async function upsertSetting(key: string, value: string, description?: string) {
  await execute(
    `INSERT INTO settings (key, value, description, updated_at)
     VALUES (?, ?, ?, strftime('%s', 'now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, description=excluded.description, updated_at=strftime('%s', 'now')`,
    [key, value, description || null]
  );
}

function hmacSha256Hex(secret: string, input: string): string {
  return crypto.createHmac('sha256', secret).update(input, 'utf8').digest('hex');
}

function signFeishuBot(timestampSec: string, secret: string): string {
  const stringToSign = `${timestampSec}\n${secret}`;
  return crypto.createHmac('sha256', stringToSign).update('').digest('base64');
}

function makeCodeHint(code: string): string {
  const c = code.trim();
  if (c.length <= 4) return `${c[0] || ''}***`;
  const head = c.slice(0, 3);
  const tail = c.slice(-2);
  return `${head}***${tail}`;
}

function normalizeCode(code: string): string {
  return String(code || '').trim();
}

async function getTxTypeId(name: string): Promise<number> {
  const row = await queryOne<any>('SELECT id FROM transaction_types WHERE name = ? LIMIT 1', [name]);
  if (!row?.id) throw new Error(`交易类型不存在: ${name}`);
  return Number(row.id);
}

async function txQueryOne<T = any>(tx: any, sql: string, args: any[]): Promise<T | null> {
  const result = await tx.execute({ sql, args });
  const first = (result.rows as any[])?.[0];
  return first ? (first as T) : null;
}

async function insertAdminAdjustTx(
  tx: any,
  payload: {
    targetUserHash: string;
    delta: number;
    title: string;
    description?: string;
    metadata?: any;
    now: number;
  },
  typeId: number
) {
  const { targetUserHash, delta, title, description, metadata, now } = payload;
  const amountAbs = Math.abs(delta);
  const fromUserHash = delta < 0 ? targetUserHash : null;
  const toUserHash = delta < 0 ? null : targetUserHash;
  const txId = generateTransactionId();

  await tx.execute({
    sql: `INSERT INTO transactions
          (tx_id, type_id, from_user_hash, to_user_hash, amount, status, title, description, metadata, created_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      txId,
      typeId,
      fromUserHash,
      toUserHash,
      amountAbs,
      'completed',
      title,
      description || null,
      metadata ? JSON.stringify(metadata) : null,
      now,
      now
    ]
  });

  await tx.execute({
    sql: 'UPDATE wallets SET balance = balance + ?, last_active_at = ? WHERE user_hash = ?',
    args: [delta, now, targetUserHash]
  });

  return txId;
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const slug = getSlug(req);
    const route = slug.join('/');

    // POST /api/admin/auth
    if (route === 'auth' && req.method === 'POST') {
      const body = await readJsonBody<any>(req);
      const password = String(body?.password || '');
      if (!password) {
        json(res, 400, { success: false, error: '缺少密码' });
        return;
      }

      const storedHash = await getSetting('admin_password_hash');
      const ok = verifyAdminPassword(password, storedHash);
      if (!ok) {
        json(res, 401, { success: false, error: '密码错误' });
        return;
      }

      const token = signAdminJwt({ role: 'admin' }, getAdminJwtSecret(), 12 * 60 * 60);
      json(res, 200, { success: true, data: { token, expiresIn: 12 * 60 * 60 } });
      return;
    }

    // POST /api/admin/password
    if (route === 'password' && req.method === 'POST') {
      const body = await readJsonBody<any>(req);
      const newPassword = String(body?.newPassword || '');
      const masterSecret = body?.masterSecret ? String(body.masterSecret) : null;

      const canUseMaster = Boolean(masterSecret && getAdminMasterSecret() && masterSecret === getAdminMasterSecret());
      if (!canUseMaster) {
        const ok = await requireAdmin(req, res);
        if (!ok) return;
      }

      if (newPassword.length < 4 || newPassword.length > 64) {
        json(res, 400, { success: false, error: '新密码长度需为 4-64 位' });
        return;
      }

      await upsertSetting('admin_password_hash', hashAdminPassword(newPassword), '管理后台密码哈希');
      json(res, 200, { success: true, data: { updated: true } });
      return;
    }

    // 以下均需管理鉴权
    if (!(await requireAdmin(req, res))) return;

    // GET /api/admin/webhook
    if (route === 'webhook' && req.method === 'GET') {
      const webhookUrl = String((await getSetting(FEISHU_SETTINGS_WEBHOOK_URL_KEY)) || '').trim();
      const secret = String((await getSetting(FEISHU_SETTINGS_WEBHOOK_SECRET_KEY)) || '').trim();
      json(res, 200, { success: true, data: { webhookUrl, hasSecret: Boolean(secret) } });
      return;
    }

    // POST /api/admin/webhook
    if (route === 'webhook' && req.method === 'POST') {
      const body = await readJsonBody<any>(req);
      const hasUrl = Object.prototype.hasOwnProperty.call(body || {}, 'webhookUrl');
      const hasSecret = Object.prototype.hasOwnProperty.call(body || {}, 'secret');

      if (hasUrl) {
        const webhookUrl = String(body?.webhookUrl || '').trim();
        if (webhookUrl) {
          await upsertSetting(FEISHU_SETTINGS_WEBHOOK_URL_KEY, webhookUrl, '飞书机器人 Webhook 地址（管理后台可配置）');
        } else {
          await execute('DELETE FROM settings WHERE key = ?', [FEISHU_SETTINGS_WEBHOOK_URL_KEY]);
        }
      }

      if (hasSecret) {
        const secret = String(body?.secret || '').trim();
        if (secret) {
          await upsertSetting(FEISHU_SETTINGS_WEBHOOK_SECRET_KEY, secret, '飞书机器人签名密钥（管理后台可配置）');
        } else {
          await execute('DELETE FROM settings WHERE key = ?', [FEISHU_SETTINGS_WEBHOOK_SECRET_KEY]);
        }
      }

      const webhookUrl = String((await getSetting(FEISHU_SETTINGS_WEBHOOK_URL_KEY)) || '').trim();
      const secret = String((await getSetting(FEISHU_SETTINGS_WEBHOOK_SECRET_KEY)) || '').trim();
      json(res, 200, { success: true, data: { webhookUrl, hasSecret: Boolean(secret) } });
      return;
    }

    // POST /api/admin/webhook/test
    if (route === 'webhook/test' && req.method === 'POST') {
      const webhookUrl =
        String((await getSetting(FEISHU_SETTINGS_WEBHOOK_URL_KEY)) || '').trim() || String(process.env.FEISHU_WEBHOOK_URL || '').trim();
      const secret =
        String((await getSetting(FEISHU_SETTINGS_WEBHOOK_SECRET_KEY)) || '').trim() ||
        String(process.env.FEISHU_WEBHOOK_SECRET || '').trim();

      if (!webhookUrl) {
        json(res, 400, { success: false, error: '未配置飞书 Webhook 地址' });
        return;
      }

      const timestamp = String(Math.floor(Date.now() / 1000));
      const card: any = {
        msg_type: 'interactive',
        card: {
          schema: '2.0',
          config: {
            update_multi: true,
            enable_forward: true,
            width_mode: 'fill',
            summary: { content: 'YOURTJ Credit Webhook 测试' }
          },
          header: {
            template: 'wathet',
            icon: { tag: 'custom_icon', img_key: FEISHU_CARD_LOGO_IMG_KEY },
            title: { tag: 'plain_text', content: 'YOURTJ Credit Webhook 测试' },
            subtitle: { tag: 'plain_text', content: '这是一条来自管理后台的测试消息' },
            padding: '12px 12px 12px 12px'
          },
          body: {
            direction: 'vertical',
            padding: '12px 12px 12px 12px',
            horizontal_spacing: '8px',
            vertical_spacing: '8px',
            horizontal_align: 'left',
            vertical_align: 'top',
            elements: [
              { tag: 'markdown', content: `**发送时间**\\n${new Date().toLocaleString('zh-CN')}`, text_align: 'left' },
              { tag: 'markdown', content: `**来源**\\n管理后台 /api/admin/webhook/test`, text_align: 'left' },
              { tag: 'hr' },
              {
                tag: 'button',
                type: 'primary',
                text: { tag: 'plain_text', content: '打开管理后台' },
                url: `${String(process.env.PUBLIC_FRONTEND_URL || '').trim() || 'https://credit.yourtj.de'}/#/admin`
              }
            ]
          }
        }
      };

      if (secret) {
        card.timestamp = timestamp;
        card.sign = signFeishuBot(timestamp, secret);
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const resp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(card),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const text = await resp.text().catch(() => '');
        const snippet = text.slice(0, 300);
        let ok = resp.ok;
        try {
          const parsed = JSON.parse(text || '{}') as any;
          if (typeof parsed?.code === 'number' && parsed.code !== 0) ok = false;
        } catch {
          // ignore
        }
        json(res, 200, { success: true, data: { ok, status: resp.status, responseSnippet: snippet } });
      } catch (e) {
        json(res, 200, { success: true, data: { ok: false, error: e instanceof Error ? e.message : String(e) } });
      }
      return;
    }

    // GET /api/admin/reports?kind=transaction|content&status=&page=&limit=
    if (route === 'reports' && req.method === 'GET') {
      const kind = String(req.query.kind || 'transaction');
      const status = req.query.status ? String(req.query.status) : '';
      const reportId = req.query.reportId ? String(req.query.reportId) : '';
      const page = parseInt(String(req.query.page || '1'), 10) || 1;
      const limit = Math.min(100, parseInt(String(req.query.limit || '20'), 10) || 20);
      const offset = (page - 1) * limit;

      if (kind === 'content') {
        const where: string[] = [];
        const args: any[] = [];
        if (reportId) {
          where.push('cr.report_id = ?');
          args.push(reportId);
        }
        if (status) {
          where.push('cr.status = ?');
          args.push(status);
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const rows = await query<any>(
          `SELECT
             cr.*,
             COALESCE(t.title, p.title) as target_title,
             COALESCE(t.description, p.description) as target_description,
             COALESCE(t.status, p.status) as target_status,
             t.reward_amount as task_reward_amount,
             t.acceptor_user_hash as task_acceptor_user_hash,
             p.price as target_price,
             p.stock as target_stock,
             p.seller_user_hash as product_seller_user_hash
           FROM content_reports cr
           LEFT JOIN tasks t ON cr.target_type = 'task' AND t.task_id = cr.target_id
           LEFT JOIN products p ON cr.target_type = 'product' AND p.product_id = cr.target_id
           ${whereSql}
           ORDER BY cr.created_at DESC
           LIMIT ? OFFSET ?`,
          [...args, limit, offset]
        );

        const countRow = await queryOne<any>(
          `SELECT COUNT(*) as total FROM content_reports cr ${whereSql}`,
          args
        );
        const total = Number(countRow?.total || 0);

        json(res, 200, {
          success: true,
          data: { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) }
        });
        return;
      }

      const where: string[] = [];
      const args: any[] = [];
      if (reportId) {
        where.push('r.report_id = ?');
        args.push(reportId);
      }
      if (status) {
        where.push('r.status = ?');
        args.push(status);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const rows = await query<any>(
        `SELECT
           r.*,
           t.from_user_hash,
           t.to_user_hash,
           t.amount as tx_amount,
           t.title as tx_title,
           t.status as tx_status
         FROM reports r
         JOIN transactions t ON r.tx_id = t.tx_id
         ${whereSql}
         ORDER BY r.created_at DESC
         LIMIT ? OFFSET ?`,
        [...args, limit, offset]
      );

      const countRow = await queryOne<any>(`SELECT COUNT(*) as total FROM reports r ${whereSql}`, args);
      const total = Number(countRow?.total || 0);

      json(res, 200, {
        success: true,
        data: { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) }
      });
      return;
    }

    // POST /api/admin/reports (preferred) / POST /api/admin/reports/handle (legacy)
    // Some deployments may not route multi-segment paths reliably, so prefer single-segment endpoints.
    if ((route === 'reports' || route === 'reports/handle') && req.method === 'POST') {
      const body = await readJsonBody<any>(req);
      const kind = String(body?.kind || 'transaction');
      const reportId = String(body?.reportId || '');
      const action = String(body?.action || '');
      const adminNote = body?.adminNote ? String(body.adminNote) : null;

      if (!reportId || !action) {
        json(res, 400, { success: false, error: '缺少必要参数' });
        return;
      }

      const now = Math.floor(Date.now() / 1000);

      if (kind === 'content') {
        const reportRow = await queryOne<any>('SELECT * FROM content_reports WHERE report_id = ? LIMIT 1', [reportId]);
        if (!reportRow) {
          json(res, 404, { success: false, error: '举报不存在' });
          return;
        }

        if (action === 'reject' || action === 'resolve') {
          const next = action === 'reject' ? 'rejected' : 'resolved';
          await execute(
            'UPDATE content_reports SET status = ?, admin_note = ?, resolved_at = ? WHERE report_id = ?',
            [next, adminNote, now, reportId]
          );
          json(res, 200, { success: true, data: { reportId, status: next } });
          return;
        }

        if (action === 'take_down' || action === 'restore' || action === 'change_price') {
          const t = String(reportRow.target_type);
          const id = String(reportRow.target_id);

          if (t !== 'product') {
            json(res, 400, { success: false, error: '当前操作仅支持商品' });
            return;
          }

          if (action === 'take_down') {
            await execute("UPDATE products SET status = 'removed', updated_at = ? WHERE product_id = ?", [now, id]);
          } else if (action === 'restore') {
            await execute("UPDATE products SET status = 'available', updated_at = ? WHERE product_id = ?", [now, id]);
          } else {
            const newPrice = Number(body?.newPrice);
            if (!Number.isFinite(newPrice) || newPrice <= 0) {
              json(res, 400, { success: false, error: '价格无效' });
              return;
            }
            await execute('UPDATE products SET price = ?, updated_at = ? WHERE product_id = ?', [newPrice, now, id]);
          }

          await execute(
            'UPDATE content_reports SET status = ?, admin_note = ?, resolved_at = ? WHERE report_id = ?',
            ['resolved', adminNote, now, reportId]
          );

          json(res, 200, { success: true, data: { reportId, status: 'resolved' } });
          return;
        }

        if (action === 'cancel_task') {
          const t = String(reportRow.target_type);
          const id = String(reportRow.target_id);
          if (t !== 'task') {
            json(res, 400, { success: false, error: '当前操作仅支持任务' });
            return;
          }
          await execute("UPDATE tasks SET status = 'cancelled' WHERE task_id = ?", [id]);
          await execute(
            'UPDATE content_reports SET status = ?, admin_note = ?, resolved_at = ? WHERE report_id = ?',
            ['resolved', adminNote, now, reportId]
          );
          json(res, 200, { success: true, data: { reportId, status: 'resolved' } });
          return;
        }

        json(res, 400, { success: false, error: '未知操作' });
        return;
      }

      // transaction report
      const reportRow = await queryOne<any>('SELECT * FROM reports WHERE report_id = ? LIMIT 1', [reportId]);
      if (!reportRow) {
        json(res, 404, { success: false, error: '举报不存在' });
        return;
      }

      if (action === 'reject' || action === 'resolve') {
        const next = action === 'reject' ? 'rejected' : 'resolved';
        await execute('UPDATE reports SET status = ?, admin_note = ?, resolved_at = ? WHERE report_id = ?', [
          next,
          adminNote,
          now,
          reportId
        ]);
        json(res, 200, { success: true, data: { reportId, status: next } });
        return;
      }

      if (action === 'compensate') {
        const victimUserHash = String(body?.victimUserHash || '');
        const offenderUserHash = String(body?.offenderUserHash || '');
        const amount = Number(body?.amount);
        if (!victimUserHash || !offenderUserHash || !Number.isFinite(amount) || amount <= 0) {
          json(res, 400, { success: false, error: '缺少/无效的补偿参数' });
          return;
        }

        const caseId = `CASE-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
        const adminAdjustTypeId = await getTxTypeId('admin_adjust');

        const result = await transaction(async (tx) => {
          const victim = await txQueryOne<any>(tx, 'SELECT user_hash FROM wallets WHERE user_hash = ? LIMIT 1', [
            victimUserHash
          ]);
          const offender = await txQueryOne<any>(tx, 'SELECT user_hash FROM wallets WHERE user_hash = ? LIMIT 1', [
            offenderUserHash
          ]);
          if (!victim) throw new Error('申诉/举报用户钱包不存在');
          if (!offender) throw new Error('被扣回用户钱包不存在');

          const txId = await insertAdminAdjustTx(
            tx,
            {
            targetUserHash: victimUserHash,
            delta: amount,
            title: '申诉处理补偿',
            description: adminNote || '管理后台补偿',
            metadata: { reportId, caseId, mode: 'compensate_first' },
            now
            },
            adminAdjustTypeId
          );

          await tx.execute({
            sql: `INSERT INTO recovery_cases
                  (case_id, report_id, victim_user_hash, offender_user_hash, amount, status, admin_note, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [caseId, reportId, victimUserHash, offenderUserHash, amount, 'open', adminNote, now]
          });

          await tx.execute({
            sql: 'UPDATE reports SET status = ?, admin_note = ?, resolved_at = ? WHERE report_id = ?',
            args: ['resolved', adminNote, now, reportId]
          });

          return { caseId, txId };
        });

        json(res, 200, { success: true, data: result });
        return;
      }

      json(res, 400, { success: false, error: '未知操作' });
      return;
    }

    // GET /api/admin/recovery?status=open|recovered
    if (route === 'recovery' && req.method === 'GET') {
      const status = req.query.status ? String(req.query.status) : '';
      const where: string[] = [];
      const args: any[] = [];
      if (status) {
        where.push('status = ?');
        args.push(status);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = await query<any>(`SELECT * FROM recovery_cases ${whereSql} ORDER BY created_at DESC LIMIT 200`, args);
      json(res, 200, { success: true, data: rows });
      return;
    }

    // POST /api/admin/recovery (preferred) / POST /api/admin/recovery/recover (legacy)
    if ((route === 'recovery' || route === 'recovery/recover') && req.method === 'POST') {
      const body = await readJsonBody<any>(req);
      const caseId = String(body?.caseId || '');
      const adminNote = body?.adminNote ? String(body.adminNote) : null;
      if (!caseId) {
        json(res, 400, { success: false, error: '缺少 caseId' });
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const adminAdjustTypeId = await getTxTypeId('admin_adjust');

      const result = await transaction(async (tx) => {
        const row = await txQueryOne<any>(tx, 'SELECT * FROM recovery_cases WHERE case_id = ? LIMIT 1', [caseId]);
        if (!row) throw new Error('扣回单不存在');
        if (row.status !== 'open') throw new Error('扣回单不是 open 状态');

        const offenderHash = String(row.offender_user_hash);
        const amount = Number(row.amount);
        const offender = await txQueryOne<any>(tx, 'SELECT user_hash FROM wallets WHERE user_hash = ? LIMIT 1', [
          offenderHash
        ]);
        if (!offender) throw new Error('被扣回用户钱包不存在');

        const txId = await insertAdminAdjustTx(
          tx,
          {
          targetUserHash: offenderHash,
          delta: -amount,
          title: '申诉处理扣回',
          description: adminNote || '管理后台扣回',
          metadata: { caseId, reportId: row.report_id, mode: 'recover' },
          now
          },
          adminAdjustTypeId
        );

        await tx.execute({
          sql: 'UPDATE recovery_cases SET status = ?, admin_note = ?, recovered_at = ? WHERE case_id = ?',
          args: ['recovered', adminNote || row.admin_note, now, caseId]
        });

        return { caseId, txId };
      });

      json(res, 200, { success: true, data: result });
      return;
    }

    // GET /api/admin/user?userHash=...
    if (route === 'user' && req.method === 'GET') {
      const userHash = req.query.userHash ? String(req.query.userHash) : '';
      if (!userHash) {
        json(res, 400, { success: false, error: '缺少 userHash' });
        return;
      }
      const wallet = await queryOne<any>('SELECT user_hash, balance, created_at, last_active_at FROM wallets WHERE user_hash = ?', [
        userHash
      ]);
      if (!wallet) {
        json(res, 404, { success: false, error: '钱包不存在' });
        return;
      }
      const txs = await query<any>(
        `SELECT t.*, tt.name as type_name, tt.display_name as type_display_name
         FROM transactions t
         JOIN transaction_types tt ON t.type_id = tt.id
         WHERE t.from_user_hash = ? OR t.to_user_hash = ?
         ORDER BY t.created_at DESC
         LIMIT 50`,
        [userHash, userHash]
      );
      json(res, 200, { success: true, data: { wallet, transactions: txs } });
      return;
    }

    // POST /api/admin/user (preferred) / POST /api/admin/user/adjust (legacy)
    if ((route === 'user' || route === 'user/adjust') && req.method === 'POST') {
      const body = await readJsonBody<any>(req);
      const userHash = String(body?.userHash || '');
      const delta = Number(body?.delta);
      const reason = body?.reason ? String(body.reason) : '';
      if (!userHash || !Number.isFinite(delta) || delta === 0) {
        json(res, 400, { success: false, error: '缺少/无效参数' });
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const adminAdjustTypeId = await getTxTypeId('admin_adjust');
      const txId = await transaction(async (tx) => {
        const wallet = await txQueryOne<any>(tx, 'SELECT user_hash FROM wallets WHERE user_hash = ? LIMIT 1', [userHash]);
        if (!wallet) throw new Error('钱包不存在');
        return insertAdminAdjustTx(
          tx,
          {
            targetUserHash: userHash,
            delta,
            title: delta > 0 ? '管理员加分' : '管理员扣分',
            description: reason || undefined,
            metadata: { reason },
            now
          },
          adminAdjustTypeId
        );
      });
      json(res, 200, { success: true, data: { txId } });
      return;
    }

    // GET /api/admin/redeem
    if (route === 'redeem' && req.method === 'GET') {
      const rows = await query<any>(
        `SELECT
           code_hash,
           code_hint,
           title,
           value,
           expires_at,
           max_uses,
           used_count,
           enabled,
           created_at,
           updated_at
         FROM redeem_codes
         ORDER BY created_at DESC
         LIMIT 200`,
        []
      );
      json(res, 200, { success: true, data: rows });
      return;
    }

    // POST /api/admin/redeem (create / disable)
    if (route === 'redeem' && req.method === 'POST') {
      const body = await readJsonBody<any>(req);
      const op = body?.op ? String(body.op) : '';

      // disable via /redeem (preferred)
      if (op === 'disable') {
        const rawCodeHash = body?.codeHash ? String(body.codeHash).trim() : '';
        const code = normalizeCode(body?.code);
        const codeHash =
          rawCodeHash && /^[a-f0-9]{64}$/i.test(rawCodeHash)
            ? rawCodeHash
            : code
              ? hmacSha256Hex(getRedeemSecret(), code)
              : '';

        if (!codeHash) {
          json(res, 400, { success: false, error: '缺少兑换码标识' });
          return;
        }

        await execute("UPDATE redeem_codes SET enabled = 0, updated_at = strftime('%s','now') WHERE code_hash = ?", [
          codeHash
        ]);
        json(res, 200, { success: true, data: { disabled: true } });
        return;
      }

      const code = normalizeCode(body?.code);
      const title = body?.title ? String(body.title) : null;
      const value = Number(body?.value);
      const expiresAt = body?.expiresAt ? Number(body.expiresAt) : null; // unix seconds
      const maxUses = body?.maxUses ? Number(body.maxUses) : null;

      if (!code || code.length < 3 || code.length > 64) {
        json(res, 400, { success: false, error: '兑换码长度需为 3-64 位' });
        return;
      }
      if (!Number.isFinite(value) || value <= 0) {
        json(res, 400, { success: false, error: '兑换值无效' });
        return;
      }
      if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= 0)) {
        json(res, 400, { success: false, error: '有效期无效' });
        return;
      }
      if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses <= 0)) {
        json(res, 400, { success: false, error: '可用次数无效' });
        return;
      }

      const secret = getRedeemSecret();
      const codeHash = hmacSha256Hex(secret, code);
      const hint = makeCodeHint(code);
      const now = Math.floor(Date.now() / 1000);

      try {
        await execute(
          `INSERT INTO redeem_codes
           (code_hash, code_hint, title, value, expires_at, max_uses, used_count, enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
          [codeHash, hint, title, value, expiresAt, maxUses, now, now]
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE') || msg.includes('unique')) {
          json(res, 400, { success: false, error: '兑换码已存在' });
          return;
        }
        throw err;
      }

      json(res, 201, { success: true, data: { codeHash, codeHint: hint } });
      return;
    }

    // POST /api/admin/redeem/disable
    if (route === 'redeem/disable' && req.method === 'POST') {
      const body = await readJsonBody<any>(req);
      const rawCodeHash = body?.codeHash ? String(body.codeHash).trim() : '';
      const code = normalizeCode(body?.code);
      const codeHash =
        rawCodeHash && /^[a-f0-9]{64}$/i.test(rawCodeHash) ? rawCodeHash : code ? hmacSha256Hex(getRedeemSecret(), code) : '';

      if (!codeHash) {
        json(res, 400, { success: false, error: '缺少兑换码标识' });
        return;
      }

      await execute("UPDATE redeem_codes SET enabled = 0, updated_at = strftime('%s','now') WHERE code_hash = ?", [
        codeHash
      ]);
      json(res, 200, { success: true, data: { disabled: true } });
      return;
    }

    json(res, 404, { success: false, error: 'Not found' });
  } catch (error) {
    console.error('Admin API error:', error);
    json(res, 500, { success: false, error: error instanceof Error ? error.message : '服务器错误' });
  }
}

export default withCors(handler);
