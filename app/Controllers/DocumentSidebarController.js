import { recentDocuments } from './DocumentLibraryController.js';

export function bindDocumentSidebar({ workspace, openDocument, save }) {
  const $ = (selector) => document.querySelector(selector);
  const rows = new Map();
  let recentIds;

  function togglePin(id) {
    const pins = workspace.pinnedDocumentIds;
    if (pins.includes(id) && recentIds && !recentIds.includes(id)) recentIds.unshift(id);
    workspace.pinnedDocumentIds = pins.includes(id) ? pins.filter((pin) => pin !== id) : [...pins, id];
    render();
    save();
  }

  function createRow(id) {
    const row = document.createElement('div');
    row.className = 'document-row';
    const open = document.createElement('button');
    open.className = 'document-item';
    open.setAttribute('aria-haspopup', 'menu');
    open.setAttribute('aria-controls', 'document-context-menu');
    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = '◇';
    const label = document.createElement('span');
    label.className = 'document-item-label';
    const folder = document.createElement('small');
    folder.className = 'document-folder';
    folder.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'document-item-name';
    label.append(folder, name);
    open.append(icon, label);
    open.addEventListener('click', () => openDocument(id));
    row.append(open);
    return row;
  }

  function renderList(list, documents, folders) {
    const wanted = new Set(documents.map((item) => item.id));
    for (const row of [...list.children]) {
      if (!wanted.has(row.dataset.documentId)) row.remove();
    }
    documents.forEach((item, index) => {
      if (!rows.has(item.id)) rows.set(item.id, createRow(item.id));
      const row = rows.get(item.id);
      row.dataset.documentId = item.id;
      row.dataset.active = String(item.id === workspace.activeId);
      const open = row.querySelector('.document-item');
      open.setAttribute('aria-current', row.dataset.active);
      const folder = row.querySelector('.document-folder');
      folder.id = `${list.id}-folder-${index}`;
      folder.textContent = folders.get(item.folderId) || 'Unfiled';
      open.setAttribute('aria-describedby', folder.id);
      open.title = `${folder.textContent} / ${item.name}`;
      row.querySelector('.document-item-name').textContent = item.name;
      // Reuse existing rows so switching documents preserves focus and click targets.
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
    });
  }

  function render() {
    const documents = new Map(workspace.documents.map((item) => [item.id, item]));
    workspace.pinnedDocumentIds = workspace.pinnedDocumentIds.filter((id) => documents.has(id));
    const pins = new Set(workspace.pinnedDocumentIds);
    const byRecency = recentDocuments(workspace).filter((item) => !pins.has(item.id));
    if (!recentIds) recentIds = byRecency.slice(0, 6).map((item) => item.id);
    recentIds = recentIds.filter((id) => documents.has(id) && !pins.has(id));
    if (!pins.has(workspace.activeId) && !recentIds.includes(workspace.activeId))
      recentIds.unshift(workspace.activeId);
    for (const item of byRecency) {
      if (recentIds.length >= 6) break;
      if (!recentIds.includes(item.id)) recentIds.push(item.id);
    }
    recentIds = recentIds.slice(0, 6);
    for (const [id, row] of rows) {
      if (!documents.has(id)) { row.remove(); rows.delete(id); }
    }
    const folders = new Map(workspace.folders.map((folder) => [folder.id, folder.name]));
    renderList($('#pinned-list'), workspace.pinnedDocumentIds.map((id) => documents.get(id)), folders);
    renderList($('#document-list'), recentIds.map((id) => documents.get(id)), folders);
    $('#pinned-section').hidden = pins.size === 0;
    $('#pinned-section').dataset.active = String(pins.has(workspace.activeId));
    $('#recent-section').dataset.active = String(!pins.has(workspace.activeId));
  }

  return { render, togglePin, resetSession() { recentIds = undefined; } };
}
