import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/context/AuthProvider';
import { ModeProvider } from '@/context/ModeProvider';
import { App } from '@/App';
import '@/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ModeProvider>
        <App />
      </ModeProvider>
    </AuthProvider>
  </StrictMode>,
);
