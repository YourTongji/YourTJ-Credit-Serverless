/**
 * YourTJ Credit - 词库相关接口（合并以降低 Vercel Function 数量）
 *
 * GET  /api/wordlist?timestamp=...&token=...
 * POST /api/wordlist?action=token   (由 vercel.json rewrite /api/wordlist/token 转发)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../lib/cors';
import {
  getWordlist,
  obfuscateWordlist,
  verifyWordlistToken,
  checkRateLimit,
  getWordlistChecksum,
  generateWordlistToken
} from '../shared/utils/wordlist-protection';
import type { ApiResponse } from '../shared/types';

async function handleToken(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' } as ApiResponse);
    return;
  }

  const timestamp = Date.now();
  const secret = process.env.WORDLIST_SECRET || 'default-secret-change-me';
  const token = await generateWordlistToken(timestamp, secret);

  res.status(200).json({
    success: true,
    data: { timestamp, token }
  } as ApiResponse);
}

async function handleWordlist(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' } as ApiResponse);
    return;
  }

  const timestampStr = req.query.timestamp as string;
  const token = req.query.token as string;

  if (!timestampStr || !token) {
    res.status(400).json({ success: false, error: '缺少必要参数' } as ApiResponse);
    return;
  }

  const timestamp = parseInt(timestampStr, 10);
  if (Number.isNaN(timestamp)) {
    res.status(400).json({ success: false, error: '无效的时间戳' } as ApiResponse);
    return;
  }

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp, 10, 60 * 1000)) {
    res.status(429).json({ success: false, error: '请求过于频繁,请稍后再试' } as ApiResponse);
    return;
  }

  const secret = process.env.WORDLIST_SECRET || 'default-secret-change-me';
  const isValid = await verifyWordlistToken(timestamp, token, secret);
  if (!isValid) {
    res.status(401).json({ success: false, error: '令牌无效或已过期' } as ApiResponse);
    return;
  }

  const wordlist = getWordlist();
  const key = `${timestamp}-${secret}`;
  const obfuscated = obfuscateWordlist(wordlist, key);
  const checksum = await getWordlistChecksum();

  res.status(200).json({
    success: true,
    data: { wordlist: obfuscated, checksum, timestamp }
  } as ApiResponse);
}

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const action = String(req.query.action || '').trim().toLowerCase();
    if (action === 'token') {
      await handleToken(req, res);
      return;
    }
    await handleWordlist(req, res);
  } catch (error) {
    console.error('Wordlist error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);

