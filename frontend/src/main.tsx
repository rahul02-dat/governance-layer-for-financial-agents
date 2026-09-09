import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import axios from 'axios'

// Removed baseURL so it uses Vite proxy

const initApp = async () => {
  const storedToken = localStorage.getItem('token');
  if (storedToken) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
  } else {
    try {
      const res = await axios.get('/api/dev/token');
      const token = res.data?.token;
      if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
    } catch {
      // In production/staging, /api/dev/token is disabled (HTTP 404).
      // Authentication must be provided via stored token or credentials.
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

initApp();
