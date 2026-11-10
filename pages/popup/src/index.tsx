import '@src/index.css';
import Popup from '@src/Popup';
import { createRoot } from 'react-dom/client';

// Apply the saved theme before React renders, so the popup doesn't flash the wrong colors.
// localStorage mirrors chrome.storage.local.theme because it can be read synchronously.
try {
  const theme = localStorage.getItem('ht-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // storage unavailable: fall back to the system theme
}

const init = () => {
  const appContainer = document.querySelector('#app-container');
  if (!appContainer) {
    throw new Error('Can not find #app-container');
  }
  const root = createRoot(appContainer);

  root.render(<Popup />);
};

init();
