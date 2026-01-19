/**
 * YourTJ Credit - 创建举报/申诉API
 * POST /api/report/create
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { queryOne, execute } from '../../lib/database';
import { generateReportId, verifySignedRequest } from '../../shared/utils/transaction-verification';
import { readJsonBody } from '../../lib/body';
import type { ApiResponse, ContentReport, Report, ReportCreateParams } from '../../shared/types';
import crypto from 'crypto';

type FeishuConfig = { webhookUrl: string; secret?: string };
type FeishuSendResult = {
  enabled: boolean;
  ok?: boolean;
  status?: number;
  responseSnippet?: string;
  error?: string;
};
type FeishuField = { label: string; value: string; short?: boolean; style?: 'code' | 'text' };

function getFeishuConfig(): FeishuConfig | null {
  const webhookUrl = (process.env.FEISHU_WEBHOOK_URL || '').trim();
  const secret = (process.env.FEISHU_WEBHOOK_SECRET || '').trim();
  if (!webhookUrl) return null;
  return secret ? { webhookUrl, secret } : { webhookUrl };
}

function signFeishu(timestampSec: string, secret: string): string {
  const stringToSign = `${timestampSec}\n${secret}`;
  return crypto.createHmac('sha256', stringToSign).update('').digest('base64');
}

function pickFrontendBase(req: VercelRequest): string {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (origin && /^https?:\/\//i.test(origin)) return origin.replace(/\/$/, '');
  return (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_PUBLIC_URL || 'https://yourtj-credit-frontend.vercel.app').replace(/\/$/, '');
}

function shortId(value: string, head = 8, tail = 6): string {
  const s = String(value || '').trim();
  if (!s) return '—';
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function decodeHtmlEntities(input: string): string {
  const text = String(input ?? '');
  return text.replace(/&(?:lt|gt|amp|quot|nbsp);|&#39;|&#x?[0-9a-fA-F]+;/g, (m) => {
    switch (m) {
      case '&lt;':
        return '<';
      case '&gt;':
        return '>';
      case '&amp;':
        return '&';
      case '&quot;':
        return '"';
      case '&#39;':
        return "'";
      case '&nbsp;':
        return ' ';
      default: {
        const hex = m.startsWith('&#x') || m.startsWith('&#X');
        const num = hex ? m.slice(3, -1) : m.slice(2, -1);
        const codePoint = parseInt(num, hex ? 16 : 10);
        if (!Number.isFinite(codePoint)) return m;
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return m;
        }
      }
    }
  });
}

function normalizeFeishuText(input: string): string {
  let decoded = String(input ?? '');
  for (let i = 0; i < 3; i++) {
    const next = decodeHtmlEntities(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  const withBreaks = decoded.replace(/<\s*br\s*\/?>/gi, '\n');
  const noTags = withBreaks.replace(/<[^>]*>/g, '');
  return noTags;
}

function buildFeishuInteractiveBody(
  payload: {
    title: string;
    fields: FeishuField[];
    adminUrl: string;
  },
  secret?: string
) {
  const timestamp = String(Math.floor(Date.now() / 1000));

  const fields = payload.fields
    .filter((f) => f && String(f.label || '').trim())
    .map((f) => {
      const style = f.style || 'code';
      const raw = String(f.value ?? '').trim();
      const normalized = normalizeFeishuText(raw).replace(/`/g, '´').replace(/\r?\n/g, ' ').trim();
      const value = style === 'code' ? shortId(normalized) : normalized.length > 240 ? `${normalized.slice(0, 238)}…` : normalized;
      const content = style === 'code' ? `**${f.label}**\n\`${value || '—'}\`` : `**${f.label}**\n${value || '—'}`;
      return {
        is_short: Boolean(f.short),
        text: { tag: 'lark_md', content }
      };
    });

  const body: any = {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: { title: { tag: 'plain_text', content: `有新的审批：${payload.title}` } },
      elements: [
        { tag: 'div', fields },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              type: 'primary',
              text: { tag: 'plain_text', content: '进入后台审批' },
              url: payload.adminUrl
            }
          ]
        }
      ]
    }
  };

  if (secret) {
    body.timestamp = timestamp;
    body.sign = signFeishu(timestamp, secret);
  }

  return body;
}

async function notifyFeishuIfEnabled(
  req: VercelRequest,
  payload: { kind: 'transaction' | 'content'; reportId: string; title: string; fields: FeishuField[] }
): Promise<FeishuSendResult> {
  const cfg = getFeishuConfig();
  if (!cfg) return { enabled: false };

  const base = pickFrontendBase(req);
  const tab = payload.kind === 'content' ? 'contentReports' : 'txReports';
  const adminUrl = `${base}/#/admin?tab=${encodeURIComponent(tab)}&reportId=${encodeURIComponent(payload.reportId)}`;

  const body: any = buildFeishuInteractiveBody(
    {
      title: payload.title,
      fields: payload.fields,
      adminUrl
    },
    cfg.secret
  );

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const text = await res.text().catch(() => '');
    const snippet = text.slice(0, 200);

    if (!res.ok) {
      console.warn('Feishu webhook failed:', res.status, snippet);
      return { enabled: true, ok: false, status: res.status, responseSnippet: snippet };
    }

    // Feishu often responds HTTP 200 even when "code" indicates an error (e.g. rate limit).
    try {
      const parsed = JSON.parse(text || '{}') as any;
      if (typeof parsed?.code === 'number' && parsed.code !== 0) {
        console.warn('Feishu webhook failed:', parsed.code, String(parsed?.msg || parsed?.message || '').slice(0, 200));
        return { enabled: true, ok: false, status: res.status, responseSnippet: snippet };
      }
    } catch {
      // ignore non-JSON success body
    }

    return { enabled: true, ok: true, status: res.status, responseSnippet: snippet };
  } catch (e) {
    console.warn('Feishu webhook failed:', e);
    return { enabled: true, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const body = await readJsonBody<ReportCreateParams & Record<string, any>>(req);
    const { txId, targetType, targetId, type, reason, description } = body as any;

    // 验证参数
    const isTxReport = Boolean(txId);
    const isContentReport = Boolean(targetType && targetId);

    if ((!isTxReport && !isContentReport) || !type || !reason) {
      res.status(400).json({ success: false, error: '缺少必要参数' });
      return;
    }

    if (!['appeal', 'report'].includes(type)) {
      res.status(400).json({ success: false, error: '无效的举报类型' });
      return;
    }

    if (isContentReport && !['task', 'product'].includes(String(targetType))) {
      res.status(400).json({ success: false, error: '无效的举报对象' });
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
    const payloadForSign = isTxReport
      ? { txId, type, reason, description }
      : { targetType, targetId, type, reason, description };

    const verifyResult = await verifySignedRequest(
      payloadForSign,
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

    const reportId = generateReportId();
    const now = Math.floor(Date.now() / 1000);

    const debugFeishu = String(req.headers['x-debug-feishu'] || '') === '1';

    if (isTxReport) {
      // 3. 验证交易是否存在
      const transaction = await queryOne<any>('SELECT * FROM transactions WHERE tx_id = ?', [txId]);
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
        res.status(400).json({ success: false, error: '您已经对此交易提交过举报/申诉' });
        return;
      }

      // 6. 创建举报记录
      await execute(
        `INSERT INTO reports
        (report_id, tx_id, reporter_user_hash, type, reason, description, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [reportId, txId, userHash, type, reason, description || null, 'pending', now]
      );

      // 7. 查询完整的举报信息
      const reportRow = await queryOne<any>('SELECT * FROM reports WHERE report_id = ?', [reportId]);
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

      const feishu = await notifyFeishuIfEnabled(req, {
        kind: 'transaction',
        reportId,
        title: type === 'appeal' ? '交易申诉' : '交易举报',
        fields: [
          { label: '举报编号', value: reportId, short: true, style: 'code' },
          { label: '交易编号', value: txId, short: true, style: 'code' },
          { label: '付款方(from)', value: transaction.from_user_hash || '—', short: true, style: 'code' },
          { label: '收款方(to)', value: transaction.to_user_hash || '—', short: true, style: 'code' },
          { label: '金额', value: String(transaction.amount ?? '—'), short: true, style: 'code' },
          { label: '理由', value: reason, short: false, style: 'text' },
          ...(description ? [{ label: '描述', value: description, short: false, style: 'text' } as const] : [])
        ]
      });

      res.status(201).json({
        success: true,
        data: report,
        message: '举报提交成功',
        ...(debugFeishu ? { debug: { feishu } } : {})
      } as ApiResponse<Report>);
      return;
    }

    // 内容举报：task/product
    const resolvedTargetType = String(targetType);
    const resolvedTargetId = String(targetId);

    const targetRow =
      resolvedTargetType === 'task'
        ? await queryOne<any>('SELECT task_id, creator_user_hash, title, description FROM tasks WHERE task_id = ?', [resolvedTargetId])
        : await queryOne<any>('SELECT product_id, seller_user_hash, title, description FROM products WHERE product_id = ?', [resolvedTargetId]);

    if (!targetRow) {
      res.status(404).json({ success: false, error: '举报对象不存在' });
      return;
    }

    const ownerHash = resolvedTargetType === 'task' ? targetRow.creator_user_hash : targetRow.seller_user_hash;
    const targetTitle = targetRow?.title ? String(targetRow.title) : '';
    const targetDescription = targetRow?.description ? String(targetRow.description) : '';
    if (ownerHash && ownerHash === userHash) {
      res.status(400).json({ success: false, error: '不能举报自己发布的内容' });
      return;
    }

    const existingContentReport = await queryOne<any>(
      'SELECT id FROM content_reports WHERE target_type = ? AND target_id = ? AND reporter_user_hash = ?',
      [resolvedTargetType, resolvedTargetId, userHash]
    );
    if (existingContentReport) {
      res.status(400).json({ success: false, error: '您已经对此内容提交过举报/申诉' });
      return;
    }

    await execute(
      `INSERT INTO content_reports
      (report_id, target_type, target_id, target_owner_user_hash, reporter_user_hash, type, reason, description, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reportId,
        resolvedTargetType,
        resolvedTargetId,
        ownerHash || null,
        userHash,
        type,
        reason,
        description || null,
        'pending',
        now
      ]
    );

    const reportRow = await queryOne<any>('SELECT * FROM content_reports WHERE report_id = ?', [reportId]);
    if (!reportRow) {
      res.status(500).json({ success: false, error: '举报创建失败' });
      return;
    }

    const report: ContentReport = {
      id: reportRow.id,
      reportId: reportRow.report_id,
      targetType: reportRow.target_type,
      targetId: reportRow.target_id,
      targetOwnerUserHash: reportRow.target_owner_user_hash || undefined,
      reporterUserHash: reportRow.reporter_user_hash,
      type: reportRow.type,
      reason: reportRow.reason,
      description: reportRow.description || undefined,
      status: reportRow.status,
      adminNote: reportRow.admin_note || undefined,
      createdAt: reportRow.created_at * 1000,
      resolvedAt: reportRow.resolved_at ? reportRow.resolved_at * 1000 : undefined
    };

    const feishu = await notifyFeishuIfEnabled(req, {
      kind: 'content',
      reportId,
      title: type === 'appeal' ? '内容申诉' : '内容举报',
      fields: [
        { label: '举报编号', value: reportId, short: true, style: 'code' },
        { label: '对象类型', value: resolvedTargetType, short: true, style: 'code' },
        { label: '对象编号', value: resolvedTargetId, short: true, style: 'code' },
        ...(targetTitle ? [{ label: '标题', value: targetTitle, short: false, style: 'text' } as const] : []),
        ...(targetDescription ? [{ label: '内容描述', value: targetDescription, short: false, style: 'text' } as const] : []),
        ...(ownerHash ? [{ label: '发布者', value: ownerHash, short: true, style: 'code' } as const] : []),
        { label: '举报人', value: userHash, short: true, style: 'code' },
        { label: '理由', value: reason, short: false, style: 'text' },
        ...(description ? [{ label: '描述', value: description, short: false, style: 'text' } as const] : [])
      ]
    });

    res.status(201).json({
      success: true,
      data: report,
      message: '举报提交成功',
      ...(debugFeishu ? { debug: { feishu } } : {})
    } as ApiResponse<ContentReport>);
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
