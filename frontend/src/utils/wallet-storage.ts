/**
 * YourTJ Credit - 钱包存储工具
 * 管理本地钱包信息的存储和读取
 */

import type { MnemonicInfo } from '@shared/types';

const STORAGE_KEY = 'yourtj_credit_wallet';

/**
 * 钱包存储数据
 */
export interface WalletStorage {
  mnemonic: string;
  userHash: string;
  userSecret: string;
  createdAt: number;
}

/**
 * 保存钱包到本地存储
 */
export function saveWallet(walletInfo: MnemonicInfo): void {
  const data: WalletStorage = {
    mnemonic: walletInfo.mnemonic,
    userHash: walletInfo.userHash,
    userSecret: walletInfo.userSecret,
    createdAt: Date.now()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * 从本地存储读取钱包
 */
export function loadWallet(): WalletStorage | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data) as WalletStorage;
  } catch {
    return null;
  }
}

/**
 * 清除本地钱包
 */
export function clearWallet(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 检查是否已登录
 */
export function isLoggedIn(): boolean {
  return loadWallet() !== null;
}

/**
 * 获取当前用户哈希
 */
export function getCurrentUserHash(): string | null {
  const wallet = loadWallet();
  return wallet?.userHash || null;
}

/**
 * 获取当前用户密钥
 */
export function getCurrentUserSecret(): string | null {
  const wallet = loadWallet();
  return wallet?.userSecret || null;
}
