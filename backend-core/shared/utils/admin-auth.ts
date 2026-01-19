import crypto from 'crypto';

function base64UrlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecodeToBuffer(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

export type AdminJwtPayload = {
  role: 'admin';
  iat: number;
  exp: number;
};

export function signAdminJwt(payload: Omit<AdminJwtPayload, 'iat' | 'exp'>, secret: string, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: AdminJwtPayload = {
    ...payload,
    role: 'admin',
    iat: now,
    exp: now + ttlSeconds
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export function verifyAdminJwt(token: string, secret: string): { valid: boolean; payload?: AdminJwtPayload; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, error: 'token格式错误' };
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(signingInput).digest();
    const givenSig = base64UrlDecodeToBuffer(encodedSignature);
    if (givenSig.length !== expectedSig.length || !crypto.timingSafeEqual(givenSig, expectedSig)) {
      return { valid: false, error: 'token签名无效' };
    }

    const payload = JSON.parse(base64UrlDecodeToBuffer(encodedPayload).toString('utf8')) as AdminJwtPayload;
    if (!payload || payload.role !== 'admin') return { valid: false, error: 'token角色无效' };
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || now >= payload.exp) return { valid: false, error: 'token已过期' };
    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'token解析失败' };
  }
}

export function hashAdminPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32) as Buffer;
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyAdminPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return password === 'admin';
  if (!storedHash.startsWith('scrypt:')) return password === storedHash;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length) as Buffer;
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

