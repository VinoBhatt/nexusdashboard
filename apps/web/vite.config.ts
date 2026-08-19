import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // apps/api runs via `wrangler dev` on 8787 during local development
      "/api": "http://localhost:8787",
    },
  },
})
