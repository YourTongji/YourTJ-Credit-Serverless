/**
 * YourTJ Credit - CORS 中间件
 * 处理跨域请求
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * CORS 配置
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-User-Hash, X-Signature, X-Timestamp, X-Nonce, X-Admin-Token',
  'Access-Control-Max-Age': '86400',
};

/**
 * 添加 CORS 头
 */
export function addCorsHeaders(res: VercelResponse): void {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

/**
 * 处理 OPTIONS 预检请求
 */
export function handleCorsPreFlight(
  req: VercelRequest,
  res: VercelResponse
): boolean {
  if (req.method === 'OPTIONS') {
    addCorsHeaders(res);
    res.status(200).end();
    return true;
  }
  return false;
}

/**
 * CORS 中间件包装器
 */
export function withCors(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    // 添加 CORS 头
    addCorsHeaders(res);

    // 处理 OPTIONS 预检请求
    if (handleCorsPreFlight(req, res)) {
      return;
    }

    // 执行实际的处理函数
    await handler(req, res);
  };
}
