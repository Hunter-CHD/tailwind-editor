const $ = (selector) => document.querySelector(selector);

export function recentDocuments(workspace) {
  return [...workspace.documents].sort((a, b) =>
    Number(b.id === workspace.activeId) - Number(a.id === workspace.activeId) ||
    b.lastOpenedAt - a.lastOpenedAt);
}

export function bindDocumentLibrary({ workspace, save, openDocument, renderDocuments, askName, createDocument, togglePin }) {
  const dialog = $('#library-dialog');
  // Null means all documents; an empty string means unfiled. Folder IDs are nonempty strings.
  let selectedFolder = null;
  let Fuse;
  let searchLoading;
  let searchFailed = false;
  let entries = [];
  let index;

  function button(label, onClick, className = '') {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.className = className;
    element.addEventListener('click', onClick);
    return element;
  }

  function changed() {
    renderDocuments();
    save();
    render();
  }

  function renderResults() {
    const query = $('#library-search').value.trim();
    let results = query
      ? index ? index.search(query).map(({ item }) => item)
        : entries.filter((item) => `${item.name} ${item.folderName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
      : [...entries];
    results = results.filter((item) => selectedFolder === null ||
      (selectedFolder === '' ? !item.folderId : item.folderId === selectedFolder));
    if (!query) {
      if ($('#library-sort').value === 'name') results.sort((a, b) => a.name.localeCompare(b.name));
      else {
        const order = new Map(recentDocuments(workspace).map((item, i) => [item.id, i]));
        results.sort((a, b) => order.get(a.id) - order.get(b.id));
      }
    }
    $('#library-sort').disabled = Boolean(query);
    $('#library-status').textContent = `${results.length} ${results.length === 1 ? 'document' : 'documents'}${query ? ' found' : ''}`;
    $('#library-search-note').textContent = searchFailed
      ? 'Basic search available. Reload to retry fuzzy search.'
      : !Fuse ? 'Loading fuzzy search…' : '';
    const list = $('#library-results');
    list.replaceChildren();
    list.hidden = results.length === 0;
    $('#library-empty').hidden = results.length > 0;
    $('#library-empty').textContent = query ? 'No matching documents. Try another name or folder.'
      : 'No documents here yet. Create a document or move one into this folder.';
    for (const item of results) {
      const row = document.createElement('li');
      row.className = 'library-document';
      const open = button(item.name, () => {
        dialog.close();
        openDocument(item.id);
      }, 'library-document-open');
      open.title = item.name;
      open.setAttribute('aria-current', String(item.id === workspace.activeId));
      const details = document.createElement('small');
      details.textContent = `${item.folderName}${item.id === workspace.activeId ? ' · Editing' : ''}`;
      open.append(details);
      const move = document.createElement('select');
      move.setAttribute('aria-label', `Folder for ${item.name}`);
      for (const folder of [{ id: '', name: 'Unfiled' }, ...workspace.folders]) {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        move.append(option);
      }
      move.value = item.folderId || '';
      move.addEventListener('change', () => {
        workspace.documents.find((document) => document.id === item.id).folderId = move.value || null;
        changed();
        $('#library-search').focus();
      });
      const rename = button('Rename', () => askName('Rename document', item.name, (name) => {
        workspace.documents.find((document) => document.id === item.id).name = name;
        changed();
      }));
      rename.setAttribute('aria-label', `Rename ${item.name}`);
      const remove = button('Delete', () => {
        if (!confirm(`Delete "${item.name}" from this workspace?`)) return;
        workspace.documents = workspace.documents.filter((document) => document.id !== item.id);
        if (!workspace.documents.length) createDocument('Untitled');
        else if (workspace.activeId === item.id) openDocument(recentDocuments(workspace)[0].id);
        changed();
        $('#library-search').focus();
      });
      remove.setAttribute('aria-label', `Delete ${item.name}`);
      const pinned = workspace.pinnedDocumentIds.includes(item.id);
      const pin = button(pinned ? 'Unpin' : 'Pin', () => {
        togglePin(item.id);
        render();
        $('#library-search').focus();
      });
      pin.setAttribute('aria-label', `${pinned ? 'Unpin' : 'Pin'} ${item.name}`);
      pin.setAttribute('aria-pressed', String(pinned));
      const actions = document.createElement('div');
      actions.className = 'library-document-actions';
      actions.append(move, pin, rename, remove);
      row.append(open, actions);
      list.append(row);
    }
  }

  function render() {
    if (selectedFolder !== null && selectedFolder !== '' &&
      !workspace.folders.some((folder) => folder.id === selectedFolder)) selectedFolder = null;
    const folders = new Map(workspace.folders.map((folder) => [folder.id, folder.name]));
    entries = workspace.documents.map((item) => ({ ...item, folderName: folders.get(item.folderId) || 'Unfiled' }));
    index = Fuse ? new Fuse(entries, {
      keys: [{ name: 'name', weight: 0.8 }, { name: 'folderName', weight: 0.2 }],
      threshold: 0.35,
      ignoreLocation: true,
    }) : null;
    $('#library-folders').replaceChildren();
    for (const folder of [{ id: null, name: 'All documents' }, { id: '', name: 'Unfiled' }, ...workspace.folders]) {
      const count = entries.filter((item) => folder.id === null ||
        (folder.id === '' ? !item.folderId : item.folderId === folder.id)).length;
      const filter = button(folder.name, () => {
        selectedFolder = folder.id;
        render();
        $('#library-folders [aria-pressed="true"]').focus();
      }, 'library-folder');
      filter.setAttribute('aria-pressed', String(selectedFolder === folder.id));
      const total = document.createElement('span');
      total.className = 'count';
      total.textContent = count;
      filter.append(total);
      $('#library-folders').append(filter);
    }
    const folder = workspace.folders.find((item) => item.id === selectedFolder);
    $('#library-folder-title').textContent = folder?.name || (selectedFolder === null ? 'All documents' : 'Unfiled');
    $('#library-rename-folder').hidden = !folder;
    $('#library-delete-folder').hidden = !folder;
    renderResults();
  }

  $('#library-search').addEventListener('input', renderResults);
  $('#library-sort').addEventListener('change', renderResults);
  $('#library-new-folder').addEventListener('click', () => {
    askName('New folder', '', (name) => {
      const folder = { id: crypto.randomUUID(), name };
      workspace.folders.push(folder);
      selectedFolder = folder.id;
      $('#library-search').value = '';
      changed();
    }, { folder: true });
  });
  $('#library-rename-folder').addEventListener('click', () => {
    const folder = workspace.folders.find((item) => item.id === selectedFolder);
    askName('Rename folder', folder.name, (name) => {
      folder.name = name;
      changed();
    }, { folder: true });
  });
  $('#library-delete-folder').addEventListener('click', () => {
    const folder = workspace.folders.find((item) => item.id === selectedFolder);
    if (!confirm(`Delete folder "${folder.name}"? Its documents will move to Unfiled.`)) return;
    workspace.documents.forEach((item) => { if (item.folderId === folder.id) item.folderId = null; });
    workspace.folders = workspace.folders.filter((item) => item.id !== folder.id);
    selectedFolder = '';
    changed();
    $('#library-search').focus();
  });
  $('#library-new-document').addEventListener('click', () => {
    askName('New document', 'Untitled', (name) => {
      const folderId = workspace.folders.some((item) => item.id === selectedFolder) ? selectedFolder : null;
      createDocument(name, folderId);
      dialog.close();
    });
  });

  return {
    show() {
      selectedFolder = null;
      $('#library-search').value = '';
      render();
      dialog.showModal();
      $('#library-search').focus();
      if (!Fuse && !searchLoading) {
        searchFailed = false;
        renderResults();
        searchLoading = import('https://cdn.jsdelivr.net/npm/fuse.js@7.1.0/dist/fuse.mjs')
          .then((module) => { Fuse = module.default; })
          .catch(() => { searchFailed = true; })
          .finally(() => {
            searchLoading = null;
            if (dialog.open) render();
          });
      }
    },
  };
}
