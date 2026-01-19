/**
 * YourTJ Credit - 交易详情页面
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { ModalPortal } from '../components/ModalPortal';
import { getTransaction, createReport } from '../services/api';
import { loadWallet } from '../utils/wallet-storage';
import { createSignedRequest } from '../shared/utils/transaction-verification';
import type { Transaction } from '@shared/types';

export function TransactionDetailPage() {
  const navigate = useNavigate();
  const { txId } = useParams<{ txId: string }>();
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [messageModal, setMessageModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: '',
    message: ''
  });

  useEffect(() => {
    if (txId) {
      loadTransaction();
    }
  }, [txId]);

  async function loadTransaction() {
    try {
      if (!txId) return;
      const tx = await getTransaction(txId);
      setTransaction(tx);
    } catch (err) {
      console.error('Load transaction error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleReport(type: 'appeal' | 'report', reason: string, description?: string) {
    const localWallet = loadWallet();
    if (!localWallet || !txId) {
      setMessageModal({ open: true, title: '需要登录', message: '请先登录钱包' });
      return;
    }

    try {
      const { payload, headers } = await createSignedRequest(
        { txId, type, reason, description },
        localWallet.userHash,
        localWallet.userSecret
      );

      await createReport(payload, headers);
      setMessageModal({ open: true, title: '提交成功', message: '申诉/举报已提交' });
      setShowReportModal(false);
    } catch (err: any) {
      setMessageModal({ open: true, title: '提交失败', message: err?.message || '举报提交失败' });
    }
  }

  function formatDate(timestamp: number) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">交易不存在</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-3 md:p-4">
      <div className="max-w-2xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center mb-4">
          <button
            onClick={() => navigate(-1)}
            className="mr-3 p-2 rounded-lg bg-white/50 dark:bg-gray-800/50 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg md:text-2xl font-bold text-gray-900 dark:text-white whitespace-nowrap">
            交易详情
          </h1>
        </div>

        {/* 交易信息 */}
        <GlassCard className="p-4 md:p-6">
          {/* 状态 */}
          <div className="flex items-center justify-center mb-4">
            <div className="text-center">
              <CheckCircle className="w-10 h-10 md:w-16 md:h-16 text-green-500 mx-auto mb-1" />
              <p className="text-sm md:text-lg font-semibold text-gray-900 dark:text-white">交易成功</p>
            </div>
          </div>

          {/* 金额 */}
          <div className="text-center mb-4">
            <p className="text-2xl md:text-4xl font-bold text-gray-900 dark:text-white leading-none">
              {transaction.amount}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">积分</p>
          </div>

          {/* 详细信息 */}
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-[72px,1fr] gap-3 items-center py-2 border-b border-gray-200 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">交易标题</span>
              <span className="min-w-0 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap truncate" title={transaction.title}>
                {transaction.title}
              </span>
            </div>

            <div className="grid grid-cols-[72px,1fr] gap-3 items-center py-2 border-b border-gray-200 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">交易类型</span>
              <span className="min-w-0 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap truncate" title={transaction.typeDisplayName}>
                {transaction.typeDisplayName}
              </span>
            </div>

            <div className="grid grid-cols-[72px,1fr] gap-3 items-center py-2 border-b border-gray-200 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">交易ID</span>
              <span className="min-w-0 text-right font-mono text-[11px] text-gray-900 dark:text-white whitespace-nowrap truncate" title={transaction.txId}>
                {transaction.txId}
              </span>
            </div>

            <div className="grid grid-cols-[72px,1fr] gap-3 items-center py-2 border-b border-gray-200 dark:border-gray-700">
              <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">创建时间</span>
              <span className="min-w-0 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap truncate" title={formatDate(transaction.createdAt)}>
                {formatDate(transaction.createdAt)}
              </span>
            </div>

            {transaction.description && (
              <div className="pt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">描述</span>
                </div>
                <p className="text-gray-900 dark:text-white text-sm leading-snug line-clamp-2">
                  {transaction.description}
                </p>
              </div>
            )}
          </div>

          {/* 举报按钮 */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setShowReportModal(true)}
              className="w-full py-2.5 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 text-sm text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-all flex items-center justify-center"
            >
              <AlertTriangle className="w-5 h-5 mr-2" />
              申诉或举报此交易
            </button>
          </div>
        </GlassCard>

        {/* 举报弹窗 */}
        {showReportModal && (
          <ReportModal
            onClose={() => setShowReportModal(false)}
            onSubmit={handleReport}
          />
        )}

        {messageModal.open && (
          <ModalPortal>
            <div className="fixed inset-0 bg-black/30 backdrop-blur-xl backdrop-saturate-150 flex items-center justify-center p-4 z-[200]">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-6 w-full max-w-[92vw] sm:max-w-md"
              >
                <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {messageModal.title}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{messageModal.message}</p>
                <button
                  onClick={() => setMessageModal({ open: false, title: '', message: '' })}
                  className="w-full py-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                >
                  确认
                </button>
              </motion.div>
            </div>
          </ModalPortal>
        )}
      </div>
    </div>
  );
}

// 举报弹窗组件
function ReportModal({
  onClose,
  onSubmit
}: {
  onClose: () => void;
  onSubmit: (type: 'appeal' | 'report', reason: string, description?: string) => void;
}) {
  const [type, setType] = useState<'appeal' | 'report'>('report');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('请输入举报原因');
      return;
    }
    setError('');
    onSubmit(type, reason.trim(), description.trim() || undefined);
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-xl backdrop-saturate-150 flex items-center justify-center p-4 z-[200]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-6 w-full max-w-[92vw] sm:max-w-md"
        >
        <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white mb-3">
          申诉或举报
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              类型
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'appeal' | 'report')}
              className="w-full px-4 py-2.5 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 focus:ring-2 focus:ring-blue-500/20 outline-none"
            >
              <option value="report">举报</option>
              <option value="appeal">申诉</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              原因 *
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="简要说明原因"
              maxLength={100}
              className="w-full px-4 py-2.5 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 focus:ring-2 focus:ring-blue-500/20 outline-none"
            />
            {error && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              详细描述（可选）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="详细描述情况..."
              rows={3}
              maxLength={500}
              className="w-full px-4 py-2.5 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none"
            />
          </div>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-all"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
            >
              提交
            </button>
          </div>
        </form>
        </motion.div>
      </div>
    </ModalPortal>
  );
}
