import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const SPRING_BACKEND = 'http://35.154.251.25:8080'

export default defineConfig(({ command }) => ({
  base: './',   // 
  plugins: [react()],
  define: {
    __API_BASE__: command === 'build'
      ? JSON.stringify(`${SPRING_BACKEND}/api`)
      : JSON.stringify('/api'),
  },
  server: {
    proxy: {
      '/api': { target: SPRING_BACKEND, changeOrigin: true },
      '/uploads': { target: SPRING_BACKEND, changeOrigin: true },
    },
  },
}))