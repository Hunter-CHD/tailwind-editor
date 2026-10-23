export function bindDocumentContextMenu({ workspace, togglePin, renameDocument, duplicateDocument, deleteDocument }) {
  const sidebar = document.querySelector('#documents-sidebar');
  const menu = document.querySelector('#document-context-menu');
  let documentId;
  let opener;

  function close({ restoreFocus = false } = {}) {
    menu.hidden = true;
    documentId = undefined;
    opener?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
  }

  function show(row, x, y) {
    const item = workspace.documents.find((item) => item.id === row.dataset.documentId);
    if (!item) return;
    close();
    documentId = item.id;
    opener = row.querySelector('.document-item');
    opener.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-label', `Actions for ${item.name}`);
    menu.querySelector('[data-document-menu="pin"]').textContent =
      workspace.pinnedDocumentIds.includes(item.id) ? 'Unpin document' : 'Pin document';
    menu.hidden = false;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - bounds.height - 8))}px`;
    menu.querySelector('[role="menuitem"]').focus({ preventScroll: true });
  }

  sidebar.addEventListener('contextmenu', (event) => {
    const row = event.target.closest('.document-row');
    if (!row) { close(); return; }
    event.preventDefault();
    event.stopPropagation();
    const bounds = row.getBoundingClientRect();
    show(row, event.clientX || bounds.left, event.clientY || bounds.bottom);
  });
  sidebar.addEventListener('keydown', (event) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    const row = event.target.closest('.document-row');
    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = row.getBoundingClientRect();
    show(row, bounds.left, bounds.bottom);
  });
  menu.addEventListener('keydown', (event) => {
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      event.stopPropagation();
      close({ restoreFocus: true });
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    }
  });
  menu.addEventListener('click', (event) => {
    const action = event.target.closest('[data-document-menu]')?.dataset.documentMenu;
    const id = documentId;
    if (!action || !workspace.documents.some((item) => item.id === id)) return;
    close({ restoreFocus: true });
    ({ pin: togglePin, rename: renameDocument, duplicate: duplicateDocument, delete: deleteDocument })[action](id);
    if (action === 'pin' || action === 'delete') {
      const target = opener?.isConnected ? opener : sidebar.querySelector('.document-item[aria-current="true"]');
      target?.focus({ preventScroll: true });
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menu.contains(event.target)) close();
  });
  document.addEventListener('contextmenu', (event) => {
    if (!menu.contains(event.target)) close();
  });
  document.addEventListener('scroll', (event) => {
    if (!menu.contains(event.target)) close();
  }, { capture: true, passive: true });
  window.addEventListener('resize', () => close());
  window.addEventListener('blur', () => close());
}
