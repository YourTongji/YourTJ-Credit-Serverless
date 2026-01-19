/**
 * WalletCard 组件
 * 3D 交互式钱包卡片，显示余额和学号信息
 */

import { useRef, useState, type FC, type MouseEvent } from 'react';
import { BrandLogo } from './BrandLogo';

interface WalletCardProps {
  balance: number;
  studentId: string;
}

export const WalletCard: FC<WalletCardProps> = ({ balance, studentId }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;

    setRotation({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setRotation({ x: 0, y: 0 });
  };

  return (
    <div
      className="perspective-1000 w-full h-56 cursor-pointer group"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={cardRef}
        className="relative w-full h-full rounded-[24px] shadow-2xl border border-white/10 overflow-hidden transition-all duration-300 ease-out bg-[#111]"
        style={{
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) scale(${rotation.x ? 1.02 : 1})`,
          transformStyle: 'preserve-3d',
          boxShadow: `${-rotation.y * 2}px ${rotation.x * 2}px 30px rgba(0,0,0,0.4)`
        }}
      >
        {/* Abstract Background Mesh */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1c1c1e] via-[#000] to-[#111]" />

        {/* Geometric Texture Layer */}
        <div
          className="absolute inset-0 opacity-35 pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: [
              'repeating-linear-gradient(135deg, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0.10) 1px, rgba(255,255,255,0.00) 1px, rgba(255,255,255,0.00) 14px)',
              'repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, rgba(255,255,255,0.00) 1px, rgba(255,255,255,0.00) 18px)',
              'radial-gradient(circle at 22% 28%, rgba(255,255,255,0.20) 0px, rgba(255,255,255,0.20) 1px, rgba(255,255,255,0.00) 2px)',
              'radial-gradient(circle at 78% 62%, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 1px, rgba(255,255,255,0.00) 2px)',
              'radial-gradient(circle at 65% 22%, rgba(255,255,255,0.14) 0px, rgba(255,255,255,0.14) 1px, rgba(255,255,255,0.00) 2px)'
            ].join(', '),
            filter: 'blur(0.2px)'
          }}
        />

        {/* Holographic Sheen Layer */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none mix-blend-overlay"
          style={{
            background: 'linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.4) 25%, transparent 30%, transparent 70%, rgba(255,255,255,0.4) 75%, transparent 80%)',
            transform: `translateX(${(rotation.y * 2)}%) translateY(${(rotation.x * 2)}%)`,
            filter: 'blur(5px)'
          }}
        />

        {/* Content Layer */}
        <div className="relative z-10 p-7 flex flex-col justify-between h-full text-white">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2 opacity-90">
              <BrandLogo className="w-8 h-8 text-white" variant="white" />
              <span className="font-semibold text-sm tracking-widest uppercase opacity-80 font-sans">学生卡</span>
            </div>
            {/* Contactless Icon */}
            <svg className="w-6 h-6 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-1.12-2.5-2.5-2.5S6 10.62 6 12s1.12 2.5 2.5 2.5zM15.5 14.5A2.5 2.5 0 0018 12c0-1.38-1.12-2.5-2.5-2.5s-2.5 1.12-2.5 2.5 1.12 2.5 2.5 2.5zM12 20a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/40 font-mono uppercase tracking-wider">余额</span>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white drop-shadow-lg">
              {balance.toLocaleString()}
              <span className="text-base md:text-lg font-normal text-white/50 ml-2">小济元</span>
            </h1>
          </div>

          <div className="flex justify-between items-end border-t border-white/10 pt-4">
            <div className="flex flex-col">
              <span className="text-[9px] text-gray-400 font-mono uppercase tracking-wider mb-0.5">学号</span>
              <div className="font-mono text-base tracking-widest text-white/90">
                {studentId.replace(/(\d{4})\d+(\d{2})/, "$1 •••• $2")}
              </div>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-[9px] text-gray-400 font-mono uppercase tracking-wider mb-0.5">有效期</span>
              <span className="font-mono text-sm text-white/80">长期有效</span>
            </div>
          </div>
        </div>

        {/* Dynamic Glare */}
        <div
          className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent z-20 pointer-events-none"
          style={{ transform: `translate(${rotation.y * 5}px, ${rotation.x * 5}px)` }}
        />
      </div>
    </div>
  );
};
