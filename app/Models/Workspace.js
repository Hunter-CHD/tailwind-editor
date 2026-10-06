import { newWorkspace, newDocument, themes } from '../../config/editor.js';

const stores = ['workspaces', 'documentFiles', 'documentMetadata', 'transformations'];
const colorPattern = /^#[0-9a-f]{6}$/i;
const contentHashes = new Map();
let databasePromise;
let saveChain = Promise.resolve();

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('tailwind-editor', 3);
      let blocked = false;
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('workspaces'))
          database.createObjectStore('workspaces');
        for (const name of stores.slice(1)) {
          if (!database.objectStoreNames.contains(name))
            database.createObjectStore(name, { keyPath: 'id' });
        }
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Close other editor tabs and reload to upgrade document storage.'));
      };
      request.onsuccess = () => {
        const database = request.result;
        if (blocked) {
          database.close();
          return;
        }
        database.onversionchange = () => {
          database.close();
          databasePromise = undefined;
        };
        resolve(database);
      };
    }).catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () =>
      reject(transaction.error || new Error('Storage transaction aborted.'));
  });
}

async function readRecords() {
  const database = await openDatabase();
  const transaction = database.transaction(stores, 'readonly');
  const done = transactionDone(transaction);
  const workspace = transaction.objectStore('workspaces').get('workspace');
  const files = transaction.objectStore('documentFiles').getAll();
  const metadata = transaction.objectStore('documentMetadata').getAll();
  const transformations = transaction.objectStore('transformations').getAll();
  await done;
  return {
    saved: workspace.result,
    files: files.result,
    metadata: metadata.result,
    transformations: transformations.result,
  };
}

export async function loadWorkspace() {
  await saveChain.catch(() => {});
  const { saved, files, metadata, transformations: storedTransformations } = await readRecords();
  if (saved) {
    // The previous schema kept the entire workspace in this one record.
    if (Array.isArray(saved.documents)) {
      const workspace = validateWorkspace(saved);
      await saveWorkspace(workspace);
      return { workspace };
    }
    if (!Array.isArray(saved.documentIds) || !saved.documentIds.length)
      throw new Error('Invalid stored document list.');
    const filesById = new Map(files.map((item) => [item.id, item]));
    const metadataById = new Map(metadata.map((item) => [item.id, item]));
    const documents = await Promise.all(
      saved.documentIds.map(async (id) => {
        const record = filesById.get(id);
        const details = metadataById.get(id);
        if (!(record?.file instanceof File) || !details)
          throw new Error(`Stored document "${id}" is missing its file or metadata.`);
        return { ...details, content: await record.file.text() };
      }),
    );
    const inlineTransformations = Array.isArray(saved.transformations);
    let transformations = saved.transformations;
    if (!inlineTransformations) {
      if (!Array.isArray(saved.transformationIds))
        throw new Error('Invalid stored transformation list.');
      const byId = new Map(storedTransformations.map((item) => [item.id, item]));
      transformations = saved.transformationIds.map((id) => {
        if (!byId.has(id)) throw new Error(`Stored transformation "${id}" is missing.`);
        return byId.get(id);
      });
    }
    const workspace = validateWorkspace({ ...saved, documents, transformations });
    // Schema 2 kept transformations inside the workspace metadata.
    if (inlineTransformations) await saveWorkspace(workspace);
    return { workspace };
  }
  const workspace = newWorkspace();
  await saveWorkspace(workspace);
  return { workspace };
}

export function saveWorkspace(workspace) {
  // Snapshot now so callers can keep editing while this save is queued.
  const snapshot = structuredClone(workspace);
  const pending = saveChain.catch(() => {}).then(() => writeWorkspace(snapshot));
  saveChain = pending;
  return pending;
}

async function writeWorkspace(workspace) {
  const ids = new Set(workspace.documents.map((item) => item.id));
  if (!ids.size || ids.size !== workspace.documents.length || !ids.has(workspace.activeId))
    throw new Error('Workspace documents need unique IDs and a valid active document.');
  const transformationIds = new Set(workspace.transformations.map((item) => item.id));
  if (
    transformationIds.size !== workspace.transformations.length ||
    [...transformationIds].some((id) => typeof id !== 'string' || !id)
  )
    throw new Error('Transformations need unique, nonempty IDs.');
  const transformations = validateTransformations(workspace.transformations, { preserveIds: true });
  const files = await Promise.all(
    workspace.documents.map(async ({ id, name, content }) => {
      if (typeof id !== 'string' || typeof name !== 'string' || typeof content !== 'string')
        throw new Error('Invalid document in workspace.');
      let cached = contentHashes.get(id);
      if (cached?.content !== content) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
        cached = {
          content,
          hash: Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, '0'),
          ).join(''),
        };
        contentHashes.set(id, cached);
      }
      return { id, name, content, hash: cached.hash };
    }),
  );
  const metadata = workspace.documents.map(({ id, name, colors, safelist, preflight }) => ({
    id,
    name,
    colors,
    safelist,
    preflight,
  }));
  const workspaceMetadata = {
    version: workspace.version,
    documentIds: workspace.documents.map((item) => item.id),
    activeId: workspace.activeId,
    settings: workspace.settings,
    transformationIds: transformations.map((item) => item.id),
  };
  const database = await openDatabase();
  const transaction = database.transaction(stores, 'readwrite');
  const done = transactionDone(transaction);
  let writeError;
  function updateStore(name, update) {
    const store = transaction.objectStore(name);
    const request = store.getAll();
    request.onsuccess = () => {
      try {
        update(store, request.result);
      } catch (error) {
        writeError = error;
        transaction.abort();
      }
    };
  }
  updateStore('documentFiles', (store, records) => {
    const existing = new Map(records.map((item) => [item.id, item]));
    for (const { id, name, content, hash } of files) {
      const previous = existing.get(id);
      if (previous?.hash !== hash || previous.file?.name !== name)
        store.put({
          id,
          hash,
          file: new File([content], name, { type: 'text/html;charset=utf-8' }),
        });
    }
    for (const { id } of records) if (!ids.has(id)) store.delete(id);
  });
  updateStore('documentMetadata', (store, records) => {
    const existing = new Map(records.map((item) => [item.id, item]));
    for (const details of metadata) {
      if (JSON.stringify(existing.get(details.id)) !== JSON.stringify(details)) store.put(details);
    }
    for (const { id } of records) if (!ids.has(id)) store.delete(id);
  });
  updateStore('transformations', (store, records) => {
    const existing = new Map(records.map((item) => [item.id, item]));
    for (const transformation of transformations) {
      if (JSON.stringify(existing.get(transformation.id)) !== JSON.stringify(transformation))
        store.put(transformation);
    }
    for (const { id } of records) if (!transformationIds.has(id)) store.delete(id);
  });
  const workspaceStore = transaction.objectStore('workspaces');
  const request = workspaceStore.get('workspace');
  request.onsuccess = () => {
    try {
      if (JSON.stringify(request.result) !== JSON.stringify(workspaceMetadata))
        workspaceStore.put(workspaceMetadata, 'workspace');
    } catch (error) {
      writeError = error;
      transaction.abort();
    }
  };
  await done.catch((error) => {
    throw writeError || error;
  });
  for (const id of contentHashes.keys()) if (!ids.has(id)) contentHashes.delete(id);
}

export function validateTransformations(items, { preserveIds = false } = {}) {
  if (!Array.isArray(items)) throw new Error('Transformations must be an array.');
  const transformations = items.map((item) => {
    if (typeof item.name !== 'string' || typeof item.code !== 'string')
      throw new Error('Each transformation needs a name and code.');
    return {
      id: preserveIds && typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(),
      name: item.name,
      code: item.code,
      enabled: item.enabled === true,
      mode: item.mode === 'auto' ? 'auto' : 'manual',
      target: ['preview', 'export'].includes(item.target) ? item.target : 'editor',
      kind: item.kind === 'dom' ? 'dom' : 'string',
    };
  });
  if (new Set(transformations.map((item) => item.id)).size !== transformations.length)
    throw new Error('Transformation IDs must be unique.');
  return transformations;
}

export function validateWorkspace(value) {
  if (value?.version !== 1 || !Array.isArray(value.documents) || !value.documents.length) {
    throw new Error('This is not a supported workspace backup.');
  }
  const defaults = newWorkspace().settings;
  const settings = { ...defaults, ...value.settings };
  if (!themes[settings.theme] && settings.theme !== 'custom') settings.theme = 'light';
  settings.customTheme = {
    ...themes.light,
    ...validateColors(settings.customTheme || defaults.customTheme, [
      'background',
      'surface',
      'text',
      'accent',
    ]),
  };
  settings.fontSize = Math.min(24, Math.max(11, Number(settings.fontSize) || 14));
  settings.wordWrap = settings.wordWrap !== false;
  settings.sidebarCollapsed = settings.sidebarCollapsed === true;
  const theme = themes[settings.theme] || settings.customTheme;
  const documents = value.documents.map((item) => {
    if (typeof item.content !== 'string' || typeof item.name !== 'string')
      throw new Error('Invalid document in backup.');
    const document = {
      ...newDocument(item.name, item.content, theme),
      id: String(item.id || crypto.randomUUID()),
    };
    document.safelist = typeof item.safelist === 'string' ? item.safelist : '';
    document.preflight = item.preflight !== false;
    if (item.colors) document.colors = validateColors(item.colors);
    return document;
  });
  if (new Set(documents.map((item) => item.id)).size !== documents.length)
    throw new Error('Document IDs must be unique.');
  return {
    version: 1,
    documents,
    settings,
    activeId: documents.some((item) => item.id === value.activeId)
      ? value.activeId
      : documents[0].id,
    transformations: validateTransformations(value.transformations || [], { preserveIds: true }),
  };
}

export function validateColors(colors, keys = Object.keys(colors)) {
  const result = {};
  for (const key of keys) {
    if (!/^[a-z][a-z0-9-]*$/.test(key) || !colorPattern.test(colors[key])) {
      throw new Error(
        'Use lowercase color names and six-digit hex values, for example "accent": "#0f766e".',
      );
    }
    result[key] = colors[key];
  }
  return result;
}
