/**
 * YourTJ Credit - 词库保护机制
 * 实现词库的安全存储和访问控制
 *
 * 保护策略:
 * 1. 词库不直接暴露在前端代码中
 * 2. 通过加密的API端点获取
 * 3. 使用时间戳和签名验证请求合法性
 * 4. 限制请求频率，防止爬取
 */

import { generateWordlist } from './wordlist-generator';

/**
 * 词库缓存
 */
let cachedWordlist: string[] | null = null;

/**
 * 获取词库（服务端使用）
 */
export function getWordlist(): string[] {
  if (!cachedWordlist) {
    cachedWordlist = generateWordlist();
  }
  return cachedWordlist;
}

/**
 * 词库混淆（用于传输）
 * 使用简单的XOR加密，密钥从时间戳派生
 */
export function obfuscateWordlist(wordlist: string[], key: string): string {
  const data = JSON.stringify(wordlist);
  const keyBytes = new TextEncoder().encode(key);
  const dataBytes = new TextEncoder().encode(data);
  const result = new Uint8Array(dataBytes.length);

  for (let i = 0; i < dataBytes.length; i++) {
    result[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  return btoa(String.fromCharCode(...result));
}

/**
 * 词库解混淆（客户端使用）
 */
export function deobfuscateWordlist(obfuscated: string, key: string): string[] {
  const keyBytes = new TextEncoder().encode(key);
  const encryptedBytes = Uint8Array.from(atob(obfuscated), c => c.charCodeAt(0));
  const result = new Uint8Array(encryptedBytes.length);

  for (let i = 0; i < encryptedBytes.length; i++) {
    result[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  let data: string;
  try {
    data = new TextDecoder('utf-8', { fatal: true }).decode(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `词库解密失败（通常是前端 VITE_WORDLIST_SECRET 与后端 WORDLIST_SECRET 不一致，或缓存未更新）：${message}`
    );
  }
  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) throw new Error('词库格式无效');
    if (parsed.some((w) => typeof w === 'string' && w.includes('\uFFFD'))) {
      throw new Error('词库包含异常字符');
    }
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `词库解密失败（通常是前端 VITE_WORDLIST_SECRET 与后端 WORDLIST_SECRET 不一致，或缓存未更新）：${message}`
    );
  }
}

/**
 * 生成词库访问令牌
 * @param timestamp 时间戳
 * @param secret 服务端密钥
 */
export async function generateWordlistToken(
  timestamp: number,
  secret: string
): Promise<string> {
  const data = `wordlist:${timestamp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 验证词库访问令牌
 */
export async function verifyWordlistToken(
  timestamp: number,
  token: string,
  secret: string
): Promise<boolean> {
  // 1. 检查时间戳（5分钟内有效）
  const now = Date.now();
  if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
    return false;
  }

  // 2. 验证签名
  const expectedToken = await generateWordlistToken(timestamp, secret);
  return token === expectedToken;
}

/**
 * 词库访问频率限制
 * 使用简单的内存存储（生产环境应使用Redis）
 */
const accessLog = new Map<string, number[]>();

/**
 * 检查访问频率
 * @param clientId 客户端标识（IP或用户哈希）
 * @param maxRequests 最大请求次数
 * @param timeWindow 时间窗口（毫秒）
 */
export function checkRateLimit(
  clientId: string,
  maxRequests: number = 10,
  timeWindow: number = 60 * 1000
): boolean {
  const now = Date.now();
  const requests = accessLog.get(clientId) || [];

  // 清理过期记录
  const validRequests = requests.filter(time => now - time < timeWindow);

  // 检查是否超限
  if (validRequests.length >= maxRequests) {
    return false;
  }

  // 记录本次访问
  validRequests.push(now);
  accessLog.set(clientId, validRequests);

  return true;
}

/**
 * 清理过期的访问记录（定期调用）
 */
export function cleanupAccessLog(maxAge: number = 60 * 60 * 1000) {
  const now = Date.now();
  for (const [clientId, requests] of accessLog.entries()) {
    const validRequests = requests.filter(time => now - time < maxAge);
    if (validRequests.length === 0) {
      accessLog.delete(clientId);
    } else {
      accessLog.set(clientId, validRequests);
    }
  }
}

/**
 * 词库分片传输
 * 将词库分成多个片段，客户端需要多次请求才能获取完整词库
 */
export function getWordlistChunk(
  chunkIndex: number,
  chunkSize: number = 256
): string[] {
  const wordlist = getWordlist();
  const start = chunkIndex * chunkSize;
  const end = Math.min(start + chunkSize, wordlist.length);
  return wordlist.slice(start, end);
}

/**
 * 获取词库总片段数
 */
export function getWordlistChunkCount(chunkSize: number = 256): number {
  const wordlist = getWordlist();
  return Math.ceil(wordlist.length / chunkSize);
}

/**
 * 词库完整性校验
 * 生成词库的哈希值，用于验证完整性
 */
export async function getWordlistChecksum(): Promise<string> {
  const wordlist = getWordlist();
  const data = JSON.stringify(wordlist);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 验证词库完整性
 */
export async function verifyWordlistIntegrity(
  wordlist: string[],
  expectedChecksum: string
): Promise<boolean> {
  const data = JSON.stringify(wordlist);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const checksum = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return checksum === expectedChecksum;
}
