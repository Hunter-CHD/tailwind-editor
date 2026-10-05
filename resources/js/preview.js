const session = location.hash.slice(1);

if (session) {
  const channel = new BroadcastChannel(`tailwind-editor-preview:${session}`);
  const frame = document.querySelector('#preview');
  channel.addEventListener('message', ({ data }) => {
    if (data?.type !== 'render' || typeof data.html !== 'string' || typeof data.title !== 'string')
      return;
    document.title = data.title;
    if (frame.srcdoc !== data.html) frame.srcdoc = data.html;
  });
  channel.postMessage({ type: 'ready' });
}
