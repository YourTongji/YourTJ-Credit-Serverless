/**
 * YourTJ Credit - 转账页面
 * 支持向其他钱包转账积分
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { Html5Qrcode } from 'html5-qrcode';
import { Send, Lock, AlertCircle, CheckCircle, Loader2, QrCode as QrCodeIcon, X } from 'lucide-react';
import { loadWallet } from '../utils/wallet-storage';
import { getWallet, transfer } from '../services/api';
import { createSignedRequest } from '../shared/utils/transaction-verification';
import { parseQRCodeData } from '@shared/utils/wallet';
import type { Wallet } from '@shared/types';

export function TransferPage() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  // 表单状态
  const [toUserHash, setToUserHash] = useState('');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // 转账确认模态框（不再要求 PIN）
  const [showPinModal, setShowPinModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 扫码收款人地址（移动端）
  const qrReaderId = 'transfer-qr-reader';
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanStarting, setScanStarting] = useState(false);

  // 结果状态
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!showScanModal) {
      void stopQrScanner();
      return;
    }

    void startQrScanner();

    return () => {
      void stopQrScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScanModal]);

  async function loadData() {
    try {
      const localWallet = loadWallet();
      if (!localWallet) {
        console.error('No wallet found');
        setLoading(false);
        return;
      }

      const walletData = await getWallet(localWallet.userHash);
      setWallet(walletData);
    } catch (err) {
      console.error('Load wallet error:', err);
      setError('加载钱包信息失败');
    } finally {
      setLoading(false);
    }
  }

  // 验证表单
  function validateForm(): string | null {
    if (!toUserHash || toUserHash.length !== 64) {
      return '请输入有效的收款人地址（64位哈希）';
    }

    if (!amount || parseFloat(amount) <= 0) {
      return '请输入有效的转账金额';
    }

    if (parseFloat(amount) > (wallet?.balance || 0)) {
      return '余额不足';
    }

    if (!title || title.trim().length === 0) {
      return '请输入转账标题';
    }

    if (title.length > 100) {
      return '标题不能超过100个字符';
    }

    if (description && description.length > 500) {
      return '描述不能超过500个字符';
    }

    return null;
  }

  async function stopQrScanner() {
    const scanner = qrScannerRef.current;
    qrScannerRef.current = null;
    if (!scanner) return;
    try {
      await scanner.stop();
    } catch {
      // ignore
    }
    try {
      await scanner.clear();
    } catch {
      // ignore
    }
  }

  async function startQrScanner() {
    if (scanStarting) return;
    setScanStarting(true);
    setScanError('');

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      await stopQrScanner();

      const scanner = new Html5Qrcode(qrReaderId);
      qrScannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
        async (decodedText) => {
          const raw = (decodedText || '').trim();
          const parsed = parseQRCodeData(raw);
          const candidate = parsed?.userHash || raw;

          if (!/^[0-9a-fA-F]{64}$/.test(candidate)) {
            setScanError('二维码内容不是有效的钱包地址');
            return;
          }

          setToUserHash(candidate);
          setShowScanModal(false);
          await stopQrScanner();
        },
        () => {}
      );
    } catch (err: any) {
      setScanError(err?.message || '无法启动相机扫码');
      await stopQrScanner();
    } finally {
      setScanStarting(false);
    }
  }

  // 提交转账
  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setShowPinModal(true);
  }

  // 确认并执行转账（不再要求 PIN）
  async function handleConfirmTransfer() {
    if (!wallet) {
      setError('钱包信息加载失败');
      return;
    }

    setSubmitting(true);

    try {
      const localWallet = loadWallet();
      if (!localWallet) {
        setError('请先登录钱包');
        setSubmitting(false);
        return;
      }

      const { payload, headers } = await createSignedRequest(
        {
          toUserHash,
          amount: parseFloat(amount),
          title: title.trim(),
          description: description.trim() || undefined
        },
        wallet.userHash,
        localWallet.userSecret
      );

      await transfer(payload, headers);

      // 转账成功
      setSuccess(true);
      setShowPinModal(false);

      // 3秒后跳转到流水页面
      setTimeout(() => {
        navigate('/dashboard/history');
      }, 3000);
    } catch (err: any) {
      console.error('Transfer error:', err);
      setError(err.message || '转账失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  // 重置表单
  function handleReset() {
    setToUserHash('');
    setAmount('');
    setTitle('');
    setDescription('');
    setError('');
    setSuccess(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-600 dark:text-gray-400">钱包数据加载失败</p>
      </div>
    );
  }

  // 成功页面
  if (success) {
    return (
      <div className="max-w-xl mx-auto flex items-center justify-center h-full">
        <div className="text-center space-y-6 animate-in fade-in duration-500">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={48} className="text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">转账成功！</h2>
            <p className="text-slate-600 dark:text-slate-400">
              已向 {toUserHash.substring(0, 8)}... 转账 {amount} 小济元
            </p>
          </div>
          <p className="text-sm text-slate-500">3秒后自动跳转到交易流水...</p>
          <button
            onClick={() => navigate('/dashboard/history')}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            立即查看
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20 md:pb-0">

      {/* 页面标题 */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg">
          <Send size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">转账</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            当前余额：<span className="font-mono font-bold text-slate-700 dark:text-slate-300">{wallet.balance}</span> 小济元
          </p>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* 转账表单 */}
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* 收款人地址 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              收款人地址 <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => {
                setError('');
                setScanError('');
                setShowScanModal(true);
              }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1.5"
            >
              <QrCodeIcon size={16} />
              扫码
            </button>
          </div>
          <input
            type="text"
            value={toUserHash}
            onChange={(e) => setToUserHash(e.target.value)}
            placeholder="请输入64位钱包地址"
            className="w-full px-4 py-3 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <p className="text-xs text-slate-500">可以扫描对方的收款二维码获取地址</p>
        </div>

        {/* 转账金额 */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            转账金额 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              max={wallet.balance}
              className="w-full px-4 py-3 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-lg pr-20"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
              小济元
            </div>
          </div>
          <div className="flex gap-2">
            {[10, 50, 100, 500].map(val => (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(val.toString())}
                className="px-3 py-1 text-xs bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* 转账标题 */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            转账标题 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：课程资料费、帮忙代购等"
            maxLength={100}
            className="w-full px-4 py-3 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-500">{title.length}/100</p>
        </div>

        {/* 转账描述 */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            转账描述（可选）
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="添加备注信息..."
            maxLength={500}
            rows={3}
            className="w-full px-4 py-3 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <p className="text-xs text-slate-500">{description.length}/500</p>
        </div>

        {/* 提交按钮 */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 py-3 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
          >
            重置
          </button>
          <button
            type="submit"
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Send size={18} />
            <span>确认转账</span>
          </button>
        </div>
      </form>

      {/* 安全提示 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-bold text-blue-900 dark:text-blue-200 mb-2 flex items-center gap-2">
          <Lock size={16} />
          <span>安全提示</span>
        </h4>
        <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
          <li>• 转账前请仔细核对收款人地址，转账后无法撤销</li>
          <li>• 所有交易都会记录在系统流水中，可在流水页面查看</li>
        </ul>
      </div>

      {/* 扫码模态框 */}
      {showScanModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-5 max-w-sm w-full shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                    <QrCodeIcon size={20} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">扫码获取地址</h3>
                </div>
                <button
                  onClick={() => setShowScanModal(false)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  aria-label="关闭"
                >
                  <X size={18} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <div className="relative aspect-square rounded-2xl overflow-hidden bg-black/10 dark:bg-black/30 mb-3">
                <div id={qrReaderId} className="w-full h-full" />
                {scanStarting && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-black/40 backdrop-blur-md px-3 py-2 rounded-xl">
                      <Loader2 size={16} className="animate-spin" />
                      启动相机中...
                    </div>
                  </div>
                )}
              </div>

              {scanError && (
                <p className="text-xs text-red-600 dark:text-red-400 mb-3">{scanError}</p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                支持扫描对方“收款二维码”（钱包地址）或绑定二维码（将自动取其中的地址）
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowScanModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => void startQrScanner()}
                  disabled={scanStarting}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {scanStarting ? '启动中...' : '重试'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 转账确认模态框 */}
      {showPinModal &&
        typeof document !== 'undefined' &&
        createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <Lock size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">确认转账</h3>
            </div>

            <div className="mb-4 p-3 bg-slate-50 dark:bg-white/5 rounded-lg space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">收款人：</span>
                <span className="font-mono text-slate-900 dark:text-white">{toUserHash.substring(0, 12)}...</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">金额：</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{amount} 小济元</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">标题：</span>
                <span className="text-slate-900 dark:text-white">{title}</span>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">确认后将发起转账并写入交易流水</p>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowPinModal(false);
                }}
                disabled={submitting}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmTransfer}
                disabled={submitting}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>处理中...</span>
                  </>
                ) : (
                  '确认'
                )}
              </button>
            </div>
          </div>
        </div>,
          document.body
        )}
    </div>
  );
}
