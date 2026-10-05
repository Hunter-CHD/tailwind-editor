import { newDocument, newWorkspace, themes } from '../../config/editor.js';
import {
  loadWorkspace,
  saveWorkspace,
  validateWorkspace,
  validateColors,
} from '../Models/Workspace.js';
import { compile, compileExport } from '../Services/Compiler.js';
import { createEditor, formatHtml } from '../Services/Editor.js';
import { runTransformations } from '../Services/Transformations.js';
import { inspectHtml, affectsEditingRegion } from '../Services/Html.js';
import { bindTransformations } from './TransformationController.js';

const $ = (selector) => document.querySelector(selector);
const size = (text) => `${(new Blob([text]).size / 1024).toFixed(1)} KB`;

export async function start() {
  let workspace;
  let noticeTimer;
  let saveTimer;
  let renderTimer;
  let saveChain = Promise.resolve();
  let saveRevision = 0;
  let savedRevision = 0;
  let storageReady = false;
  let renderRevision = 0;
  let pendingEditorTransforms = false;
  let editingBoundary = false;
  let inspectedSource;
  let inspection;
  let exportResult;
  let exportName;
  let nameAction;
  let fileHandler;
  let previewWindow;
  let previewReady = false;
  let previewMonitor;
  const previewUrl = new URL('../../preview.html', import.meta.url);
  previewUrl.hash = crypto.randomUUID();
  const previewChannel = new BroadcastChannel(
    `tailwind-editor-preview:${previewUrl.hash.slice(1)}`,
  );
  previewChannel.addEventListener('message', ({ data }) => {
    if (data?.type === 'ready') {
      previewReady = true;
      updatePopout();
    }
  });

  try {
    const loaded = await loadWorkspace();
    workspace = loaded.workspace;
    storageReady = true;
    $('#save-status').textContent = 'All changes saved';
  } catch (error) {
    workspace = newWorkspace();
    $('#save-status').textContent = 'Storage unavailable';
    $('#save-status').dataset.error = 'true';
    notify(
      `Saved workspace could not be loaded. Use a workspace backup to keep your work. ${error.message}`,
    );
  }

  applySidebarState();
  const activeDocument = () => workspace.documents.find((item) => item.id === workspace.activeId);
  const editor = await createEditor($('#editor'), workspace.settings, (content) => {
    activeDocument().content = content;
    pendingEditorTransforms = true;
    editingBoundary = false;
    save();
    refresh();
  });
  if (editor.fallback) notify('The code editor could not load. Plain-text editing is available.');
  editor.onEditingBoundary((reason) => {
    editingBoundary = true;
    if (pendingEditorTransforms && (hasAutomaticEditorTransforms() || reason === 'compositionend'))
      refresh();
  });

  function hasAutomaticEditorTransforms() {
    return workspace.transformations.some(
      (item) => item.enabled && item.mode === 'auto' && item.target === 'editor',
    );
  }

  function inspect(source) {
    if (source !== inspectedSource) {
      inspectedSource = source;
      inspection = inspectHtml(source);
      // Permit a retry after a failed worker/CDN load.
      inspection.catch(() => {
        if (inspectedSource === source) inspectedSource = undefined;
      });
    }
    return inspection;
  }

  function showHtmlStatus(result) {
    const status = $('#html-status');
    status.dataset.state = result.state;
    status.textContent = {
      ready: 'HTML ready',
      incomplete: 'HTML incomplete',
      invalid: 'HTML syntax error',
    }[result.state];
    status.title = result.reason || 'HTML syntax is ready for transformations.';
    if (result.state !== 'ready')
      $('#compile-status').textContent = `Transforms paused · ${result.reason}`;
  }

  async function requireReady(source) {
    const result = await inspect(source);
    if (source === editor.getValue()) showHtmlStatus(result);
    if (result.state !== 'ready') throw new Error(`Transforms paused · ${result.reason}`);
    return result;
  }

  function notify(message) {
    clearTimeout(noticeTimer);
    $('#notice').textContent = message;
    $('#notice').hidden = false;
    noticeTimer = setTimeout(() => {
      $('#notice').hidden = true;
    }, 6500);
  }

  function save() {
    saveRevision++;
    if (!storageReady) {
      $('#save-status').textContent = 'Not saved · download a backup';
      $('#save-status').dataset.error = 'true';
      return;
    }
    $('#save-status').textContent = 'Saving…';
    $('#save-status').dataset.error = 'false';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 180);
  }

  function persist() {
    clearTimeout(saveTimer);
    // A temporary workspace must not overwrite data that failed to load or migrate.
    if (!storageReady) return Promise.resolve();
    const revision = saveRevision;
    const snapshot = structuredClone(workspace);
    saveChain = saveChain
      .catch(() => {})
      .then(() => saveWorkspace(snapshot))
      .then(() => {
        savedRevision = revision;
        if (revision === saveRevision) $('#save-status').textContent = 'All changes saved';
      })
      .catch((error) => {
        $('#save-status').textContent = 'Not saved · download a backup';
        $('#save-status').dataset.error = 'true';
        notify(`Could not save to IndexedDB: ${error.message}`);
      });
    return saveChain;
  }

  function refresh() {
    renderRevision++;
    clearTimeout(renderTimer);
    $('#compile-status').textContent = 'Updating preview…';
    $('#html-status').textContent = 'Checking HTML…';
    $('#html-status').dataset.state = 'checking';
    renderTimer = setTimeout(() => {
      const result = render();
      const revision = renderRevision;
      result.catch((error) => {
        if (revision === renderRevision) reportError(error);
      });
    }, 350);
  }

  function reportError(error) {
    if (error.message.startsWith('HTML syntax check')) {
      $('#html-status').textContent = 'HTML check unavailable';
      $('#html-status').dataset.state = 'invalid';
      $('#html-status').title = error.message;
    }
    $('#compile-status').textContent = 'Preview not updated · transformation or compilation error';
    $('#transform-log').textContent = error.message;
    notify(error.message);
  }

  async function transform(code, transformations, stage, name) {
    const result = await runTransformations(code, transformations, { stage, name });
    if (result.logs.length) $('#transform-log').textContent = result.logs.join(' · ');
    return result.code;
  }

  async function applyPendingEditorTransforms(document, revision, syntax) {
    const state = editor.getEditingState();
    const shouldApplyEditor =
      pendingEditorTransforms && !state.composing && (!state.focused || editingBoundary);
    if (shouldApplyEditor) {
      const transforms = workspace.transformations.filter(
        (item) => item.enabled && item.mode === 'auto' && item.target === 'editor',
      );
      const source = document.content;
      const result = await transform(source, transforms, 'editor', document.name);
      if (revision !== renderRevision) return false;
      const valid = result === source ? syntax : await inspectHtml(result);
      if (revision !== renderRevision) return false;
      if (valid.state !== 'ready')
        throw new Error(`Editor transformation produced unsafe HTML · ${valid.reason}`);
      const current = editor.getEditingState();
      if (
        current.composing ||
        (current.focused &&
          (!editingBoundary ||
            affectsEditingRegion(source, result, current.selections, syntax.openingTags)))
      )
        return true;
      pendingEditorTransforms = false;
      document.content = result;
      if (result !== activeDocument().content) {
        activeDocument().content = result;
        editor.applyTransformation(result);
        showHtmlStatus(valid);
        save();
      }
    }
    return true;
  }

  async function render(extraTransforms = []) {
    clearTimeout(renderTimer);
    const revision = ++renderRevision;
    const document = structuredClone(activeDocument());
    const syntax = await inspect(document.content);
    if (revision !== renderRevision) return;
    showHtmlStatus(syntax);
    if (syntax.state !== 'ready') return;
    if (editor.getEditingState().composing) {
      $('#compile-status').textContent = 'Transforms paused · Finish composing text';
      return;
    }
    if (!(await applyPendingEditorTransforms(document, revision, syntax))) return;
    const transforms = workspace.transformations.filter(
      (item) => item.enabled && item.mode === 'auto' && item.target === 'preview',
    );
    const content = await transform(
      document.content,
      [
        ...transforms,
        ...extraTransforms.filter((extra) => !transforms.some((item) => item.id === extra.id)),
      ],
      'preview',
      document.name,
    );
    if (revision !== renderRevision) return;
    const valid = await inspectHtml(content);
    if (revision !== renderRevision) return;
    if (valid.state !== 'ready')
      throw new Error(`Preview transformation produced unsafe HTML · ${valid.reason}`);
    const result = compile(document, content);
    showPreview(result);
    return result;
  }

  function showPreview(result) {
    $('#preview').srcdoc = result.html;
    updatePopout(result.html);
    $('#css-size').textContent = size(result.css);
    $('#compile-status').textContent = `Live preview · ${result.classes} unique classes`;
    if (pendingEditorTransforms && hasAutomaticEditorTransforms())
      $('#compile-status').textContent +=
        ' · Editor transforms waiting for a safe editing boundary';
  }

  function applySidebarState() {
    const collapsed = workspace.settings.sidebarCollapsed;
    $('.app-layout').classList.toggle('sidebar-collapsed', collapsed);
    $('#documents-sidebar').hidden = collapsed;
    const toggle = $('#toggle-documents');
    const label = collapsed ? 'Show documents' : 'Hide documents';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }

  function setPreviewDetached(detached) {
    $('#split-workspace').classList.toggle('preview-detached', detached);
    $('.preview-pane').hidden = detached;
    $('#splitter').hidden = detached;
    $('#focus-preview').hidden = !detached;
  }

  function restoreInlinePreview() {
    clearInterval(previewMonitor);
    previewWindow = null;
    previewReady = false;
    setPreviewDetached(false);
  }

  function checkPopout() {
    if (!previewWindow || previewWindow.closed) {
      restoreInlinePreview();
      return false;
    }
    try {
      if (previewReady && previewWindow.location.href !== previewUrl.href) {
        restoreInlinePreview();
        return false;
      }
    } catch {
      restoreInlinePreview();
      return false;
    }
    return true;
  }

  function updatePopout(html = $('#preview').srcdoc) {
    if (!checkPopout()) return;
    previewChannel.postMessage({
      type: 'render',
      html,
      title: `Live preview · ${activeDocument().name}`,
    });
  }

  function renderDocuments() {
    $('#document-list').replaceChildren();
    workspace.documents.forEach((item) => {
      const button = document.createElement('button');
      button.className = 'document-item';
      button.setAttribute('aria-current', String(item.id === workspace.activeId));
      button.title = item.name;
      const icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.textContent = '◇';
      const name = document.createElement('span');
      name.textContent = item.name;
      button.append(icon, name);
      button.addEventListener('click', () => openDocument(item.id));
      $('#document-list').append(button);
    });
    $('#document-name').textContent = activeDocument().name;
    updatePopout();
  }

  function openDocument(id) {
    workspace.activeId = id;
    pendingEditorTransforms = false;
    editingBoundary = false;
    editor.setValue(activeDocument().content);
    renderDocuments();
    save();
    refresh();
  }

  function askName(title, initial, action) {
    nameAction = action;
    $('#name-title').textContent = title;
    $('#name-input').value = initial;
    $('#name-dialog').showModal();
    $('#name-input').select();
  }

  function download(content, filename, type = 'text/html') {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function pickFile(accept, handler) {
    fileHandler = handler;
    $('#file-input').accept = accept;
    $('#file-input').value = '';
    $('#file-input').click();
  }

  function getTheme() {
    const theme = { ...(themes[workspace.settings.theme] || workspace.settings.customTheme) };
    const channels = theme.surface.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16));
    theme.dark = channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114 < 140;
    return theme;
  }

  function applyTheme() {
    const theme = getTheme();
    for (const key of ['background', 'surface', 'text', 'accent'])
      document.documentElement.style.setProperty(`--${key}`, theme[key]);
    const accent = theme.accent.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16));
    document.documentElement.style.setProperty(
      '--accent-text',
      accent[0] * 0.299 + accent[1] * 0.587 + accent[2] * 0.114 > 160 ? '#17212b' : '#ffffff',
    );
    document.documentElement.style.colorScheme = theme.dark ? 'dark' : 'light';
    editor.configure(theme, workspace.settings);
  }

  function renderThemes() {
    $('#theme-presets').replaceChildren();
    for (const [key, theme] of Object.entries({
      ...themes,
      custom: { ...workspace.settings.customTheme, name: 'Custom' },
    })) {
      const button = document.createElement('button');
      button.className = 'theme-choice';
      button.setAttribute('aria-pressed', String(workspace.settings.theme === key));
      const swatch = document.createElement('span');
      swatch.className = 'theme-swatch';
      swatch.style.background = theme.background;
      for (const color of [theme.surface, theme.text, theme.accent]) {
        const chip = document.createElement('span');
        chip.style.background = color;
        swatch.append(chip);
      }
      button.append(swatch, document.createTextNode(theme.name));
      button.addEventListener('click', () => {
        workspace.settings.theme = key;
        applyTheme();
        save();
        renderThemes();
      });
      $('#theme-presets').append(button);
    }
    for (const input of $('#custom-theme-form').elements) {
      if (input.name) input.value = workspace.settings.customTheme[input.name];
    }
  }

  async function prepareExport() {
    clearTimeout(renderTimer);
    const revision = ++renderRevision;
    const sourceDocument = structuredClone(activeDocument());
    const syntax = await requireReady(sourceDocument.content);
    if (revision !== renderRevision || editor.getEditingState().composing)
      throw new Error('Finish editing before preparing export.');
    if (!(await applyPendingEditorTransforms(sourceDocument, revision, syntax)))
      throw new Error('The document changed while preparing export. Please export again.');
    const previewTransforms = workspace.transformations.filter(
      (item) => item.enabled && item.mode === 'auto' && item.target === 'preview',
    );
    const exportTransforms = workspace.transformations.filter(
      (item) => item.enabled && item.target === 'export',
    );
    const transformed = await runTransformations(
      sourceDocument.content,
      [...previewTransforms, ...exportTransforms],
      { stage: 'export', name: sourceDocument.name },
      previewTransforms.length,
    );
    if (revision !== renderRevision)
      throw new Error('The document changed while preparing export. Please export again.');
    if (transformed.logs.length) $('#transform-log').textContent = transformed.logs.join(' · ');
    await requireReady(transformed.checkpoint);
    await requireReady(transformed.code);
    if (revision !== renderRevision)
      throw new Error('The document changed while preparing export. Please export again.');
    showPreview(compile(sourceDocument, transformed.checkpoint));
    const result = await compileExport(sourceDocument, transformed.code);
    if (revision !== renderRevision)
      throw new Error('The document changed while preparing export. Please export again.');
    exportResult = result;
    exportName = sourceDocument.name.replace(/\.html?$/i, '');
    $('#export-stats').replaceChildren();
    for (const [value, label] of [
      [exportResult.classes, 'Unique classes'],
      [size(exportResult.css), 'Generated CSS'],
      [size(exportResult.exportHtml), 'CSS + HTML'],
    ]) {
      const stat = document.createElement('div');
      stat.className = 'export-stat';
      const strong = document.createElement('strong');
      strong.textContent = value;
      const caption = document.createElement('span');
      caption.textContent = label;
      stat.append(strong, caption);
      $('#export-stats').append(stat);
    }
    $('#export-source').value = exportResult.exportHtml;
    $('#export-dialog').showModal();
  }

  const transformations = bindTransformations({
    workspace,
    save,
    refresh,
    notify,
    download,
    pickFile,
    async run(item) {
      await requireReady(editor.getValue());
      if (editor.getEditingState().composing)
        throw new Error('Finish typing before running transformations.');
      if (item.target === 'preview') await render([item]);
      else {
        clearTimeout(renderTimer);
        const revision = ++renderRevision;
        pendingEditorTransforms = false;
        const id = workspace.activeId;
        const source = editor.getValue();
        const result = await transform(source, [item], 'editor', activeDocument().name);
        await requireReady(result);
        if (
          revision !== renderRevision ||
          workspace.activeId !== id ||
          editor.getValue() !== source
        )
          throw new Error('The source changed during the run. Please run again.');
        editor.replace(result);
        pendingEditorTransforms = false;
        await render();
      }
      notify(`Ran ${item.name}.`);
    },
  });

  const actions = {
    ...transformations.actions,
    'toggle-documents': () => {
      workspace.settings.sidebarCollapsed = !workspace.settings.sidebarCollapsed;
      applySidebarState();
      save();
    },
    new: () =>
      askName('New document', 'Untitled.html', (name) => {
        const document = newDocument(name);
        workspace.documents.push(document);
        openDocument(document.id);
      }),
    rename: () =>
      askName('Rename document', activeDocument().name, (name) => {
        activeDocument().name = name;
        renderDocuments();
        save();
      }),
    duplicate: () => {
      const copy = structuredClone(activeDocument());
      copy.id = crypto.randomUUID();
      copy.name = copy.name.replace(/\.html?$/i, '') + ' copy.html';
      workspace.documents.push(copy);
      openDocument(copy.id);
    },
    delete: () => {
      if (!confirm(`Delete "${activeDocument().name}" from this workspace?`)) return;
      workspace.documents = workspace.documents.filter((item) => item.id !== workspace.activeId);
      if (!workspace.documents.length) workspace.documents.push(newDocument());
      openDocument(workspace.documents[0].id);
    },
    'import-html': () =>
      pickFile('.html,.htm,text/html,text/plain', async (file) => {
        const document = newDocument(file.name, await file.text());
        workspace.documents.push(document);
        openDocument(document.id);
      }),
    format: async () => {
      const id = workspace.activeId;
      const source = editor.getValue();
      const formatted = await formatHtml(source);
      if (id !== workspace.activeId || source !== editor.getValue())
        throw new Error('The source changed while formatting. Please try again.');
      editor.replace(formatted);
    },
    themes: () => {
      renderThemes();
      $('#theme-dialog').showModal();
    },
    settings: () => {
      $('#font-size').value = workspace.settings.fontSize;
      $('#word-wrap').checked = workspace.settings.wordWrap;
      $('#storage-size').textContent =
        `${workspace.documents.length} documents · ${size(JSON.stringify(workspace))} workspace data · IndexedDB`;
      $('#settings-dialog').showModal();
    },
    'document-settings': () => {
      $('#document-settings-name').textContent = activeDocument().name;
      $('#preflight').checked = activeDocument().preflight;
      $('#safelist').value = activeDocument().safelist;
      $('#palette-json').value = JSON.stringify(activeDocument().colors, null, 2);
      $('#document-settings-dialog').showModal();
    },
    transformations: () => {
      transformations.render();
      $('#transform-dialog').showModal();
    },
    export: prepareExport,
    'copy-export': async () => {
      await navigator.clipboard.writeText(exportResult.exportHtml);
      notify('Generated CSS and HTML copied.');
    },
    'download-export': () => download(exportResult.exportHtml, `${exportName}.html`),
    backup: () =>
      download(JSON.stringify(workspace, null, 2), 'tailwind-workspace.json', 'application/json'),
    restore: () =>
      pickFile('.json,application/json', async (file) => {
        const restored = validateWorkspace(JSON.parse(await file.text()));
        if (
          !confirm(
            `Replace this workspace with ${restored.documents.length} documents from the backup? Download a backup first if you want to keep the current workspace.`,
          )
        )
          return;
        restored.transformations.forEach((item) => {
          item.enabled = false;
        });
        Object.assign(workspace, restored);
        storageReady = true;
        applySidebarState();
        openDocument(workspace.activeId);
        transformations.render();
        applyTheme();
        $('#settings-dialog').close();
        notify('Workspace restored. Imported transformations are disabled for review.');
      }),
    popout: () => {
      updatePopout();
      if (!previewWindow) {
        previewWindow = window.open(previewUrl.href, '_blank');
        if (!previewWindow) throw new Error('Allow popups to open a preview.');
        previewWindow.opener = null;
        previewMonitor = setInterval(checkPopout, 500);
      }
      setPreviewDetached(true);
      previewWindow.focus();
    },
  };

  document.addEventListener('click', async (event) => {
    const close = event.target.closest('[data-close]');
    if (close) close.closest('dialog').close();
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = actions[button.dataset.action];
    if (!action) return;
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      notify(error.message);
    } finally {
      button.disabled = false;
    }
  });

  $('#name-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('#name-input').value.trim();
    if (!name) {
      $('#name-input').focus();
      return;
    }
    nameAction(/\.html?$/i.test(name) ? name : `${name}.html`);
    $('#name-dialog').close();
  });
  $('#custom-theme-form').addEventListener('submit', (event) => {
    event.preventDefault();
    workspace.settings.customTheme = Object.fromEntries(new FormData(event.target));
    workspace.settings.theme = 'custom';
    applyTheme();
    save();
    renderThemes();
    notify('Custom editor theme saved.');
  });
  $('#settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    workspace.settings.fontSize = Number($('#font-size').value);
    workspace.settings.wordWrap = $('#word-wrap').checked;
    save();
    applyTheme();
    $('#settings-dialog').close();
  });
  $('#document-settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const colors = JSON.parse($('#palette-json').value);
      if (!colors || Array.isArray(colors) || typeof colors !== 'object')
        throw new Error('Colors must be a JSON object.');
      const validatedColors = validateColors(colors);
      activeDocument().colors = validatedColors;
      activeDocument().preflight = $('#preflight').checked;
      activeDocument().safelist = $('#safelist').value;
      save();
      refresh();
      $('#document-settings-dialog').close();
    } catch (error) {
      notify(error.message);
    }
  });
  $('#file-input').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      await fileHandler(file);
    } catch (error) {
      notify(`Could not import: ${error.message}`);
    }
  });
  $('#viewport').addEventListener('change', (event) => {
    $('#preview').style.width = event.target.value;
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && ['e', 's'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.key.toLowerCase() === 's') persist();
      else if (!$('dialog[open]')) prepareExport().catch((error) => notify(error.message));
    }
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      actions.format().catch((error) => notify(error.message));
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (savedRevision !== saveRevision) {
      persist();
      event.preventDefault();
      event.returnValue = '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && savedRevision !== saveRevision) persist();
  });

  const splitter = $('#splitter');
  function resize(percent) {
    const width = Math.min(75, Math.max(25, percent));
    $('#split-workspace').style.setProperty('--editor-width', `${width}%`);
    splitter.setAttribute('aria-valuenow', Math.round(width));
  }
  splitter.addEventListener('pointerdown', (event) => {
    splitter.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');
  });
  splitter.addEventListener('pointermove', (event) => {
    if (!splitter.hasPointerCapture(event.pointerId)) return;
    const bounds = $('#split-workspace').getBoundingClientRect();
    resize(((event.clientX - bounds.left) / bounds.width) * 100);
  });
  splitter.addEventListener('lostpointercapture', () => document.body.classList.remove('resizing'));
  splitter.addEventListener('pointerup', (event) =>
    splitter.releasePointerCapture(event.pointerId),
  );
  splitter.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    resize(Number(splitter.getAttribute('aria-valuenow')) + (event.key === 'ArrowLeft' ? -2 : 2));
  });

  applyTheme();
  renderDocuments();
  transformations.render();
  editor.setValue(activeDocument().content);
  await render().catch(reportError);
}
