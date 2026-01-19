/**
 * YourTJ Credit - 玻璃态卡片组件
 * 遵循macOS设计规范的高级玻璃态效果
 */

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className = '', hover = false, onClick }: GlassCardProps) {
  return (
    <motion.div
      className={`
        relative overflow-hidden rounded-2xl
        bg-white/50 dark:bg-[#1e1e1e]/50
        backdrop-blur-3xl backdrop-saturate-150
        border border-black/5 dark:border-white/10
        shadow-macos
        ${hover ? 'cursor-pointer' : ''}
        ${className}
      `}
      whileHover={hover ? { scale: 1.02 } : undefined}
      whileTap={hover ? { scale: 0.98 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      onClick={onClick}
      style={{
        // 添加内部高光效果
        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.4), 0px 0px 1px rgba(0,0,0,0.4), 0px 16px 36px -8px rgba(0,0,0,0.2)'
      }}
    >
      {/* 噪点纹理 */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '200px 200px'
        }}
      />

      {/* 内容 */}
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
}
