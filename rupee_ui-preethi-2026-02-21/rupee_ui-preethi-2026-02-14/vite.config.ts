import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// ── Your actual Spring Boot backend ──
const SPRING_BACKEND = 'http://52.55.178.31:8081'

export default defineConfig({
  base: '/rupee_ui/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: SPRING_BACKEND,
        changeOrigin: true,
      },
      '/uploads': {
        target: SPRING_BACKEND,
        changeOrigin: true,
      },
    },
  },
})