import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',   // IMPORTANT for CloudFront
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://api.meetthemasters.in',
        changeOrigin: true,
        secure: true,
      },
      '/uploads': {
        target: 'https://api.meetthemasters.in',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})