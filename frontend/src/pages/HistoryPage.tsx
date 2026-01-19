/**
 * YourTJ Credit - 交易流水页面
 * 显示用户的所有交易记录
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, RefreshCw, Filter, Ticket } from 'lucide-react';
import { getTransactionHistory, redeemCode } from '../services/api';
import { loadWallet } from '../utils/wallet-storage';
import { createSignedRequest } from '../shared/utils/transaction-verification';
import { motion } from 'framer-motion';
import { ModalPortal } from '../components/ModalPortal';
import type { Transaction } from '@shared/types';

type FilterType = 'all' | 'income' | 'expense';

export function HistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemText, setRedeemText] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemError, setRedeemError] = useState('');

  useEffect(() => {
    loadData();
  }, [page]);

  async function loadData() {
    try {
      const localWallet = loadWallet();
      if (!localWallet) {
        console.error('No wallet found');
        setLoading(false);
        return;
      }

      setLoading(true);
      const result = await getTransactionHistory(localWallet.userHash, page, 20);

      if (page === 1) {
        setTransactions(result.data);
      } else {
        setTransactions(prev => [...prev, ...result.data]);
      }

      setHasMore(result.page < result.totalPages);
    } catch (err) {
      console.error('Load transactions error:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleRefresh() {
    setPage(1);
    setTransactions([]);
    loadData();
  }

  async function handleRedeem(code: string) {
    const wallet = loadWallet();
    if (!wallet) return;
    setRedeemError('');
    try {
      setRedeemBusy(true);
      const { payload, headers } = await createSignedRequest({ code }, wallet.userHash, wallet.userSecret);
      await redeemCode(payload.code, headers);
      setRedeemOpen(false);
      setRedeemText('');
      handleRefresh();
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : '兑换失败');
    } finally {
      setRedeemBusy(false);
    }
  }

  function handleLoadMore() {
    if (!loading && hasMore) {
      setPage(prev => prev + 1);
    }
  }

  // 根据筛选条件过滤交易
  const filteredTransactions = transactions.filter(tx => {
    const wallet = loadWallet();
    if (!wallet) return false;

    const isIncome = tx.toUserHash === wallet.userHash;
    const isExpense = tx.fromUserHash === wallet.userHash;

    if (filter === 'income') return isIncome;
    if (filter === 'expense') return isExpense;
    return true;
  });

  if (loading && transactions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col animate-in fade-in duration-500 -mx-4 -my-4 md:-mx-6 md:-my-6 pb-20 md:pb-0">

      {/* 顶部工具栏 */}
      <div className="sticky top-0 z-20 bg-white/80 dark:bg-[#1e1e1e]/80 backdrop-blur-xl border-b border-black/10 dark:border-white/10">
        <div className="px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">交易流水</h2>

            <div className="flex items-center gap-2">
              {/* 筛选按钮 */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                    filter === 'all'
                      ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  全部
                </button>
                <button
                  onClick={() => setFilter('income')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                    filter === 'income'
                      ? 'bg-white dark:bg-white/10 text-green-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  收入
                </button>
                <button
                  onClick={() => setFilter('expense')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                    filter === 'expense'
                      ? 'bg-white dark:bg-white/10 text-red-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  支出
                </button>
              </div>

              {/* 刷新按钮 */}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={16} className={`text-slate-600 dark:text-slate-400 ${loading ? 'animate-spin' : ''}`} />
              </button>

              {/* 兑换码 */}
              <button
                onClick={() => setRedeemOpen(true)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                aria-label="兑换码"
              >
                <Ticket size={16} className="text-slate-600 dark:text-slate-400" />
              </button>
            </div>
          </div>
        </div>

      {/* Finder 风格表头 */}
      <div className="grid grid-cols-12 gap-4 px-4 md:px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-t border-black/5 dark:border-white/5">
        <div className="col-span-3 md:col-span-2">时间</div>
        <div className="col-span-6 md:col-span-7">描述</div>
        <div className="col-span-3 md:col-span-3 text-right">金额</div>
      </div>
      </div>

      {/* 交易列表 */}
      <div className="flex-1 pt-4 md:pt-5">
        {filteredTransactions.length === 0 ? (
          <div className="py-20 text-center">
            <Filter size={48} className="mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400">暂无交易记录</p>
          </div>
        ) : (
          <>
            {filteredTransactions.map((tx, idx) => (
              <TransactionRow key={tx.txId} tx={tx} idx={idx} />
            ))}

            {/* 加载更多 */}
            {hasMore && (
              <div className="py-4 text-center border-t border-black/5 dark:border-white/5">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
                >
                  {loading ? '加载中...' : '加载更多'}
                </button>
              </div>
            )}

            {/* 归档提示 */}
            {!hasMore && (
              <div className="py-8 text-center border-t border-black/5 dark:border-white/5">
                <p className="text-xs text-gray-400">30天前的记录已自动归档</p>
              </div>
            )}
          </>
        )}
      </div>

      {redeemOpen && (
        <RedeemModal
          value={redeemText}
          busy={redeemBusy}
          error={redeemError}
          onClose={() => {
            if (redeemBusy) return;
            setRedeemOpen(false);
            setRedeemError('');
          }}
          onChange={setRedeemText}
          onSubmit={(code) => void handleRedeem(code)}
        />
      )}
    </div>
  );
}

interface TransactionRowProps {
  tx: Transaction;
  idx: number;
}

function TransactionRow({ tx, idx }: TransactionRowProps) {
  const navigate = useNavigate();
  const wallet = loadWallet();
  if (!wallet) return null;

  const isCancelled = tx.status === 'cancelled';
  const isIncome = !isCancelled && tx.toUserHash === wallet.userHash;
  // 支出/收入的图标与金额在渲染时按 isIncome 判定即可

  // 格式化时间
  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    }
  }

  return (
    <div className={`
      group grid grid-cols-12 gap-4 px-4 md:px-6 py-3 items-center
      border-b border-black/5 dark:border-white/5 text-sm
      hover:bg-blue-500/10 transition-colors duration-100 cursor-pointer
      ${idx % 2 === 0 ? 'bg-black/[0.02] dark:bg-white/[0.02]' : 'bg-transparent'}
    `}
    onClick={() => navigate(`/dashboard/transaction/${tx.txId}`)}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') navigate(`/dashboard/transaction/${tx.txId}`);
    }}
    >
      {/* 时间 */}
      <div className="col-span-3 md:col-span-2 font-mono text-xs text-slate-500">
        {formatTime(tx.createdAt)}
      </div>

      {/* 描述 */}
      <div className="col-span-6 md:col-span-7 flex items-center gap-3">
        <div className={`
          w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
          ${isCancelled
            ? 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400'
            : isIncome
              ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}
        `}>
          {isCancelled ? <Minus size={12} /> : isIncome ? <Plus size={12} /> : <Minus size={12} />}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-slate-800 dark:text-slate-200 truncate pr-4">
            {tx.title}
          </div>
          <div className="text-[10px] text-slate-400 font-mono hidden md:block">
            {tx.typeDisplayName} · Ref: {tx.txId.slice(0, 8)}...{isCancelled ? ' · 已取消' : ''}
          </div>
        </div>
      </div>

      {/* 金额 */}
      <div className={`col-span-3 md:col-span-3 text-right font-mono font-bold ${
        isCancelled
          ? 'text-slate-500 dark:text-slate-400'
          : isIncome
            ? 'text-green-600 dark:text-green-400'
            : 'text-slate-900 dark:text-slate-200'
      }`}>
        {isCancelled ? '0' : `${isIncome ? '+' : '-'}${Math.abs(tx.amount)}`}{' '}
        <span className="text-xs font-normal text-slate-400">小济元</span>
      </div>
    </div>
  );
}

function RedeemModal({
  value,
  busy,
  error,
  onClose,
  onChange,
  onSubmit
}: {
  value: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onChange: (v: string) => void;
  onSubmit: (code: string) => void;
}) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const code = value.trim();
    if (!code) return;
    onSubmit(code);
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-xl backdrop-saturate-150 flex items-center justify-center p-4 z-[200]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-4 md:p-6 w-full max-w-[92vw] sm:max-w-md shadow-2xl"
        >
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">兑换码</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
            placeholder="输入兑换码"
            autoFocus
          />
          {error && <div className="text-xs text-rose-600 dark:text-rose-300">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={busy || !value.trim()}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50"
            >
              {busy ? '兑换中…' : '兑换'}
            </button>
          </div>
        </form>
        </motion.div>
      </div>
    </ModalPortal>
  );
}
