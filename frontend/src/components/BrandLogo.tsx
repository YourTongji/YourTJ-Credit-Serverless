import type { FC } from 'react';

interface BrandLogoProps {
  className?: string;
  variant?: 'color' | 'white' | 'monochrome';
}

export const BrandLogo: FC<BrandLogoProps> = ({ className = "w-10 h-10", variant = 'color' }) => {
  return (
    <div className={`${className} relative flex items-center justify-center transition-transform active:scale-95`}>
      <img
        src="/favicon.svg"
        alt="YourTJ Logo"
        className={`
          w-full h-full object-contain drop-shadow-md filter
          ${variant === 'white' ? 'brightness-0 invert' : ''}
          ${variant === 'monochrome' ? 'grayscale' : ''}
        `}
      />
    </div>
  );
};
