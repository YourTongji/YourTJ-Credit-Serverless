/**
 * YourTJ Credit - 钱包页面
 * 用户注册/登录入口
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { generateWallet, validateStudentId, validatePin } from '@shared/utils/wallet';
import { generateWordlistToken, getWordlist } from '../services/api';
import { deobfuscateWordlist } from '@shared/utils/wordlist-protection';
import { saveWallet, isLoggedIn } from '../utils/wallet-storage';
import { registerWallet } from '../services/api';

export function WalletPage() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wordlist, setWordlist] = useState<string[] | null>(null);

  // 检查是否已登录
  useEffect(() => {
    if (isLoggedIn()) {
      navigate('/dashboard');
    }
  }, [navigate]);

  // 加载词库
  useEffect(() => {
    loadWordlist();
  }, []);

  async function loadWordlist() {
    try {
      // 1. 获取访问令牌
      const { timestamp, token } = await generateWordlistToken();

      // 2. 获取混淆的词库
      const { wordlist: obfuscated } = await getWordlist(timestamp, token);

      // 3. 解混淆
      const key = `${timestamp}-${import.meta.env.VITE_WORDLIST_SECRET || 'default-secret'}`;
      const deobfuscated = deobfuscateWordlist(obfuscated, key);

      setWordlist(deobfuscated);
    } catch (err) {
      console.error('Failed to load wordlist:', err);
      setError('词库加载失败，请刷新页面重试');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    // 验证输入
    if (!validateStudentId(studentId)) {
      setError('学号格式无效（应为7-10位数字）');
      return;
    }

    if (!validatePin(pin)) {
      setError('PIN码长度必须在6-32位之间');
      return;
    }

    if (!wordlist) {
      setError('词库未加载，请稍后再试');
      return;
    }

    setLoading(true);

    try {
      // 1. 生成钱包
      const walletInfo = await generateWallet(studentId, pin, wordlist);

      // 2. 注册钱包到服务器
      await registerWallet(walletInfo.userHash, { userSecret: walletInfo.userSecret });

      // 3. 保存到本地
      saveWallet(walletInfo);

      // 4. 跳转到仪表板
      navigate('/dashboard');
    } catch (err) {
      console.error('Wallet creation error:', err);
      setError(err instanceof Error ? err.message : '钱包创建失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-full max-w-md"
      >
        <GlassCard className="p-8">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <img src="/favicon.svg" alt="YourTJ Credit" className="w-9 h-9" />
            </div>
          </div>

          {/* 标题 */}
          <h1 className="text-3xl font-bold text-center mb-2 text-gray-900 dark:text-white">
            YourTJ Credit
          </h1>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
            去中心化积分钱包
          </p>

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 学号输入 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                学号
              </label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="请输入同济大学学号"
                className="w-full px-4 py-3 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-600 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                disabled={loading}
              />
            </div>

            {/* PIN码输入 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                PIN码
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="请输入6-32位PIN码"
                  className="w-full px-4 py-3 pr-12 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-600 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* 错误提示 */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* 提交按钮 */}
            <motion.button
              type="submit"
              disabled={loading || !wordlist}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              whileTap={{ scale: 0.98 }}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  生成钱包中...
                </span>
              ) : (
                '登录 / 注册'
              )}
            </motion.button>
          </form>

          {/* 说明 */}
          <div className="mt-6 space-y-4">
            {/* 安全提示 */}
            <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50">
              <div className="flex items-start">
                <Lock className="w-5 h-5 text-gray-700 dark:text-gray-300 mr-2 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <p className="font-medium mb-2">安全提示</p>
                  <ul className="space-y-1 text-xs leading-relaxed">
                    <li>• 未注册的学号将自动创建新钱包</li>
                    <li>• 已注册的学号可通过学号+PIN直接登录</li>
                    <li>• 请妥善保管您的PIN码，遗失无法找回</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 加密技术说明 */}
            <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50">
              <p className="font-medium text-sm text-gray-900 dark:text-white mb-2">
                加密技术原理
              </p>
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2 leading-relaxed">
                <p>
                  本系统采用 <span className="font-mono text-gray-900 dark:text-white">PBKDF2 + BIP39</span> 标准实现去中心化钱包：
                </p>
                <ul className="space-y-1 pl-4">
                  <li>• 您的学号和PIN码通过PBKDF2算法（100,000次迭代）生成确定性助记词</li>
                  <li>• 所有计算在您的浏览器本地完成，服务器无法获取您的输入</li>
                  <li>• 助记词无法被逆向推导出学号和PIN码</li>
                  <li>• 服务器仅存储钱包地址哈希，不存储任何可识别信息</li>
                </ul>
                <p className="pt-2 text-gray-500 dark:text-gray-500">
                  注意：持有多个钱包不会带来额外收益，建议仅使用一个钱包。
                </p>
              </div>
            </div>

            {/* 其他登录方式 */}
            <div className="flex flex-col space-y-2">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-full py-2.5 px-4 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 text-sm text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-all"
              >
                通过二维码导入钱包
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-full py-2.5 px-4 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 text-sm text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-all"
              >
                通过助记词导入钱包
              </button>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
