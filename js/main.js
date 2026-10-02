import { App } from './core/App.js';
import { config } from './config.js';

// Initialize application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function init() {
  try {
    const app = new App(config);
    await app.mount('#app');
    console.log('✅ Twind Editor initialized');
  } catch (error) {
    console.error('❌ Failed to initialize app:', error);
    document.getElementById('app').innerHTML = `
      <div style="padding: 40px; text-align: center; color: #f87171;">
        <h1>Failed to load editor</h1>
        <p>${error.message}</p>
        <p style="margin-top: 20px;">
          <a href="tailwind-editor.html" style="color: #7c6af7;">
            Use original version
          </a>
        </p>
      </div>
    `;
  }
}
