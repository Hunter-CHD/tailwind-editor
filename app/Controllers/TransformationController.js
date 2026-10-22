import { validateTransformations } from '../Models/Workspace.js';

const defaultDomCode = "document.querySelectorAll('[editor-meta]').forEach(element => element.remove());";
const defaultCommandCode = `// Example: <!-- add-classes: flex gap-4; -->
// Parse the argument string into individual class names.
const classes = args.split(/\\s+/).filter(Boolean);

// Apply them to each following sibling element.
for (const element of elements) {
  element.classList.add(...classes);
}`;

export function bindTransformations({ workspace, save, refresh, run, notify, download, pickFile }) {
  const list = document.querySelector('#transformation-list');
  const editor = document.querySelector('#transformation-editor');
  const dialog = document.querySelector('#transform-dialog');
  const stages = [['editor', 'Editor'], ['preview', 'Preview + export'], ['export', 'Export only']];
  const kinds = { dom: 'Shared DOM', string: 'String', comment: 'Comment command' };
  let selectedId;
  const expandedStages = new Set(['editor']);
  document.querySelector('#transform-back').addEventListener('click', () => {
    dialog.classList.remove('transform-detail-open');
    const selected = workspace.transformations.find((item) => item.id === selectedId);
    if (selected) expandedStages.add(selected.target);
    renderNavigator();
    list.querySelector('[aria-current="true"]')?.focus();
  });
  const actions = {
    'add-transform': () => {
      workspace.transformations.push({
        id: crypto.randomUUID(),
        name: 'Remove editor metadata',
        kind: 'dom',
        code: defaultDomCode,
        enabled: false,
        mode: 'auto',
        target: 'export',
      });
      selectedId = workspace.transformations.at(-1).id;
      expandedStages.add('export');
      dialog.classList.add('transform-detail-open');
      changed();
      render();
    },
    'import-transforms': () =>
      pickFile('.json,application/json', async (file) => {
        const transforms = validateTransformations(JSON.parse(await file.text()));
        transforms.forEach((item) => {
          item.enabled = false;
        });
        workspace.transformations.push(...transforms);
        if (transforms.length) {
          selectedId = transforms[0].id;
          expandedStages.add(transforms[0].target);
        }
        changed();
        render();
        notify('Transformations imported and disabled for review.');
      }),
    'export-transforms': () =>
      download(
        JSON.stringify(workspace.transformations, null, 2),
        'transformations.json',
        'application/json',
      ),
  };

  function changed() {
    document.querySelector('#transform-count').textContent = workspace.transformations.length;
    save();
    refresh();
  }

  function renderNavigator() {
    const scrollTop = list.scrollTop;
    list.replaceChildren();
    for (const [target, label] of stages) {
      const group = document.createElement('section');
      group.className = 'transform-group';
      group.setAttribute('aria-label', label);
      const heading = document.createElement('h3');
      const items = workspace.transformations.filter((item) => item.target === target);
      const toggle = document.createElement('button');
      toggle.className = 'transform-group-toggle';
      toggle.type = 'button';
      toggle.textContent = `${label} (${items.length})`;
      toggle.setAttribute('aria-expanded', String(expandedStages.has(target)));
      toggle.setAttribute('aria-controls', `transform-group-${target}`);
      const contents = document.createElement('div');
      contents.id = `transform-group-${target}`;
      contents.hidden = !expandedStages.has(target);
      toggle.addEventListener('click', () => {
        if (expandedStages.has(target)) expandedStages.delete(target);
        else expandedStages.add(target);
        contents.hidden = !expandedStages.has(target);
        toggle.setAttribute('aria-expanded', String(!contents.hidden));
      });
      heading.append(toggle);
      group.append(heading);
      group.append(contents);
      if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'subtle transform-group-empty';
        empty.textContent = 'No transformations';
        contents.append(empty);
      }
      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'transform-row';
        row.dataset.id = item.id;
        const enabled = document.createElement('input');
        enabled.type = 'checkbox';
        enabled.checked = item.enabled;
        enabled.setAttribute('aria-label', item.id === selectedId ? 'Enable transformation' : `Enable ${item.name}`);
        enabled.addEventListener('change', () => {
          item.enabled = enabled.checked;
          if (item.id === selectedId) {
            const detailEnabled = editor.querySelector('[data-field="enabled"]');
            if (detailEnabled) detailEnabled.checked = item.enabled;
          }
          changed();
        });
        const select = document.createElement('button');
        select.className = 'transform-select';
        select.setAttribute('aria-current', String(item.id === selectedId));
        select.setAttribute('aria-controls', 'transformation-editor');
        const name = document.createElement('span');
        name.textContent = item.name || 'Untitled transformation';
        const meta = document.createElement('span');
        meta.className = 'subtle';
        meta.textContent = `${kinds[item.kind]} · ${item.kind === 'comment' ? 'Automatic' : item.target === 'export' ? 'On export' : item.mode === 'auto' ? 'Automatic' : 'Manual'}`;
        select.append(name, meta);
        select.addEventListener('click', () => {
          selectedId = item.id;
          dialog.classList.add('transform-detail-open');
          render();
          editor.querySelector('[data-field="name"]')?.focus();
        });
        row.append(enabled, select);
        contents.append(row);
      }
      list.append(group);
    }
    list.scrollTop = scrollTop;
  }

  function render({ resetGroups = false } = {}) {
    if (resetGroups) {
      expandedStages.clear();
      expandedStages.add('editor');
    }
    if (!workspace.transformations.some((item) => item.id === selectedId))
      selectedId = stages.flatMap(([target]) => workspace.transformations.filter((item) => item.target === target))[0]?.id;
    editor.replaceChildren();
    renderNavigator();
    if (!workspace.transformations.length) {
      dialog.classList.remove('transform-detail-open');
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent =
        'No transformations yet. Add a DOM transform to modify elements directly.';
      editor.append(empty);
    }
    workspace.transformations.forEach((item, index) => {
      if (item.id !== selectedId) return;
      const card = document.createElement('section');
      card.className = 'transform-card';
      card.innerHTML = `
        <label class="transform-detail-enabled"><input type="checkbox" data-field="enabled" aria-label="Enable transformation"> Enabled</label>
        <div class="transform-fields">
          <input type="text" data-field="name" aria-label="Transformation name">
          <select data-field="kind" aria-label="Transformation input"><option value="dom">Shared DOM</option><option value="string">String</option><option value="comment">Comment command</option></select>
        </div>
        <div class="transform-fields">
          <select data-field="target" aria-label="Transformation stage"><option value="editor">Editor</option><option value="preview">Preview + export</option><option value="export">Export only</option></select>
          <select data-field="mode" aria-label="Transformation trigger"><option value="auto">Automatic</option><option value="manual">Manual</option></select>
          <span class="subtle transform-help"></span>
        </div>
        <label class="transform-command">Command prefix <input type="text" data-field="command" aria-label="Command prefix" placeholder="command:" spellcheck="false"></label>
        <textarea class="code-input" data-field="code" rows="16" spellcheck="false" aria-label="Transformation code"></textarea>
        <div class="transform-footer"><button data-transform-action="run">Run once</button><button data-transform-action="up" aria-label="Move transformation up">↑</button><button data-transform-action="down" aria-label="Move transformation down">↓</button><button data-transform-action="delete">Remove</button></div>`;
      card.querySelectorAll('[data-field]').forEach((input) => {
        const field = input.dataset.field;
        if (field === 'enabled') input.checked = item.enabled;
        else input.value = item[field] ?? '';
        input.addEventListener(field === 'name' ? 'input' : 'change', () => {
          const previousTarget = item.target;
          item[field] = field === 'enabled' ? input.checked : input.value;
          if (field === 'kind' && item.kind === 'comment' && (!item.code || item.code === defaultDomCode)) {
            item.code = defaultCommandCode;
            item.command ||= 'add-classes';
            card.querySelector('[data-field="code"]').value = item.code;
            card.querySelector('[data-field="command"]').value = item.command;
          }
          updateHelp();
          if (item.target !== previousTarget) expandedStages.add(item.target);
          changed();
          if (['name', 'kind', 'target', 'mode', 'enabled'].includes(field)) renderNavigator();
        });
      });
      function updateHelp() {
        const isCommand = item.kind === 'comment';
        const target = card.querySelector('[data-field="target"]');
        const mode = card.querySelector('[data-field="mode"]');
        const runButton = card.querySelector('[data-transform-action="run"]');
        if (isCommand) {
          item.mode = 'auto';
          if (item.target !== 'editor') item.target = 'preview';
          target.querySelector('option[value="export"]')?.remove();
        } else if (!target.querySelector('option[value="export"]')) {
          target.add(new Option('Export only', 'export'));
        }
        target.value = item.target;
        mode.value = item.mode;
        mode.hidden = isCommand;
        runButton.hidden = isCommand;
        card.querySelector('.transform-command').hidden = !isCommand;
        card.querySelector('.transform-help').textContent =
          isCommand
            ? item.target === 'editor'
              ? 'Runs automatically once; consumes the comment in the editor.'
              : 'Runs automatically in preview and export; keeps the comment in the editor.'
            : item.kind === 'dom' ? 'Edit document; no return needed.' : 'Receive code; return HTML.';
        mode.disabled = isCommand || item.target === 'export';
        runButton.disabled = isCommand || item.target === 'export';
        if (item.target === 'export')
          card.querySelector('.transform-help').textContent += ' Runs on Export.';
      }
      updateHelp();
      function updateOrder() {
        const siblings = workspace.transformations.filter((other) => other.target === item.target);
        card.querySelector('[data-transform-action="up"]').disabled = siblings[0] === item;
        card.querySelector('[data-transform-action="down"]').disabled = siblings.at(-1) === item;
      }
      updateOrder();
      card.addEventListener('change', updateOrder);
      card.addEventListener('click', async (event) => {
        const action = event.target.closest('[data-transform-action]')?.dataset.transformAction;
        if (!action) return;
        try {
          if (action === 'run') {
            await run(item);
            return;
          }
          if (action === 'delete') {
            const siblings = workspace.transformations.filter((other) => other.target === item.target);
            const position = siblings.indexOf(item);
            selectedId = (siblings[position + 1] || siblings[position - 1])?.id;
            workspace.transformations.splice(index, 1);
          }
          else {
            const siblings = workspace.transformations.filter((other) => other.target === item.target);
            const neighbor = siblings[siblings.indexOf(item) + (action === 'up' ? -1 : 1)];
            if (!neighbor) return;
            const next = workspace.transformations.indexOf(neighbor);
            [workspace.transformations[index], workspace.transformations[next]] = [
              workspace.transformations[next],
              workspace.transformations[index],
            ];
          }
          changed();
          render();
          const focusTarget = editor.querySelector(`[data-transform-action="${action}"]:not(:disabled)`)
            || editor.querySelector('[data-field="name"]') || document.querySelector('[data-action="add-transform"]');
          focusTarget.focus();
        } catch (error) {
          notify(error);
        }
      });
      editor.append(card);
    });
    document.querySelector('#transform-count').textContent = workspace.transformations.length;
  }

  return { actions, render };
}
