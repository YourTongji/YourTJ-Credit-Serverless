import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared')
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api/task': {
        target: process.env.VITE_API_MARKET_URL || process.env.VITE_API_URL || 'http://localhost:3002',
        changeOrigin: true
      },
      '/api/product': {
        target: process.env.VITE_API_MARKET_URL || process.env.VITE_API_URL || 'http://localhost:3002',
        changeOrigin: true
      },
      '/api/report': {
        target: process.env.VITE_API_MARKET_URL || process.env.VITE_API_URL || 'http://localhost:3002',
        changeOrigin: true
      },
      '/api/admin': {
        target: process.env.VITE_API_MARKET_URL || process.env.VITE_API_URL || 'http://localhost:3002',
        changeOrigin: true
      },
      '/api': {
        target:
          process.env.VITE_API_CORE_URL || process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
