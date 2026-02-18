import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://52.55.178.31:8081', // ✅ Your working Remote Backend
        changeOrigin: true,
        secure: false,
      },
    },
  },
})