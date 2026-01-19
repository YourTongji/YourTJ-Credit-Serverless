/**
 * Layout 组件
 * 提供应用的主布局，包括侧边栏导航、顶部栏和底部导航
 */

import type { FC } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Wallet, ShoppingBag, Clock, Shield, LogOut } from 'lucide-react';
import { WalletContainer } from './WalletContainer';
import { BrandLogo } from './BrandLogo';

interface LayoutProps {
  onLogout: () => void;
}

export const Layout: FC<LayoutProps> = ({ onLogout }) => {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', icon: Wallet, label: '概览', end: true },
    { path: '/dashboard/marketplace', icon: ShoppingBag, label: '广场' },
    { path: '/dashboard/history', icon: Clock, label: '流水' },
    { path: '/dashboard/qrcode', icon: Shield, label: '安全' },
  ];

  const getPageTitle = () => {
    if (location.pathname === '/dashboard') return 'Wallet';
    if (location.pathname.includes('marketplace')) return 'Marketplace';
    if (location.pathname.includes('history')) return 'History';
    if (location.pathname.includes('qrcode')) return 'Security';
    if (location.pathname.includes('transfer')) return 'Transfer';
    return 'Wallet';
  };

  return (
    <div className="min-h-screen bg-[#f2f2f7] dark:bg-black md:p-8 flex items-center justify-center">
      <div className="w-full max-w-6xl flex flex-col md:flex-row gap-6 h-screen md:h-[85vh]">

        {/* Desktop Sidebar Navigation */}
        <nav className="hidden md:flex w-64 flex-shrink-0 flex-col justify-between">
          <div className="space-y-6">
            <div className="px-4 py-3 flex items-center gap-3">
              <BrandLogo className="w-10 h-10" />
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                YourTJ
              </h1>
            </div>

            <div className="space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
                    ${isActive
                      ? 'bg-white shadow-sm text-blue-600 dark:bg-white/10 dark:text-white'
                      : 'text-slate-500 hover:bg-black/5 dark:hover:bg-white/5 dark:text-slate-400'}
                  `}
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>

          <div className="px-4">
            <button
              onClick={onLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 w-full transition-colors"
            >
              <LogOut size={18} />
              退出登录
            </button>
          </div>
        </nav>

        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between px-6 pt-12 pb-2 bg-transparent z-20">
          <div className="flex items-center gap-3">
            <BrandLogo className="w-8 h-8" />
            <span className="text-lg font-bold text-slate-900 dark:text-white">YourTJ</span>
          </div>
          <button onClick={onLogout} className="p-2 bg-white/50 dark:bg-white/10 rounded-full backdrop-blur-md">
            <LogOut size={18} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 h-full relative flex flex-col pb-[80px] md:pb-0">
          <WalletContainer className="h-full flex flex-col p-0 border-none md:border md:border-white/50 shadow-none md:shadow-xl rounded-t-3xl md:rounded-2xl bg-white/90 md:bg-white/80 dark:bg-[#1c1c1e] md:dark:bg-[#1e1e1e]/80">
            {/* Desktop Header */}
            <div className="hidden md:flex h-16 items-center px-6 border-b border-black/5 dark:border-white/5 flex-shrink-0 bg-white/40 dark:bg-black/20 backdrop-blur-md sticky top-0 z-20">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{getPageTitle()}</h2>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 scroll-smooth scrollbar-hide">
              <Outlet />
            </div>
          </WalletContainer>
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <div className="md:hidden fixed bottom-0 inset-x-0 h-[80px] bg-white/90 dark:bg-[#161616]/90 backdrop-blur-xl border-t border-black/5 dark:border-white/5 z-50 flex items-center justify-around pb-4 px-2 safe-area-bottom">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => `
                flex flex-col items-center justify-center gap-1 w-16 h-14 rounded-xl transition-all duration-200 active:scale-90
                ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}
              `}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

      </div>
    </div>
  );
};
