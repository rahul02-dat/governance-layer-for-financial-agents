import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import axios from 'axios'

// Removed baseURL so it uses Vite proxy

const initApp = async () => {
  try {
    const res = await axios.get('/api/dev/token');
    const token = res.data.token;
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } catch (err) {
    console.error("Failed to load dev token", err);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

initApp();
