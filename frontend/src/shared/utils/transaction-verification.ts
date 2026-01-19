/**
 * YourTJ Credit - 交易验证模块
 * 实现HMAC签名、时间戳验证、防重放攻击
 *
 * 安全机制:
 * 1. HMAC-SHA256签名验证请求完整性
 * 2. 时间戳验证防止重放攻击
 * 3. Nonce机制防止重复请求
 * 4. 交易ID唯一性保证
 */

/**
 * 时间戳配置
 */
export const TIMESTAMP_CONFIG = {
  MAX_CLOCK_SKEW: 5 * 60 * 1000,  // 最大时钟偏差(5分钟)
  NONCE_EXPIRY: 10 * 60 * 1000    // Nonce过期时间(10分钟)
} as const;

/**
 * Nonce存储（防重放）
 * 生产环境应使用Redis
 */
const nonceStore = new Map<string, number>();

/**
 * 生成交易ID
 * 格式: TX-{timestamp}-{random}
 */
export function generateTransactionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `TX-${timestamp}-${random}`.toUpperCase();
}

/**
 * 生成Nonce
 * 用于防止重放攻击
 */
export function generateNonce(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.getRandomValues(new Uint8Array(16));
  const randomStr = Array.from(random)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${timestamp}-${randomStr}`;
}

/**
 * 验证时间戳
 * @param timestamp 请求时间戳
 * @param maxSkew 最大时钟偏差(毫秒)
 * @returns 是否有效
 */
export function validateTimestamp(
  timestamp: number,
  maxSkew: number = TIMESTAMP_CONFIG.MAX_CLOCK_SKEW
): boolean {
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  return diff <= maxSkew;
}

/**
 * 验证并记录Nonce
 * @param nonce Nonce值
 * @returns 是否有效（未使用过）
 */
export function validateAndRecordNonce(nonce: string): boolean {
  const now = Date.now();

  // 清理过期的Nonce
  for (const [key, timestamp] of nonceStore.entries()) {
    if (now - timestamp > TIMESTAMP_CONFIG.NONCE_EXPIRY) {
      nonceStore.delete(key);
    }
  }

  // 检查Nonce是否已使用
  if (nonceStore.has(nonce)) {
    return false;
  }

  // 记录Nonce
  nonceStore.set(nonce, now);
  return true;
}

/**
 * 生成HMAC签名
 * @param payload 载荷数据
 * @param userSecret 用户密钥
 * @returns 签名(十六进制字符串)
 */
export async function generateHMACSignature(
  payload: Record<string, any>,
  userSecret: string
): Promise<string> {
  // 1. 规范化载荷（按键排序）
  const sortedKeys = Object.keys(payload).sort();
  const normalizedPayload: Record<string, any> = {};
  for (const key of sortedKeys) {
    normalizedPayload[key] = payload[key];
  }

  // 2. 转换为字符串
  const payloadString = JSON.stringify(normalizedPayload);

  // 3. 导入密钥
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(userSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // 4. 生成签名
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payloadString)
  );

  // 5. 转换为十六进制
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 验证HMAC签名
 * @param payload 载荷数据
 * @param signature 签名
 * @param userSecret 用户密钥
 * @returns 是否有效
 */
export async function verifyHMACSignature(
  payload: Record<string, any>,
  signature: string,
  userSecret: string
): Promise<boolean> {
  try {
    const expectedSignature = await generateHMACSignature(payload, userSecret);
    return signature === expectedSignature;
  } catch {
    return false;
  }
}

/**
 * 创建签名请求
 * @param payload 请求载荷
 * @param userHash 用户哈希
 * @param userSecret 用户密钥
 * @returns 签名请求对象
 */
export async function createSignedRequest<T extends Record<string, any>>(
  payload: T,
  userHash: string,
  userSecret: string
): Promise<{
  payload: T;
  headers: Record<string, string>;
}> {
  // 1. 添加时间戳和Nonce（签名只使用扩展载荷，实际请求体保持原样，便于类型约束）
  const timestamp = Date.now();
  const nonce = generateNonce();
  const fullPayload = { ...payload, timestamp, nonce };

  // 2. 生成签名
  const signature = await generateHMACSignature(fullPayload, userSecret);

  // 3. 构造请求
  return {
    payload,
    headers: {
      'X-User-Hash': userHash,
      'X-Signature': signature,
      'X-Timestamp': timestamp.toString(),
      'X-Nonce': nonce
    }
  };
}

/**
 * 验证签名请求
 * @param payload 请求载荷
 * @param headers 请求头
 * @param userSecret 用户密钥（从数据库获取）
 * @returns 验证结果
 */
export async function verifySignedRequest(
  payload: Record<string, any>,
  headers: Record<string, string>,
  userSecret: string
): Promise<{
  valid: boolean;
  error?: string;
}> {
  // 1. 提取请求头
  const userHash = headers['x-user-hash'];
  const signature = headers['x-signature'];
  const timestampStr = headers['x-timestamp'];
  const nonce = headers['x-nonce'];

  if (!userHash || !signature || !timestampStr || !nonce) {
    return { valid: false, error: '缺少必要的请求头' };
  }

  // 2. 验证时间戳
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || !validateTimestamp(timestamp)) {
    return { valid: false, error: '时间戳无效或已过期' };
  }

  // 3. 验证Nonce
  if (!validateAndRecordNonce(nonce)) {
    return { valid: false, error: 'Nonce已使用或无效' };
  }

  // 4. 验证签名
  const fullPayload = {
    ...payload,
    timestamp,
    nonce
  };

  const signatureValid = await verifyHMACSignature(fullPayload, signature, userSecret);
  if (!signatureValid) {
    return { valid: false, error: '签名验证失败' };
  }

  return { valid: true };
}

/**
 * 清理过期的Nonce（定期调用）
 */
export function cleanupNonceStore() {
  const now = Date.now();
  for (const [nonce, timestamp] of nonceStore.entries()) {
    if (now - timestamp > TIMESTAMP_CONFIG.NONCE_EXPIRY) {
      nonceStore.delete(nonce);
    }
  }
}

/**
 * 生成交易哈希
 * 用于交易的唯一标识和完整性验证
 */
export async function generateTransactionHash(
  txId: string,
  fromUserHash: string | undefined,
  toUserHash: string | undefined,
  amount: number,
  timestamp: number
): Promise<string> {
  const data = `${txId}:${fromUserHash || ''}:${toUserHash || ''}:${amount}:${timestamp}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 验证交易完整性
 */
export async function verifyTransactionIntegrity(
  txId: string,
  fromUserHash: string | undefined,
  toUserHash: string | undefined,
  amount: number,
  timestamp: number,
  expectedHash: string
): Promise<boolean> {
  const hash = await generateTransactionHash(txId, fromUserHash, toUserHash, amount, timestamp);
  return hash === expectedHash;
}

/**
 * 生成任务ID
 */
export function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `TASK-${timestamp}-${random}`.toUpperCase();
}

/**
 * 生成商品ID
 */
export function generateProductId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `PROD-${timestamp}-${random}`.toUpperCase();
}

/**
 * 生成购买ID
 */
export function generatePurchaseId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `PUR-${timestamp}-${random}`.toUpperCase();
}

/**
 * 生成举报ID
 */
export function generateReportId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `RPT-${timestamp}-${random}`.toUpperCase();
}
