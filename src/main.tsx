import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

registerSW({
  immediate: true,
  onRegisterError(err) {
    console.error('SW register failed', err);
  },
});

// 申请持久化存储：把沙箱从「尽力保留」升为「承诺不驱逐」，磁盘紧张时浏览器不得自动清掉数据。
// 不弹窗、可能被拒（取决于浏览器启发式）；备份页会显示当前状态。
navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
