import { createPreviewRenderer } from '../../app/Services/Preview.js';

const session = location.hash.slice(1);

if (session) {
  const channel = new BroadcastChannel(`tailwind-editor-preview:${session}`);
  const frame = document.querySelector('#preview');
  const renderer = createPreviewRenderer(frame);
  channel.addEventListener('message', ({ data }) => {
    if (data?.type !== 'render' || typeof data.html !== 'string' || typeof data.title !== 'string' ||
      typeof data.documentId !== 'string')
      return;
    document.title = data.title;
    renderer.render(data.html, data.documentId);
  });
  channel.postMessage({ type: 'ready' });
}
