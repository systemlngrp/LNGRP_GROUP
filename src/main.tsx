import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from "./auth/AuthContext";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </StrictMode>
  </AppErrorBoundary>,
);
