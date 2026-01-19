/**
 * WalletContainer 组件
 * 提供统一的容器样式，带有玻璃态效果和边框高光
 */

import type { FC, ReactNode } from 'react';

interface WalletContainerProps {
  children: ReactNode;
  className?: string;
}

export const WalletContainer: FC<WalletContainerProps> = ({
  children,
  className = ''
}) => {
  return (
    <div className={`
      relative overflow-hidden
      bg-white/80 dark:bg-[#1e1e1e]/80
      backdrop-blur-3xl saturate-150
      border border-white/20 dark:border-white/10
      md:shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_20px_40px_-12px_rgba(0,0,0,0.1)]
      rounded-2xl min-h-0 md:min-h-[600px]
      ${className}
    `}>
      {/* Top Bezel Highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-white/40 pointer-events-none" />
      {children}
    </div>
  );
};
