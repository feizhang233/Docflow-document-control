import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true, configure: (proxy) => { proxy.on('proxyRes', (proxyRes) => { const cookies = proxyRes.headers['set-cookie']; if (cookies) proxyRes.headers['set-cookie'] = cookies.map((cookie) => cookie.replace(/;\s*Secure/i, '')) }) } } },
  },
})
