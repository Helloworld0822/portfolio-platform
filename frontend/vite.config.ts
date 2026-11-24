import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, process.cwd(), 'PORTFOLIO_').PORTFOLIO_API_ORIGIN || 'http://127.0.0.1:8080'
  return {
    base: '/',
    plugins: [react(), tailwindcss()],
    server: { proxy: { '/api': target, '/uploads': target } },
  }
})
