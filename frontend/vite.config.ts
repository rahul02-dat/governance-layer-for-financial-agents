import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import dns from 'dns'

dns.setDefaultResultOrder('ipv4first')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://backend:8000',
    }
  }
})
