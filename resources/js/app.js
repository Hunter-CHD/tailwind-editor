try {
  const response = await fetch(new URL('../views/workspace.html', import.meta.url));
  if (!response.ok) throw new Error('The workspace view could not be loaded.');
  document.querySelector('#app').innerHTML = await response.text();
  const { start } = await import('../../app/Controllers/EditorController.js');
  await start();
} catch (error) {
  const message = document.createElement('p');
  message.className = 'boot-message';
  message.textContent = `Unable to open the editor: ${error.message} Serve this folder over HTTP and check your connection to jsDelivr.`;
  document.querySelector('#app').replaceChildren(message);
  console.error(error);
}
