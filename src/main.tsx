import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

registerSW({
  immediate: true,
  onRegisteredSW(url) {
    console.log('SW registered at', url);
  },
  onRegisterError(err) {
    console.error('SW register failed', err);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
