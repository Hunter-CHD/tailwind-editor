import { createStore, get, set } from 'idb-keyval';
import { newWorkspace, newDocument, themes } from '../../config/editor.js';

const store = createStore('tailwind-editor', 'workspaces');
const colorPattern = /^#[0-9a-f]{6}$/i;

export async function loadWorkspace() {
  const saved = await get('workspace', store);
  if (saved) return { workspace: validateWorkspace(saved), migrated: false };
  const workspace = newWorkspace();
  let migrated = false;
  try {
    const tabs = JSON.parse(localStorage.getItem('twind-editor-tabs'));
    if (Array.isArray(tabs) && tabs.length) {
      workspace.documents = tabs.map((tab) => ({
        ...newDocument(tab.name, tab.content),
        id: String(tab.id),
      }));
      workspace.activeId =
        JSON.parse(localStorage.getItem('twind-editor-active-tab')) || workspace.documents[0].id;
      workspace.transformations =
        JSON.parse(localStorage.getItem('twind-editor-transformations')) || [];
      // Imported code stays paused until the user chooses to run it.
      workspace.transformations.forEach((item) => {
        item.enabled = false;
      });
      migrated = true;
    }
  } catch (error) {
    console.warn('Legacy data was not imported:', error);
  }
  const validated = validateWorkspace(workspace);
  await saveWorkspace(validated);
  return { workspace: validated, migrated };
}

export function saveWorkspace(workspace) {
  return set('workspace', workspace, store);
}

export function validateTransformations(items) {
  if (!Array.isArray(items)) throw new Error('Transformations must be an array.');
  return items.map((item) => {
    if (typeof item.name !== 'string' || typeof item.code !== 'string')
      throw new Error('Each transformation needs a name and code.');
    return {
      id: crypto.randomUUID(),
      name: item.name,
      code: item.code,
      enabled: item.enabled === true,
      mode: item.mode === 'auto' ? 'auto' : 'manual',
      target: ['preview', 'export'].includes(item.target) ? item.target : 'editor',
      kind: item.kind === 'dom' ? 'dom' : 'string',
    };
  });
}

export function validateWorkspace(value) {
  if (value?.version !== 1 || !Array.isArray(value.documents) || !value.documents.length) {
    throw new Error('This is not a supported workspace backup.');
  }
  const documents = value.documents.map((item) => {
    if (typeof item.content !== 'string' || typeof item.name !== 'string')
      throw new Error('Invalid document in backup.');
    const document = {
      ...newDocument(item.name, item.content),
      id: String(item.id || crypto.randomUUID()),
    };
    document.safelist = typeof item.safelist === 'string' ? item.safelist : '';
    document.preflight = item.preflight !== false;
    if (item.colors) document.colors = validateColors(item.colors);
    return document;
  });
  if (new Set(documents.map((item) => item.id)).size !== documents.length)
    throw new Error('Document IDs must be unique.');
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
  return {
    version: 1,
    documents,
    settings,
    activeId: documents.some((item) => item.id === value.activeId)
      ? value.activeId
      : documents[0].id,
    transformations: validateTransformations(value.transformations || []),
  };
}

export function validateColors(colors, keys = Object.keys(colors)) {
  const result = {};
  for (const key of keys) {
    if (!/^[a-z][a-z0-9-]*$/.test(key) || !colorPattern.test(colors[key])) {
      throw new Error(
        'Use lowercase color names and six-digit hex values, for example "brand": "#0f766e".',
      );
    }
    result[key] = colors[key];
  }
  return result;
}
