/**
 * Crypto Service
 * 提供钱包加密相关的功能
 * 使用 Web Crypto API 进行客户端加密计算
 */

const SALT = "tongji-course-salt-2026";
const ITERATIONS = 100000;

/**
 * 使用 PBKDF2 派生密钥
 */
export async function deriveKeys(studentId: string, pin: string): Promise<{
  userHash: string;
  publicKey: string;
  mnemonic: string;
  userSecret: string;
}> {
  const input = `${studentId}:${pin}`;
  const enc = new TextEncoder();

  // 1. Import key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(input),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  // 2. Derive bits using PBKDF2 (临时密钥，用于生成助记词)
  const tempDerivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(SALT),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256 // 32 bytes
  );

  // 3. 生成助记词（从临时派生密钥）
  const tempBuffer = new Uint8Array(tempDerivedBits);
  const mnemonic = generateMnemonic(tempBuffer);

  // 4. 使用助记词作为输入，派生最终密钥
  // 这样确保助记词可以独立恢复钱包
  const mnemonicKeyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(mnemonic),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const finalDerivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(SALT),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    mnemonicKeyMaterial,
    256 // 32 bytes
  );

  // 5. Convert to hex string for userHash
  const buffer = new Uint8Array(finalDerivedBits);
  const userHash = Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // 6. Generate public key (simplified)
  const publicKey = userHash.substring(0, 32);

  // 7. userSecret is the same as userHash (used for signing)
  const userSecret = userHash;

  return {
    userHash,
    publicKey,
    mnemonic,
    userSecret
  };
}

/**
 * 生成助记词（简化版本）
 * 实际生产环境应使用完整的 BIP39 词库
 */
function generateMnemonic(buffer: Uint8Array): string {
  // 简化词库（实际应使用 2048 个同济/上海建筑物名称）
  const WORDLIST = [
    "同济", "四平", "嘉定", "沪西", "沪北",
    "彰武", "赤峰", "密云", "国定", "政立",
    "南校", "北校", "西校", "东校", "中校"
  ];

  const words: string[] = [];

  // 取前 3 个词
  for (let i = 0; i < 3; i++) {
    const index = (buffer[i * 2] << 8 | buffer[i * 2 + 1]) % WORDLIST.length;
    words.push(WORDLIST[index]);
  }

  return words.join("-");
}

/**
 * 计算 HMAC 签名
 */
export async function signPayload(
  payload: any,
  userSecret: string
): Promise<string> {
  const enc = new TextEncoder();
  const data = JSON.stringify(payload);

  // Import key
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(userSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(data)
  );

  // Convert to hex
  const buffer = new Uint8Array(signature);
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 验证 HMAC 签名
 */
export async function verifySignature(
  payload: any,
  signature: string,
  userSecret: string
): Promise<boolean> {
  const expectedSignature = await signPayload(payload, userSecret);
  return signature === expectedSignature;
}
