/**
 * YourTJ Credit - 词库获取API
 * GET /api/wordlist
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import {
  getWordlist,
  obfuscateWordlist,
  verifyWordlistToken,
  checkRateLimit,
  getWordlistChecksum
} from '../../shared/utils/wordlist-protection';
import type { ApiResponse } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const timestampStr = req.query.timestamp as string;
    const token = req.query.token as string;

    if (!timestampStr || !token) {
      res.status(400).json({ success: false, error: '缺少必要参数' });
      return;
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      res.status(400).json({ success: false, error: '无效的时间戳' });
      return;
    }

    // 获取客户端IP（用于频率限制）
    const clientIp = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';

    // 检查频率限制
    if (!checkRateLimit(clientIp, 10, 60 * 1000)) {
      res.status(429).json({
        success: false,
        error: '请求过于频繁,请稍后再试'
      } as ApiResponse);
      return;
    }

    // 验证令牌
    const secret = process.env.WORDLIST_SECRET || 'default-secret-change-me';
    const isValid = await verifyWordlistToken(timestamp, token, secret);

    if (!isValid) {
      res.status(401).json({
        success: false,
        error: '令牌无效或已过期'
      } as ApiResponse);
      return;
    }

    // 获取词库
    const wordlist = getWordlist();

    // 混淆词库
    const key = `${timestamp}-${secret}`;
    const obfuscated = obfuscateWordlist(wordlist, key);

    // 获取校验和
    const checksum = await getWordlistChecksum();

    res.status(200).json({
      success: true,
      data: {
        wordlist: obfuscated,
        checksum,
        timestamp
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Get wordlist error:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
