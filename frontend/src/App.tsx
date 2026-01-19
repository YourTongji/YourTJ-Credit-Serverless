/**
 * YourTJ Credit - 主应用组件
 * 配置路由和全局状态
 */

import { useState, createContext, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthScreen } from './components/AuthScreen';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { MarketplacePage } from './pages/MarketplacePage';
import { HistoryPage } from './pages/HistoryPage';
import { QRCodePage } from './pages/QRCodePage';
import { TransferPage } from './pages/TransferPage';
import { AdminPage } from './pages/AdminPage';
import { TransactionDetailPage } from './pages/TransactionDetailPage';
import { saveWallet, loadWallet, clearWallet } from './utils/wallet-storage';
import { generateWallet } from '@shared/utils/wallet';
import { getWordlist } from './services/wordlistService';

interface UserProfile {
  studentId: string;
  balance: number;
  hasWallet: boolean;
}

interface WalletState {
  isUnlocked: boolean;
  profile: UserProfile | null;
  login: (studentId: string, pin: string) => Promise<void>;
  logout: () => void;
}

export const WalletContext = createContext<WalletState>({
  isUnlocked: false,
  profile: null,
  login: async () => {},
  logout: () => {},
});

function App() {
  const sessionVersionRef = useRef(0);

  const [isUnlocked, setIsUnlocked] = useState(() => Boolean(loadWallet()));
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const savedWallet = loadWallet();
    if (!savedWallet) return null;
    const savedStudentId = localStorage.getItem('studentId') || '';
    return {
      studentId: savedStudentId,
      balance: 0,
      hasWallet: true
    };
  });

  // Check if session exists
  useEffect(() => {
    async function checkSession() {
      const savedWallet = loadWallet();

      if (!savedWallet) return;

      const myVersion = sessionVersionRef.current;

      // 先用本地缓存做到“无感进入”，余额异步刷新
      setIsUnlocked(true);
      setProfile((prev) => {
        const savedStudentId = localStorage.getItem('studentId') || '';
        return prev || { studentId: savedStudentId, balance: 0, hasWallet: true };
      });

      const { getWallet } = await import('./services/api');
      try {
        const wallet = await getWallet(savedWallet.userHash);
        if (myVersion !== sessionVersionRef.current) return; // 退出/重新登录后不回写
        setProfile({
          studentId: localStorage.getItem('studentId') || '',
          balance: wallet.balance,
          hasWallet: true
        });
      } catch (err) {
        if (myVersion !== sessionVersionRef.current) return;
        console.error('Auto login failed:', err);
        // 如果自动登录失败，清除本地数据并回到登录页
        clearWallet();
        localStorage.removeItem('studentId');
        setIsUnlocked(false);
        setProfile(null);
      }
    }

    checkSession();
  }, []);

  const login = async (studentId: string, pin: string) => {
    sessionVersionRef.current += 1;
    // 1. 获取词库并在本地生成钱包（所有计算在浏览器完成）
    const wordlist = await getWordlist();
    const keys = await generateWallet(studentId, pin, wordlist);

    // 2. Register or get wallet from backend
    const { registerWallet } = await import('./services/api');
    const wallet = await registerWallet(keys.userHash, { userSecret: keys.userSecret });

    // 3. Set State
    setProfile({
      studentId,
      balance: wallet.balance,
      hasWallet: true
    });
    setIsUnlocked(true);

    // 4. Persist wallet info and studentId
    saveWallet({
      mnemonic: keys.mnemonic,
      userHash: keys.userHash,
      userSecret: keys.userSecret,
    });

    // 保存学号到 localStorage（用于 PIN 验证）
    localStorage.setItem('studentId', studentId);
  };

  const logout = () => {
    sessionVersionRef.current += 1;
    setIsUnlocked(false);
    setProfile(null);
    clearWallet();
    // 清除学号信息
    localStorage.removeItem('studentId');
  };

  return (
    <WalletContext.Provider value={{ isUnlocked, profile, login, logout }}>
      <HashRouter>
        <Routes>
          {/* Public / Auth Route */}
          <Route
            path="/"
            element={!isUnlocked ? <AuthScreen onLogin={login} /> : <Navigate to="/dashboard" replace />}
          />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={isUnlocked ? <Layout onLogout={logout} /> : <Navigate to="/" replace />}
          >
            <Route index element={<DashboardPage />} />
            <Route path="marketplace" element={<MarketplacePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="transaction/:txId" element={<TransactionDetailPage />} />
            <Route path="qrcode" element={<QRCodePage />} />
            <Route path="transfer" element={<TransferPage />} />
          </Route>

          {/* Admin Route */}
          <Route path="/admin" element={<AdminPage />} />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </WalletContext.Provider>
  );
}

export default App;
