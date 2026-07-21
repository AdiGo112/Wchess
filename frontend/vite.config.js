import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = process.env.VITE_PROXY_TARGET || 'http://localhost:3100'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy REST + WebSocket to the backend so the whole app is served from a
    // SINGLE origin. This means: no CORS in local dev, and a remote demo needs
    // just ONE tunnel (e.g. `cloudflared tunnel --url http://localhost:5173`)
    // instead of two. Set VITE_SERVER_URL to an absolute origin to bypass the
    // proxy and talk to the backend directly instead.
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/socket.io': { target: BACKEND, ws: true, changeOrigin: true },
    },
    // Accept the random hostname a tunnel assigns (e.g. *.trycloudflare.com).
    allowedHosts: true,
  },
})
