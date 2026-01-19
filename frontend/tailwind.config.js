/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // macOS System Colors
        'macos-blue': '#007AFF',
        'macos-gray': {
          50: '#F5F5F7',
          100: '#E8E8ED',
          200: '#D2D2D7',
          300: '#B7B7BD',
          400: '#8E8E93',
          500: '#636366',
          600: '#48484A',
          700: '#3A3A3C',
          800: '#2C2C2E',
          900: '#1C1C1E',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'sans-serif'],
      },
      backdropBlur: {
        'xs': '2px',
        'xl': '20px',
        '2xl': '40px',
        '3xl': '64px',
      },
      boxShadow: {
        'macos': '0px 0px 1px rgba(0,0,0,0.4), 0px 16px 36px -8px rgba(0,0,0,0.2)',
        'macos-sm': '0px 0px 1px rgba(0,0,0,0.3), 0px 4px 12px -2px rgba(0,0,0,0.15)',
        'inner-highlight': 'inset 0 1px 0 0 rgba(255,255,255,0.4)',
      },
      animation: {
        'spring': 'spring 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        spring: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
