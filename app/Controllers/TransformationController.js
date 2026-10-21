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

  function render() {
    list.replaceChildren();
    if (!workspace.transformations.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent =
        'No transformations yet. Add a DOM transform to modify elements directly.';
      list.append(empty);
    }
    workspace.transformations.forEach((item, index) => {
      const card = document.createElement('section');
      card.className = 'transform-card';
      card.innerHTML = `
        <div class="transform-fields">
          <input type="checkbox" data-field="enabled" aria-label="Enable transformation">
          <input type="text" data-field="name" aria-label="Transformation name">
          <select data-field="kind" aria-label="Transformation input"><option value="dom">Shared DOM</option><option value="string">String</option><option value="comment">Comment command</option></select>
        </div>
        <div class="transform-fields">
          <select data-field="target" aria-label="Transformation stage"><option value="editor">Editor</option><option value="preview">Preview + export</option><option value="export">Export only</option></select>
          <select data-field="mode" aria-label="Transformation trigger"><option value="auto">Automatic</option><option value="manual">Manual</option></select>
          <span class="subtle transform-help"></span>
        </div>
        <label class="transform-command">Command prefix <input type="text" data-field="command" aria-label="Command prefix" placeholder="command:" spellcheck="false"></label>
        <textarea class="code-input" data-field="code" rows="6" spellcheck="false" aria-label="Transformation code"></textarea>
        <div class="transform-footer"><button data-transform-action="run">Run once</button><button data-transform-action="up" aria-label="Move transformation up">↑</button><button data-transform-action="down" aria-label="Move transformation down">↓</button><button data-transform-action="delete">Remove</button></div>`;
      card.querySelectorAll('[data-field]').forEach((input) => {
        const field = input.dataset.field;
        if (field === 'enabled') input.checked = item.enabled;
        else input.value = item[field] ?? '';
        input.addEventListener('change', () => {
          item[field] = field === 'enabled' ? input.checked : input.value;
          if (field === 'kind' && item.kind === 'comment' && (!item.code || item.code === defaultDomCode)) {
            item.code = defaultCommandCode;
            item.command ||= 'add-classes';
            card.querySelector('[data-field="code"]').value = item.code;
            card.querySelector('[data-field="command"]').value = item.command;
          }
          updateHelp();
          changed();
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
      card.querySelector('[data-transform-action="up"]').disabled = index === 0;
      card.querySelector('[data-transform-action="down"]').disabled =
        index === workspace.transformations.length - 1;
      card.addEventListener('click', async (event) => {
        const action = event.target.closest('[data-transform-action]')?.dataset.transformAction;
        if (!action) return;
        try {
          if (action === 'run') {
            await run(item);
            return;
          }
          if (action === 'delete') workspace.transformations.splice(index, 1);
          else {
            const next = index + (action === 'up' ? -1 : 1);
            [workspace.transformations[index], workspace.transformations[next]] = [
              workspace.transformations[next],
              workspace.transformations[index],
            ];
          }
          changed();
          render();
        } catch (error) {
          notify(error);
        }
      });
      list.append(card);
    });
    document.querySelector('#transform-count').textContent = workspace.transformations.length;
  }

  return { actions, render };
}
