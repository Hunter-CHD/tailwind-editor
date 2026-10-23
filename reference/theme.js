import {
  themes
} from '../config/editor.js';

// Read only the saved appearance. Do not initialize or migrate a workspace here.
function savedSettings() {
  return new Promise((resolve) => {
    const request = indexedDB.open('tailwind-editor');
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      if (!database.objectStoreNames.contains('workspaces')) {
        database.close();
        resolve(null);
        return;
      }
      const transaction = database.transaction('workspaces', 'readonly');
      const record = transaction.objectStore('workspaces').get('workspace');
      transaction.oncomplete = () => {
        database.close();
        resolve(record.result?.settings || null);
      };
      transaction.onabort = () => {
        database.close();
        resolve(null);
      };
    };
  });
}

async function refreshTheme() {
  try {
    const settings = await savedSettings();
    const theme = themes[settings?.theme] || settings?.customTheme || themes.light;
    const keys = ['background', 'surface', 'text', 'accent'];
    if (!keys.every((key) => /^#[0-9a-f]{6}$/i.test(theme[key]))) return;
    const brightness = (color) => {
      const [red, green, blue] = color.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16));
      return red * 0.299 + green * 0.587 + blue * 0.114;
    };
    for (const key of keys) document.documentElement.style.setProperty(`--${key}`, theme[key]);
    document.documentElement.style.setProperty(
      '--accent-text',
      brightness(theme.accent) > 160 ? '#17212b' : '#ffffff',
    );
    document.documentElement.style.colorScheme = brightness(theme.surface) < 140 ? 'dark' : 'light';
  } catch {
    // The shared stylesheet remains usable when browser storage is unavailable.
  }
}

refreshTheme();
window.addEventListener('focus', refreshTheme);
