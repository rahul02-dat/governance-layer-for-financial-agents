import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initializeAuth } from './api/client';

const initApp = async () => {
  // Initialize development token if in dev mode
  await initializeAuth();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
};

initApp();
