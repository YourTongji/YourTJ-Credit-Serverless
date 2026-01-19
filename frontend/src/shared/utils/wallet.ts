/**
 * YourTJ Credit - 钱包核心模块
 * 实现去中心化钱包生成、助记词派生、签名验证
 *
 * 安全原则:
 * 1. 所有计算在客户端完成
 * 2. 服务器不存储学号和PIN
 * 3. 使用PBKDF2进行密钥派生
 * 4. 助记词确定性生成
 */

import { MnemonicInfo } from '../types';

// ============================================
// 常量定义
// ============================================

/**
 * PBKDF2 配置
 */
export const PBKDF2_CONFIG = {
  SALT: 'tongji-course-salt-2026',  // 固定盐值,确保确定性
  ITERATIONS: 100000,                // 迭代次数(10万次,防暴力破解)
  KEY_LENGTH: 32,                    // 密钥长度(32字节 = 256位)
  HASH_ALGORITHM: 'SHA-256'          // 哈希算法
} as const;

/**
 * 助记词配置
 */
export const MNEMONIC_CONFIG = {
  WORD_COUNT: 3,                     // 助记词数量
  WORDLIST_SIZE: 2048                // 词库大小(2^11)
} as const;

/**
 * PIN码配置
 */
export const PIN_CONFIG = {
  MIN_LENGTH: 6,                     // 最小长度
  MAX_LENGTH: 32                     // 最大长度
} as const;

// ============================================
// 工具函数
// ============================================

/**
 * 将字符串转换为Uint8Array
 */
function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function uint8ArrayToArrayBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
}

/**
 * 将Uint8Array转换为十六进制字符串
 */
function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 将Uint8Array转换为Base64字符串
 */
function uint8ArrayToBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr));
}

// ============================================
// 核心加密函数
// ============================================

/**
 * 使用PBKDF2派生密钥
 * @param input 输入字符串(学号+PIN)
 * @param salt 盐值
 * @param iterations 迭代次数
 * @param keyLength 密钥长度(字节)
 * @returns 派生的密钥(Uint8Array)
 */
export async function deriveKey(
  input: string,
  salt: string = PBKDF2_CONFIG.SALT,
  iterations: number = PBKDF2_CONFIG.ITERATIONS,
  keyLength: number = PBKDF2_CONFIG.KEY_LENGTH
): Promise<Uint8Array> {
  // 1. 将输入转换为密钥材料
  const inputBytes = stringToUint8Array(input);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    uint8ArrayToArrayBuffer(inputBytes),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  // 2. 使用PBKDF2派生密钥
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: uint8ArrayToArrayBuffer(stringToUint8Array(salt)),
      iterations: iterations,
      hash: PBKDF2_CONFIG.HASH_ALGORITHM
    },
    keyMaterial,
    keyLength * 8  // 转换为位数
  );

  return new Uint8Array(derivedBits);
}

/**
 * 从派生密钥生成用户哈希
 * @param derivedKey 派生的密钥
 * @returns 用户哈希(十六进制字符串)
 */
export async function generateUserHash(derivedKey: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', uint8ArrayToArrayBuffer(derivedKey));
  return uint8ArrayToHex(new Uint8Array(hashBuffer));
}

/**
 * 从派生密钥生成用户密钥(用于签名)
 * @param derivedKey 派生的密钥
 * @returns 用户密钥(Base64字符串)
 */
export function generateUserSecret(derivedKey: Uint8Array): string {
  return uint8ArrayToBase64(derivedKey);
}

// ============================================
// 助记词生成
// ============================================

/**
 * 从派生密钥生成助记词
 * @param derivedKey 派生的密钥
 * @param wordlist 词库数组
 * @returns 助记词(用"-"连接的字符串)
 */
export function generateMnemonic(
  derivedKey: Uint8Array,
  wordlist: string[]
): string {
  if (wordlist.length !== MNEMONIC_CONFIG.WORDLIST_SIZE) {
    throw new Error(`词库大小必须为${MNEMONIC_CONFIG.WORDLIST_SIZE}`);
  }

  const words: string[] = [];

  // 从派生密钥中提取索引
  for (let i = 0; i < MNEMONIC_CONFIG.WORD_COUNT; i++) {
    // 每个词使用2个字节(16位)
    const offset = i * 2;
    const index = ((derivedKey[offset] << 8) | derivedKey[offset + 1]) % wordlist.length;
    words.push(wordlist[index]);
  }

  return words.join('-');
}

/**
 * 验证助记词格式
 * @param mnemonic 助记词
 * @returns 是否有效
 */
export function validateMnemonic(mnemonic: string): boolean {
  const words = mnemonic.split('-');
  return words.length === MNEMONIC_CONFIG.WORD_COUNT &&
         words.every(word => word.length > 0);
}

// ============================================
// 钱包生成
// ============================================

/**
 * 验证PIN码
 * @param pin PIN码
 * @returns 是否有效
 */
export function validatePin(pin: string): boolean {
  return pin.length >= PIN_CONFIG.MIN_LENGTH &&
         pin.length <= PIN_CONFIG.MAX_LENGTH;
}

/**
 * 验证学号
 * @param studentId 学号
 * @returns 是否有效
 */
export function validateStudentId(studentId: string): boolean {
  // 同济大学学号通常是7-10位数字
  return /^\d{7,10}$/.test(studentId);
}

/**
 * 生成钱包(完整流程)
 * @param studentId 学号
 * @param pin PIN码
 * @param wordlist 词库数组
 * @returns 助记词信息
 */
export async function generateWallet(
  studentId: string,
  pin: string,
  wordlist: string[]
): Promise<MnemonicInfo> {
  // 1. 验证输入
  if (!validateStudentId(studentId)) {
    throw new Error('学号格式无效');
  }
  if (!validatePin(pin)) {
    throw new Error(`PIN码长度必须在${PIN_CONFIG.MIN_LENGTH}-${PIN_CONFIG.MAX_LENGTH}位之间`);
  }

  // 2. 组合输入
  const input = `${studentId}:${pin}`;

  // 3. 派生密钥
  const derivedKey = await deriveKey(input);

  // 4. 生成助记词
  const mnemonic = generateMnemonic(derivedKey, wordlist);

  // 5. 使用助记词派生钱包主密钥（用于跨设备恢复）
  const mnemonicKey = await deriveKey(mnemonic);

  // 6. 生成用户哈希
  const userHash = await generateUserHash(mnemonicKey);

  // 7. 生成用户密钥
  const userSecret = generateUserSecret(mnemonicKey);

  return {
    mnemonic,
    userHash,
    userSecret
  };
}

/**
 * 从助记词恢复钱包
 * 注意: 这个函数仅用于验证,实际上助记词是从学号+PIN派生的
 * @param studentId 学号
 * @param pin PIN码
 * @param wordlist 词库数组
 * @param expectedMnemonic 期望的助记词
 * @returns 是否匹配
 */
export async function verifyWallet(
  studentId: string,
  pin: string,
  wordlist: string[],
  expectedMnemonic: string
): Promise<boolean> {
  try {
    const walletInfo = await generateWallet(studentId, pin, wordlist);
    return walletInfo.mnemonic === expectedMnemonic;
  } catch {
    return false;
  }
}

/**
 * 从助记词直接恢复钱包（不需要学号+PIN）
 * @param mnemonic 助记词
 * @param wordlist 词库数组
 * @returns 助记词信息
 */
export async function restoreWalletFromMnemonic(
  mnemonic: string,
  wordlist: string[]
): Promise<MnemonicInfo> {
  // 1. 验证助记词格式
  if (!validateMnemonic(mnemonic)) {
    throw new Error('助记词格式无效');
  }

  // 2. 验证助记词中的每个词是否在词库中
  const words = mnemonic.split('-');
  for (const word of words) {
    if (!wordlist.includes(word)) {
      throw new Error(`词库中不存在词语: ${word}`);
    }
  }

  // 3. 使用助记词作为输入，派生密钥（与 generateWallet 中使用一致的 PBKDF2 配置）
  const derivedKey = await deriveKey(mnemonic);

  // 4. 生成用户哈希与签名密钥
  const userHash = await generateUserHash(derivedKey);
  const userSecret = generateUserSecret(derivedKey);

  return { mnemonic, userHash, userSecret };
}

// ============================================
// 交易签名
// ============================================

/**
 * 生成交易签名
 * @param payload 交易载荷
 * @param userSecret 用户密钥
 * @returns 签名(十六进制字符串)
 */
export async function signTransaction(
  payload: Record<string, any>,
  userSecret: string
): Promise<string> {
  // 1. 将载荷转换为字符串
  const payloadString = JSON.stringify(payload);

  // 2. 导入密钥
  const secretBytes = stringToUint8Array(userSecret);
  const key = await crypto.subtle.importKey(
    'raw',
    uint8ArrayToArrayBuffer(secretBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // 3. 生成签名
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    uint8ArrayToArrayBuffer(stringToUint8Array(payloadString))
  );

  return uint8ArrayToHex(new Uint8Array(signature));
}

/**
 * 验证交易签名
 * @param payload 交易载荷
 * @param signature 签名
 * @param userSecret 用户密钥
 * @returns 是否有效
 */
export async function verifyTransactionSignature(
  payload: Record<string, any>,
  signature: string,
  userSecret: string
): Promise<boolean> {
  try {
    const expectedSignature = await signTransaction(payload, userSecret);
    return signature === expectedSignature;
  } catch {
    return false;
  }
}

// ============================================
// 二维码生成
// ============================================

/**
 * 生成钱包绑定二维码数据
 * @param mnemonic 助记词
 * @param userHash 用户哈希
 * @returns 二维码数据(JSON字符串)
 */
export function generateQRCodeData(mnemonic: string, userHash: string): string {
  return JSON.stringify({
    type: 'yourtj-credit-wallet',
    version: '1.0',
    mnemonic,
    userHash,
    timestamp: Date.now()
  });
}

/**
 * 解析钱包绑定二维码数据
 * @param qrData 二维码数据
 * @returns 解析后的数据
 */
export function parseQRCodeData(qrData: string): {
  mnemonic: string;
  userHash: string;
  timestamp: number;
} | null {
  try {
    const data = JSON.parse(qrData);
    if (data.type !== 'yourtj-credit-wallet' || data.version !== '1.0') {
      return null;
    }
    return {
      mnemonic: data.mnemonic,
      userHash: data.userHash,
      timestamp: data.timestamp
    };
  } catch {
    return null;
  }
}

// ============================================
// 加密文件导出/导入
// ============================================

/**
 * 导出加密的钱包文件
 * @param mnemonic 助记词
 * @param userHash 用户哈希
 * @param password 加密密码
 * @returns 加密后的数据(Base64字符串)
 */
export async function exportEncryptedWallet(
  mnemonic: string,
  userHash: string,
  password: string
): Promise<string> {
  // 1. 准备数据
  const data = JSON.stringify({
    mnemonic,
    userHash,
    timestamp: Date.now()
  });

  // 2. 派生加密密钥
  const encryptionKey = await deriveKey(password, 'wallet-encryption-salt', 10000, 32);

  // 3. 生成随机IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 4. 导入密钥
  const key = await crypto.subtle.importKey(
    'raw',
    uint8ArrayToArrayBuffer(encryptionKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // 5. 加密数据
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    uint8ArrayToArrayBuffer(stringToUint8Array(data))
  );

  // 6. 组合IV和加密数据
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return uint8ArrayToBase64(combined);
}

/**
 * 导入加密的钱包文件
 * @param encryptedData 加密的数据(Base64字符串)
 * @param password 解密密码
 * @returns 钱包信息
 */
export async function importEncryptedWallet(
  encryptedData: string,
  password: string
): Promise<{ mnemonic: string; userHash: string; timestamp: number }> {
  // 1. 解码Base64
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

  // 2. 分离IV和加密数据
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  // 3. 派生解密密钥
  const encryptionKey = await deriveKey(password, 'wallet-encryption-salt', 10000, 32);

  // 4. 导入密钥
  const key = await crypto.subtle.importKey(
    'raw',
    uint8ArrayToArrayBuffer(encryptionKey),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // 5. 解密数据
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    uint8ArrayToArrayBuffer(encrypted)
  );

  // 6. 解析数据
  const data = JSON.parse(new TextDecoder().decode(decrypted));
  return {
    mnemonic: data.mnemonic,
    userHash: data.userHash,
    timestamp: data.timestamp
  };
}
