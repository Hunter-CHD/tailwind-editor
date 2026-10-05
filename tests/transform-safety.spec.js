import { test, expect } from '@playwright/test';

async function open(
  page,
  fallback = false,
  code = 'return code.replace(/ class=""\\n/g, "").replace(/ class=""/g, "");',
) {
  if (fallback)
    await page.route('**/monaco-editor@0.45.0/min/vs/loader.js', (route) => route.abort());
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.evaluate(async (code) => {
    const { loadWorkspace, saveWorkspace } = await import('./app/Models/Workspace.js');
    const { workspace } = await loadWorkspace();
    workspace.transformations = [
      {
        id: 'safe',
        name: 'Remove empty attributes',
        kind: 'string',
        enabled: true,
        mode: 'auto',
        target: 'editor',
        code,
      },
    ];
    await saveWorkspace(workspace);
  }, code);
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
}

async function source(page, value, line = 1, fallback = false) {
  await page.evaluate(
    ({ value, line, fallback }) => {
      if (fallback) {
        const input = document.querySelector('.source-fallback');
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const offset =
          value
            .split('\n')
            .slice(0, line - 1)
            .join('\n').length + (line > 1 ? 1 : 0);
        input.setSelectionRange(offset, offset);
        input.dispatchEvent(new Event('select'));
      } else {
        const editor = window.monaco.editor.getEditors()[0];
        editor.focus();
        editor.getModel().setValue(value);
        editor.setPosition({ lineNumber: line, column: 2 });
      }
    },
    { value, line, fallback },
  );
}

async function current(page, fallback = false) {
  return page.evaluate(
    (fallback) =>
      fallback
        ? document.querySelector('.source-fallback').value
        : window.monaco.editor.getModels()[0].getValue(),
    fallback,
  );
}

for (const fallback of [false, true]) {
  test(`${fallback ? 'plain-text' : 'Monaco'} editing protects valid empty attributes through line changes within the same tag`, async ({
    page,
  }) => {
    await open(page, fallback);
    const value = '<div\n class=""\n id="card">Hello</div>\n<p>Next</p>';
    await source(page, value, 2, fallback);
    await expect(page.locator('#html-status')).toHaveText('HTML ready');
    await expect(page.locator('#compile-status')).toContainText('waiting for a safe');
    expect(await current(page, fallback)).toBe(value);
    await page.evaluate((fallback) => {
      if (fallback) {
        const input = document.querySelector('.source-fallback');
        const offset = input.value.indexOf('id=');
        input.setSelectionRange(offset, offset);
        input.dispatchEvent(new Event('select'));
      } else window.monaco.editor.getEditors()[0].setPosition({ lineNumber: 3, column: 3 });
    }, fallback);
    await expect(page.locator('#compile-status')).toContainText('waiting for a safe');
    expect(await current(page, fallback)).toBe(value);
    await page.evaluate((fallback) => {
      if (fallback) {
        const input = document.querySelector('.source-fallback');
        const offset = input.value.indexOf('Next');
        input.setSelectionRange(offset, offset + 4, 'backward');
        input.dispatchEvent(new Event('select'));
      } else
        window.monaco.editor.getEditors()[0].setSelection(new window.monaco.Selection(4, 8, 4, 4));
    }, fallback);
    await expect.poll(() => current(page, fallback)).toBe(value.replace(' class=""\n', ''));
    const selected = await page.evaluate((fallback) => {
      if (fallback) {
        const input = document.querySelector('.source-fallback');
        return [
          input.value.slice(input.selectionStart, input.selectionEnd),
          input.selectionDirection,
          document.activeElement === input,
        ];
      }
      const editor = window.monaco.editor.getEditors()[0];
      return [
        editor.getModel().getValueInRange(editor.getSelection()),
        editor.getSelection().getDirection() === 1 ? 'backward' : 'forward',
        editor.hasTextFocus(),
      ];
    }, fallback);
    expect(selected).toEqual(['Next', 'backward', true]);
    // Blurring also flushes a transform that touches the current line.
    await source(page, '<p class="">Blur</p>', 1, fallback);
    await expect(page.locator('#compile-status')).toContainText('waiting for a safe');
    await page.locator('#document-name').focus();
    await expect.poll(() => current(page, fallback)).toBe('<p>Blur</p>');
  });
}

test('incomplete HTML pauses every stage, preserves the preview, and still saves the raw source', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(async () => {
    const { loadWorkspace, saveWorkspace } = await import('./app/Models/Workspace.js');
    const { workspace } = await loadWorkspace();
    workspace.transformations.push(
      ...['preview', 'export'].map((target) => ({
        id: target,
        name: target,
        kind: 'string',
        enabled: true,
        mode: 'auto',
        target,
        code: 'return code.replace("Hello", "Transformed");',
      })),
    );
    await saveWorkspace(workspace);
  });
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  const preview = await page.locator('#preview').getAttribute('srcdoc');
  const workers = [];
  page.on('worker', (worker) => {
    if (worker.url().endsWith('TransformationWorker.js')) workers.push(worker.url());
  });
  const unfinished = '<div class="Hello';
  await source(page, unfinished);
  await expect(page.locator('#html-status')).toHaveText('HTML incomplete');
  await expect(page.locator('#compile-status')).toContainText('Transforms paused');
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Transforms paused');
  await expect(page.locator('#export-dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Transformations', exact: true }).click();
  await page.getByRole('button', { name: 'Run once', exact: true }).first().click();
  await expect(page.locator('#notice')).toContainText('Transforms paused');
  expect(workers).toEqual([]);
  expect(await page.locator('#preview').getAttribute('srcdoc')).toBe(preview);
  expect(
    await page.evaluate(async () => {
      const { workspace } = await (await import('./app/Models/Workspace.js')).loadWorkspace();
      return workspace.documents.find((item) => item.id === workspace.activeId).content;
    }),
  ).toBe(unfinished);
  await page.locator('#transform-dialog [data-close]').click();
  await source(page, '<div class="">Hello</div>');
  await expect(page.locator('#html-status')).toHaveText('HTML ready');
  await expect(page.frameLocator('#preview').locator('div')).toHaveText('Transformed');
  expect(await current(page)).toContain('class=""');
  await page.locator('#document-name').focus();
  await expect.poll(() => current(page)).toBe('<div>Hello</div>');
  await source(page, '<div></span></div>');
  await expect(page.locator('#html-status')).toHaveText('HTML syntax error');
  await expect(page.locator('#compile-status')).toContainText('Unexpected </span>');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/html-syntax-mobile.png', fullPage: true });
});

test('moving back into a changed line during a run keeps the result deferred', async ({ page }) => {
  await open(
    page,
    false,
    'await new Promise(resolve => setTimeout(resolve, 700)); return code.replace("Before", "After");',
  );
  const started = page.waitForEvent('worker', {
    predicate: (worker) => worker.url().endsWith('TransformationWorker.js'),
  });
  await source(page, '<p>Before</p>\n<p>Next</p>', 2);
  await started;
  await page.evaluate(() =>
    window.monaco.editor.getEditors()[0].setPosition({ lineNumber: 1, column: 5 }),
  );
  await expect(page.locator('#compile-status')).toContainText('waiting for a safe');
  expect(await current(page)).toBe('<p>Before</p>\n<p>Next</p>');
  await page.evaluate(() =>
    window.monaco.editor.getEditors()[0].setPosition({ lineNumber: 2, column: 5 }),
  );
  await expect.poll(() => current(page)).toBe('<p>After</p>\n<p>Next</p>');
});

test('composition pauses transformations even on blur and automatically resumes afterward', async ({
  page,
}) => {
  await open(page, true);
  const input = page.getByRole('textbox', { name: 'HTML source', exact: true });
  const workers = [];
  page.on('worker', (worker) => {
    if (worker.url().endsWith('TransformationWorker.js')) workers.push(worker.url());
  });
  await input.dispatchEvent('compositionstart');
  await source(page, '<p class="">Composing</p>', 1, true);
  await input.blur();
  await expect(page.locator('#compile-status')).toContainText('Finish composing text');
  expect(workers).toEqual([]);
  await input.dispatchEvent('compositionend');
  await expect.poll(() => current(page, true)).toBe('<p>Composing</p>');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
});

test('stale transformations cannot overwrite typing and invalid output cannot replace source', async ({
  page,
}) => {
  await open(
    page,
    false,
    'await new Promise(resolve => setTimeout(resolve, 700)); return code.replace("Before", "After");',
  );
  const started = page.waitForEvent('worker', {
    predicate: (worker) => worker.url().endsWith('TransformationWorker.js'),
  });
  await source(page, '<p>Before</p>\n<p>Next</p>', 2);
  await started;
  await source(page, '<p>Before typed</p>\n<p>Next</p>', 1);
  await expect(page.locator('#compile-status')).toContainText('waiting for a safe');
  expect(await current(page)).toBe('<p>Before typed</p>\n<p>Next</p>');
  await page.locator('#document-name').focus();
  await expect.poll(() => current(page)).toBe('<p>After typed</p>\n<p>Next</p>');
  await page.getByRole('button', { name: 'Transformations', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Transformation code', exact: true })
    .fill('return "<div class=\\\"";');
  await page.getByRole('button', { name: 'Run once', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Transforms paused');
  expect(await current(page)).toBe('<p>After typed</p>\n<p>Next</p>');
});
