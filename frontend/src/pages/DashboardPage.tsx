/**
 * YourTJ Credit - 仪表板页面
 * 显示钱包余额、快捷操作和近期走势
 */

import { useState, useEffect, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, QrCode, RefreshCw, ArrowUpRight, ChevronRight, TrendingUp } from 'lucide-react';
import { WalletCard } from '../components/WalletCard';
import { loadWallet } from '../utils/wallet-storage';
import { getWallet, getTransactionHistory } from '../services/api';
import type { Wallet as WalletType, Transaction } from '@shared/types';

interface TrendChartProps {
  data: number[];
}

const TrendChart: FC<TrendChartProps> = ({ data }) => {
  const min = Math.min(...data);
  const max = Math.max(...data);

  // Normalize data to 0-1 range for plotting
  const normalize = (v: number) => (v - min) / (max - min || 1);

  // Calculate points for both SVG and Labels
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    // Map value to 20%-80% of height to leave breathing room
    const y = 100 - (normalize(v) * 60 + 20);
    return { x, y, value: v };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
  const areaPoints = `0,100 ${polylinePoints} 100,100`;
  const lastPoint = points[points.length - 1];

  return (
    <div className="w-full h-32 md:h-40 relative">
      {/* Data Labels (HTML Overlay for crisp text) */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {points.map((p, i) => (
          <div
            key={i}
            className="absolute transform -translate-x-1/2 -translate-y-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              marginTop: '-8px'
            }}
          >
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-white/60 dark:bg-black/60 px-1.5 py-0.5 rounded-full backdrop-blur-[2px] shadow-sm">
              {p.value}
            </span>
          </div>
        ))}
      </div>

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Area Fill */}
        <polygon points={areaPoints} fill="url(#chartGradient)" className="transition-all duration-500 ease-in-out" />

        {/* Line Stroke */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="drop-shadow-sm"
        />

        {/* Pulse Dot at the end */}
        <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill="#3B82F6" vectorEffect="non-scaling-stroke" className="animate-pulse">
          <animate attributeName="r" values="3;6;3" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx={lastPoint.x} cy={lastPoint.y} r="1.5" fill="white" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
};

export function DashboardPage() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<number[]>([]);
  const [balanceChange, setBalanceChange] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const localWallet = loadWallet();
      if (!localWallet) {
        navigate('/');
        return;
      }

      // 加载钱包信息
      const walletData = await getWallet(localWallet.userHash);
      setWallet(walletData);

      // 加载交易历史并计算7天走势
      try {
        const transactions = await getTransactionHistory(localWallet.userHash, 1, 100);
        const trendData = calculateTrendData(transactions.data, walletData.balance, localWallet.userHash);
        setChartData(trendData.balances);
        setBalanceChange(trendData.change);
      } catch (err) {
        console.error('Load transactions error:', err);
        // 如果加载失败，使用当前余额作为默认数据
        setChartData([walletData.balance]);
        setBalanceChange(0);
      }
    } catch (err) {
      console.error('Load data error:', err);
    } finally {
      setLoading(false);
    }
  }

  // 计算7天走势数据
  function calculateTrendData(transactions: Transaction[], currentBalance: number, userHash: string) {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // 过滤最近7天的交易
    const recentTransactions = transactions
      .filter(tx => tx.createdAt >= sevenDaysAgo)
      .sort((a, b) => a.createdAt - b.createdAt);

    if (recentTransactions.length === 0) {
      // 没有交易记录，返回当前余额
      return {
        balances: [currentBalance],
        change: 0
      };
    }

    // 计算每天的余额
    const balances: number[] = [];
    let balance = currentBalance;

    // 从最新的交易开始，倒推计算每天的余额
    for (let i = recentTransactions.length - 1; i >= 0; i--) {
      const tx = recentTransactions[i];
      const isIncome = tx.toUserHash === userHash;
      const isExpense = tx.fromUserHash === userHash;

      if (isIncome) {
        balance -= tx.amount; // 倒推，收入要减去
      } else if (isExpense) {
        balance += tx.amount; // 倒推，支出要加上
      }
    }

    // 现在 balance 是7天前的余额
    const startBalance = balance;

    // 正向计算每天的余额
    balances.push(startBalance);
    balance = startBalance;

    for (const tx of recentTransactions) {
      const isIncome = tx.toUserHash === userHash;
      const isExpense = tx.fromUserHash === userHash;

      if (isIncome) {
        balance += tx.amount;
      } else if (isExpense) {
        balance -= tx.amount;
      }

      balances.push(balance);
    }

    // 如果数据点少于7个，补充到7个
    while (balances.length < 7) {
      balances.push(currentBalance);
    }

    // 如果数据点多于7个，取最后7个
    const finalBalances = balances.slice(-7);

    return {
      balances: finalBalances,
      change: currentBalance - startBalance
    };
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

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 md:pb-0">

      {/* 1. The Asset Card */}
      <section className="relative z-10">
        <WalletCard balance={wallet.balance} studentId={wallet.userHash.substring(0, 8)} />
      </section>

      {/* 2. Quick Actions */}
      <section className="flex justify-around px-2 md:px-4">
        {[
          { icon: Send, label: '转账', color: 'bg-blue-500', path: '/dashboard/transfer' },
          { icon: QrCode, label: '收款', color: 'bg-indigo-500', path: '/dashboard/qrcode' },
          { icon: RefreshCw, label: '同步', color: 'bg-slate-600', action: () => loadData() },
          { icon: ArrowUpRight, label: '广场', color: 'bg-emerald-500', path: '/dashboard/marketplace' },
        ].map((action, idx) => (
          <button
            key={idx}
            onClick={() => action.path ? navigate(action.path) : action.action?.()}
            className="flex flex-col items-center gap-3 group active:scale-95 transition-transform"
          >
            <div className={`
              w-12 h-12 md:w-14 md:h-14 rounded-2xl ${action.color} text-white shadow-lg shadow-blue-500/20
              flex items-center justify-center transition-all duration-300
              group-hover:scale-105 group-hover:shadow-xl group-hover:rotate-3
            `}>
              <action.icon size={22} />
            </div>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {action.label}
            </span>
          </button>
        ))}
      </section>

      {/* 3. Activity Trend Chart (Clickable) */}
      <section>
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-500" />
            <span>近期走势</span>
          </h3>
        </div>

        <div
          onClick={() => navigate('/dashboard/history')}
          className="
            group relative cursor-pointer overflow-hidden
            bg-white/50 dark:bg-[#1c1c1e]/50
            backdrop-blur-xl border border-white/20 dark:border-white/5
            rounded-2xl p-5
            transition-all duration-300
            hover:bg-white/70 dark:hover:bg-[#1c1c1e]/70
            hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]
            active:scale-[0.99]
          "
        >
          {/* Header within card */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider">7天走势</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {balanceChange >= 0 ? '+' : ''}{balanceChange} <span className="text-sm font-normal text-slate-400">小济元</span>
              </div>
            </div>

            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300">
              <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {/* Chart Graphic */}
          <TrendChart data={chartData.length > 0 ? chartData : [wallet.balance]} />

          {/* Bottom Note */}
          <div className="absolute bottom-5 right-5 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            点击查看详细流水
          </div>
        </div>
      </section>
    </div>
  );
}
