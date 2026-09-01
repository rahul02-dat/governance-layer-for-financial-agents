import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import dns from 'dns'

dns.setDefaultResultOrder('ipv4first')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/agents': 'http://backend:8000',
      '/policies': 'http://backend:8000',
      '/budgets': 'http://backend:8000',
      '/fleet': 'http://backend:8000',
      '/authorize': 'http://backend:8000',
      '/audit-events': 'http://backend:8000',
      '/analytics': 'http://backend:8000',
      '/approvals': 'http://backend:8000',
    }
  }
})
