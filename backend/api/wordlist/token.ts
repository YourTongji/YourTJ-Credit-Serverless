/**
 * YourTJ Credit - 词库令牌API
 * POST /api/wordlist/token
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../../lib/cors';
import { generateWordlistToken } from '../../shared/utils/wordlist-protection';
import type { ApiResponse } from '../../shared/types';

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const timestamp = Date.now();
    const secret = process.env.WORDLIST_SECRET || 'default-secret-change-me';
    const token = await generateWordlistToken(timestamp, secret);

    res.status(200).json({
      success: true,
      data: {
        timestamp,
        token
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Generate wordlist token error:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    } as ApiResponse);
  }
}

export default withCors(handler);
