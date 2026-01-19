/**
 * Wordlist Service
 * 提供助记词词库
 */

import { generateWordlistToken as generateToken, getWordlist as getWordlistApi } from './api';
import { deobfuscateWordlist, verifyWordlistIntegrity } from '@shared/utils/wordlist-protection';

type CachedWordlist = {
  wordlist: string[];
  checksum: string;
  fetchedAt: number;
};

let cache: CachedWordlist | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * 获取词库
 * @returns 词库数组
 */
export async function getWordlist(): Promise<string[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.wordlist;
  }

  const secret = import.meta.env.VITE_WORDLIST_SECRET;
  if (!secret) {
    throw new Error('VITE_WORDLIST_SECRET 未配置');
  }

  try {
    const { timestamp, token } = await generateToken();
    const { wordlist: obfuscated, checksum } = await getWordlistApi(timestamp, token);

    const key = `${timestamp}-${secret}`;
    const wordlist = deobfuscateWordlist(obfuscated, key);

    if (wordlist.length !== 2048) {
      throw new Error('词库大小异常');
    }

    const ok = await verifyWordlistIntegrity(wordlist, checksum);
    if (!ok) {
      throw new Error('词库校验失败');
    }

    cache = { wordlist, checksum, fetchedAt: Date.now() };
    return wordlist;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('词库解密失败')) throw err;
    throw new Error(`获取词库失败：${message}`);
  }
}

/**
 * 验证词是否在词库中
 * @param word 要验证的词
 * @returns 是否在词库中
 */
export async function isWordInWordlist(word: string): Promise<boolean> {
  const wordlist = await getWordlist();
  return wordlist.includes(word);
}

/**
 * 获取词库大小
 * @returns 词库大小
 */
export function getWordlistSize(): number {
  return cache?.wordlist.length ?? 2048;
}
