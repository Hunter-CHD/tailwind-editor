import { validateTransformations } from '../Models/Workspace.js';

export function bindTransformations({ workspace, save, refresh, run, notify, download, pickFile }) {
  const list = document.querySelector('#transformation-list');
  const actions = {
    'add-transform': () => {
      workspace.transformations.push({
        id: crypto.randomUUID(),
        name: 'Remove editor metadata',
        kind: 'dom',
        code: "document.querySelectorAll('[editor-meta]').forEach(element => element.remove());",
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
          <select data-field="kind" aria-label="Transformation input"><option value="dom">Shared DOM</option><option value="string">String</option></select>
        </div>
        <div class="transform-fields">
          <select data-field="target" aria-label="Transformation stage"><option value="editor">Editor</option><option value="preview">Preview + export</option><option value="export">Export only</option></select>
          <select data-field="mode" aria-label="Transformation trigger"><option value="auto">Automatic</option><option value="manual">Manual</option></select>
          <span class="subtle transform-help"></span>
        </div>
        <textarea class="code-input" data-field="code" rows="6" spellcheck="false" aria-label="Transformation code"></textarea>
        <div class="transform-footer"><button data-transform-action="run">Run once</button><button data-transform-action="up" aria-label="Move transformation up">↑</button><button data-transform-action="down" aria-label="Move transformation down">↓</button><button data-transform-action="delete">Remove</button></div>`;
      card.querySelectorAll('[data-field]').forEach((input) => {
        const field = input.dataset.field;
        if (field === 'enabled') input.checked = item.enabled;
        else input.value = item[field];
        input.addEventListener('change', () => {
          item[field] = field === 'enabled' ? input.checked : input.value;
          updateHelp();
          changed();
        });
      });
      function updateHelp() {
        card.querySelector('.transform-help').textContent =
          item.kind === 'dom' ? 'Edit document; no return needed.' : 'Receive code; return HTML.';
        card.querySelector('[data-field="mode"]').disabled = item.target === 'export';
        card.querySelector('[data-transform-action="run"]').disabled = item.target === 'export';
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
          notify(error.message);
        }
      });
      list.append(card);
    });
    document.querySelector('#transform-count').textContent = workspace.transformations.length;
  }

  return { actions, render };
}
