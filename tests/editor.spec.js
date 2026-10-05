import { test, expect } from '@playwright/test';

async function openEditor(page) {
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.waitForFunction(() => window.monaco?.editor.getModels().length > 0);
}

async function setSource(page, source) {
  await page.evaluate((value) => window.monaco.editor.getModels()[0].setValue(value), source);
  await expect(page.locator('#compile-status')).toContainText('Live preview');
}

async function openPopout(page) {
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open preview in a new tab', exact: true }).click();
  return opened;
}

test('popout follows edits, colors, and document switches and can be reused or reopened', async ({
  page,
  context,
}) => {
  await openEditor(page);
  await page.locator('#splitter').focus();
  await page.locator('#splitter').press('ArrowRight');
  await page.locator('#splitter').press('ArrowRight');
  const originalEditorWidth = (await page.locator('#editor').boundingBox()).width;
  const popup = await openPopout(page);
  await expect(page.locator('.preview-pane')).toBeHidden();
  await expect(page.locator('#splitter')).toBeHidden();
  await expect(page.locator('#focus-preview')).toBeVisible();
  await expect
    .poll(async () => (await page.locator('#editor').boundingBox()).width)
    .toBeGreaterThan(originalEditorWidth * 1.5);
  await expect(popup).toHaveURL(/\/tailwind-editor\/preview\.html#[\w-]+$/);
  await expect(popup.frameLocator('iframe').locator('h1')).toContainText('Start with an idea.');
  await expect(popup.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(popup.locator('body')).toHaveCSS('margin', '0px');
  await expect(popup.locator('body')).toHaveCSS('padding', '0px');
  await expect(popup.locator('iframe')).toHaveCSS('border-width', '0px');
  await expect(popup.locator('iframe')).toHaveCSS('display', 'block');
  expect(await popup.locator('iframe').boundingBox()).toEqual({
    x: 0,
    y: 0,
    ...popup.viewportSize(),
  });
  expect(await popup.evaluate(() => window.opener)).toBeNull();

  await setSource(page, '<h1 class="text-brand">Updated live</h1>');
  await expect(popup.frameLocator('iframe').locator('h1')).toHaveText('Updated live');
  await popup.reload();
  await expect(popup.frameLocator('iframe').locator('h1')).toHaveText('Updated live');
  await page.getByRole('button', { name: 'Themes', exact: true }).click();
  await page.locator('#palette-json').fill('{"brand":"#ff0000"}');
  await page.getByRole('button', { name: 'Apply colors' }).click();
  await page.locator('#theme-dialog [data-close]').click();
  await expect(popup.frameLocator('iframe').locator('h1')).toHaveCSS('color', 'rgb(255, 0, 0)');

  await page.getByRole('button', { name: 'New document', exact: true }).click();
  await page.locator('#name-input').fill('Second');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await setSource(page, '<h1>Second document</h1>');
  await expect(popup.frameLocator('iframe').locator('h1')).toHaveText('Second document');
  await expect(popup).toHaveTitle('Live preview · Second.html');
  await page.getByRole('button', { name: '◇ Welcome.html', exact: true }).click();
  await expect(popup.frameLocator('iframe').locator('h1')).toHaveText('Updated live');
  await expect(popup).toHaveTitle('Live preview · Welcome.html');

  await page.getByRole('button', { name: 'Focus preview ↗', exact: true }).click();
  expect(context.pages()).toHaveLength(2);
  await popup.close();
  await expect(page.locator('.preview-pane')).toBeVisible();
  await expect(page.locator('#splitter')).toBeVisible();
  await expect(page.locator('#splitter')).toHaveAttribute('aria-valuenow', '54');
  await expect(page.locator('#focus-preview')).toBeHidden();
  await expect
    .poll(async () => (await page.locator('#editor').boundingBox()).width)
    .toBe(originalEditorWidth);
  await setSource(page, '<h1>After closing the popout</h1>');
  const reopened = await openPopout(page);
  await expect(reopened.frameLocator('iframe').locator('h1')).toHaveText(
    'After closing the popout',
  );
  await setSource(page, '<h1>Still live</h1>');
  await expect(reopened.frameLocator('iframe').locator('h1')).toHaveText('Still live');
  await reopened.goto('about:blank');
  await expect(page.locator('.preview-pane')).toBeVisible();
});

test('a blocked popout leaves the inline preview and editor split available', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.getByRole('button', { name: 'Open preview in a new tab', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Allow popups');
  await expect(page.locator('.preview-pane')).toBeVisible();
  await expect(page.locator('#splitter')).toBeVisible();
  await expect(page.locator('#focus-preview')).toBeHidden();
});

test('loads the editor, renders styles, and persists source in IndexedDB', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openEditor(page);
  await expect(page.frameLocator('#preview').getByRole('heading', { level: 1 })).toContainText(
    'Start with an idea.',
  );
  await setSource(page, '<h1 class="text-brand p-8">Persisted document</h1>');
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.frameLocator('#preview').locator('h1')).toHaveText('Persisted document');
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(errors).toEqual([]);
});

test('fresh compilation prunes removed utilities and preserves variants and custom colors', async ({
  page,
}) => {
  await openEditor(page);
  const result = await page.evaluate(async () => {
    const { compile } = await import('./app/Services/Compiler.js');
    const { newDocument } = await import('./config/editor.js');
    const doc = newDocument(
      'Test.html',
      '<div class="p-8 hover:bg-brand sm:grid bg-[#abc123]">Test</div>',
    );
    doc.preflight = false;
    doc.colors.brand = '#123456';
    const first = compile(doc);
    const next = compile({ ...doc, content: '<p class="m-3">Next</p>', safelist: 'hidden' });
    return { first, next };
  });
  expect(result.first.css).toContain('padding:2rem');
  expect(result.first.css).toContain(':hover');
  expect(result.first.css).toContain('@media');
  expect(result.first.css).toMatch(/18[ ,]+52[ ,]+86/);
  expect(result.next.css).not.toContain('padding:2rem');
  expect(result.next.css).toContain('display:none');
  expect(result.first.html).not.toContain('cdn.jsdelivr');
});

test('export displays, copies, and downloads the same CSS and HTML fragment', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '<section class="p-8"><h2>Reusable fragment</h2></section>');
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (text) => {
        window.copiedExport = text;
      },
    });
  });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
  const output = await page.locator('#export-source').inputValue();
  expect(output).toMatch(/^<pre style="display:none"><style data-generated="tailwind-editor">/);
  expect(output).toContain('padding: 2rem;');
  expect(output).toContain('<section class="p-8"><h2>Reusable fragment</h2></section>');
  expect(output).toMatch(/@scope[^\n]+\{\n  /);
  expect(output).not.toMatch(/<!doctype|<\/?(?:html|head|body|title|meta)(?:\s|>)/i);
  await page.getByRole('button', { name: 'Copy CSS + HTML', exact: true }).click();
  expect(await page.evaluate(() => window.copiedExport)).toBe(output);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download HTML', exact: true }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('utf8')).toBe(output);
});

test('export preserves manually entered boilerplate, assets, and fragment-only elements', async ({
  page,
}) => {
  await openEditor(page);
  const result = await page.evaluate(async () => {
    const { compile } = await import('./app/Services/Compiler.js');
    const { newDocument } = await import('./config/editor.js');
    const full = newDocument(
      'Page.html',
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page title</title><style>.custom { color: red; }</style><link rel="stylesheet" href="custom.css"><script type="application/json">{"keep":true}</script></head><body><article class="p-8 custom">Content</article></body></html>',
    );
    const row = newDocument('Row.html', '<tr class="p-2"><td>Cell</td></tr>');
    const partial = newDocument(
      'Partial.html',
      '<!doctype html><html lang="fr"><p>Content</p></html>',
    );
    return {
      full: compile(full).exportHtml,
      original: full.content,
      row: compile(row).exportHtml,
      partial: compile(partial).exportHtml,
    };
  });
  expect(
    result.full.replace(/<style data-generated="tailwind-editor">[\s\S]*?<\/style>\n/, ''),
  ).toBe(result.original);
  expect(result.full).toMatch(/^<!doctype html>/);
  expect(result.full).toMatch(
    /<head>[\s\S]*<style data-generated="tailwind-editor">[\s\S]*<\/head>/,
  );
  expect(result.full).toContain('.custom { color: red; }');
  expect(result.full).toContain('href="custom.css"');
  expect(result.full).toContain('{"keep":true}');
  expect(result.full).toContain('<article class="p-8 custom">Content</article>');
  expect(result.row).toContain('<tr class="p-2"><td>Cell</td></tr>');
  expect(result.row).not.toContain('<div');
  expect(result.row).not.toMatch(/<!doctype|<\/?(?:html|head|body)(?:\s|>)/i);
  expect(result.partial).toMatch(/^<!doctype html><html lang="fr"><style/);
  expect(result.partial).not.toMatch(/<\/?(?:head|body|title|meta)(?:\s|>)/i);
});

test('DOM transforms share identity, cross string boundaries, and fail atomically', async ({
  page,
}) => {
  await openEditor(page);
  const result = await page.evaluate(async () => {
    const { runTransformations } = await import('./app/Services/Transformations.js');
    const transforms = [
      {
        name: 'Remember node',
        kind: 'dom',
        code: 'document.rememberedNode = document.querySelector("p"); document.rememberedNode.textContent = "First";',
      },
      {
        name: 'Same document',
        kind: 'dom',
        code: 'if (document.rememberedNode !== document.querySelector("p")) throw new Error("DOM was reparsed"); document.rememberedNode.className = "text-brand";',
      },
      { name: 'String boundary', kind: 'string', code: 'return code.replace("First", "Second");' },
      {
        name: 'DOM after string',
        kind: 'dom',
        code: 'document.querySelector("p").setAttribute("data-result", "ok");',
      },
    ];
    const success = await runTransformations('<p>Original</p>', transforms);
    let failure;
    try {
      await runTransformations('<p>Original</p>', [
        ...transforms,
        { name: 'Broken', kind: 'string', code: 'return 42;' },
      ]);
    } catch (error) {
      failure = error.message;
    }
    return { success, failure };
  });
  expect(result.success.code).toContain('Second');
  expect(result.success.code).toContain('data-result="ok"');
  expect(result.success.code).not.toContain('<html');
  expect(result.failure).toContain('Broken: String transforms must return a string');
});

test('a looping transform times out without freezing the editor', async ({ page }) => {
  await openEditor(page);
  const message = await page.evaluate(async () => {
    const { runTransformations } = await import('./app/Services/Transformations.js');
    try {
      await runTransformations('<p>Safe</p>', [
        { name: 'Loop', kind: 'string', code: 'while (true) {}' },
      ]);
    } catch (error) {
      return error.message;
    }
  });
  expect(message).toContain('three-second limit');
  await page.getByRole('button', { name: 'Themes', exact: true }).click();
  await expect(page.locator('#theme-dialog')).toBeVisible();
});

test('export-only transformations affect export and its CSS without changing source or preview', async ({
  page,
}) => {
  await openEditor(page);
  await setSource(page, '<p class="p-2" editor-meta>Private note</p><h1>Visible</h1>');
  const popup = await openPopout(page);
  await page.getByRole('button', { name: /Transformations/ }).click();
  await page.getByRole('button', { name: '+ Add transformation' }).click();
  await page.getByRole('checkbox', { name: 'Enable transformation' }).check();
  await page
    .getByRole('textbox', { name: 'Transformation code', exact: true })
    .fill(
      'document.querySelectorAll("[editor-meta]").forEach(node => node.remove()); document.querySelector("h1").className = "p-12";',
    );
  await page.locator('#transform-dialog [data-close]').click();
  await expect(page.frameLocator('#preview').locator('[editor-meta]')).toHaveText('Private note');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
  const output = await page.locator('#export-source').inputValue();
  expect(output).not.toContain('Private note');
  expect(output).toContain('padding: 3rem;');
  expect(output).not.toContain('padding: 0.5rem;');
  await expect(popup.frameLocator('iframe').locator('[editor-meta]')).toHaveText('Private note');
  expect(await page.evaluate(() => window.monaco.editor.getModels()[0].getValue())).toContain(
    'Private note',
  );
  await expect(page.frameLocator('#preview').locator('[editor-meta]')).toHaveText('Private note');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download HTML', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('Welcome.html');
});

test('document colors and a custom interface theme persist', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Themes', exact: true }).click();
  await page.locator('#custom-theme-form [name="background"]').fill('#102030');
  await page.locator('#custom-theme-form [name="surface"]').fill('#182838');
  await page.locator('#custom-theme-form [name="text"]').fill('#eeeeee');
  await page.getByRole('button', { name: 'Save custom theme' }).click();
  await page
    .locator('#palette-json')
    .fill('{"brand":"#ff0000","canvas":"#ffffff","ink":"#111111"}');
  await page.getByRole('button', { name: 'Apply colors' }).click();
  await page.locator('#theme-dialog [data-close]').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  expect(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--background')),
  ).toBe('#102030');
  await expect(page.frameLocator('#preview').locator('h1 span')).toHaveCSS(
    'color',
    'rgb(255, 0, 0)',
  );
});

test('migrates legacy storage once without deleting it or enabling imported code', async ({
  page,
}) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const { createStore, del } = await import('idb-keyval');
    await del('workspace', createStore('tailwind-editor', 'workspaces'));
    localStorage.setItem(
      'twind-editor-tabs',
      JSON.stringify([{ id: 'legacy', name: 'Legacy', content: '<p>Legacy work</p>' }]),
    );
    localStorage.setItem('twind-editor-active-tab', JSON.stringify('legacy'));
    localStorage.setItem(
      'twind-editor-transformations',
      JSON.stringify([
        {
          name: 'Old transform',
          code: 'return code;',
          mode: 'auto',
          target: 'preview',
          enabled: true,
        },
      ]),
    );
  });
  await page.reload();
  await expect(page.frameLocator('#preview').locator('p')).toHaveText('Legacy work');
  await page.getByRole('button', { name: /Transformations/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Enable transformation' })).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('twind-editor-tabs'))).toContain(
    'Legacy work',
  );
});

test('formats HTML and manages separate documents', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  await page.locator('#name-input').fill('Second');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await setSource(page, '<section><h1>Hello</h1><p>Second document</p></section>');
  await page.getByRole('button', { name: /Format/ }).click();
  await expect
    .poll(() => page.evaluate(() => window.monaco.editor.getModels()[0].getValue()))
    .toContain('\n');
  await page.getByRole('button', { name: '◇ Welcome.html', exact: true }).click();
  await expect(page.frameLocator('#preview').locator('h1')).toContainText('Start with an idea.');
  await page.getByRole('button', { name: '◇ Second.html', exact: true }).click();
  await expect(page.frameLocator('#preview').locator('h1')).toHaveText('Hello');
});

test('desktop and mobile layouts remain usable', async ({ page }) => {
  await openEditor(page);
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#preview')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/workspace-mobile.png', fullPage: true });
});

test('preview and export share a DOM but produce separate snapshots for full documents', async ({
  page,
}) => {
  await openEditor(page);
  const result = await page.evaluate(async () => {
    const { runTransformations } = await import('./app/Services/Transformations.js');
    return runTransformations(
      '<!doctype html><html lang="fr"><head><title>Keep title</title></head><body><p>Before</p></body></html>',
      [
        {
          name: 'Preview',
          kind: 'dom',
          target: 'preview',
          code: 'if (context.stage !== "preview") throw new Error("Wrong stage"); document.sharedNode = document.querySelector("p"); document.sharedNode.textContent = "Preview";',
        },
        {
          name: 'Export',
          kind: 'dom',
          target: 'export',
          code: 'if (context.stage !== "export" || document.sharedNode !== document.querySelector("p")) throw new Error("DOM was reparsed"); document.sharedNode.textContent = "Export";',
        },
      ],
      { stage: 'export' },
      1,
    );
  });
  expect(result.checkpoint).toContain('<p>Preview</p>');
  expect(result.code).toContain('<p>Export</p>');
  expect(result.code).toContain('lang="fr"');
  expect(result.code).toContain('<title>Keep title</title>');
});

test('export waits for pending automatic editor transforms and runs preview transforms once', async ({
  page,
}) => {
  await openEditor(page);
  await page.evaluate(async () => {
    const { loadWorkspace, saveWorkspace } = await import('./app/Models/Workspace.js');
    const { workspace } = await loadWorkspace();
    workspace.transformations = [
      {
        id: 'slow',
        name: 'Slow edit',
        kind: 'string',
        enabled: true,
        mode: 'auto',
        target: 'editor',
        code: 'await new Promise(resolve => setTimeout(resolve, 1200)); return code.replace("Before", "After");',
      },
      {
        id: 'preview',
        name: 'Preview once',
        kind: 'dom',
        enabled: true,
        mode: 'auto',
        target: 'preview',
        code: 'document.querySelector("h1")?.append("!");',
      },
    ];
    await saveWorkspace(workspace);
  });
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  const workerStarted = page.waitForEvent('worker', {
    predicate: (worker) => worker.url().endsWith('TransformationWorker.js'),
  });
  await page.evaluate(() => window.monaco.editor.getModels()[0].setValue('<h1>Before</h1>'));
  await workerStarted;
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
  expect(await page.locator('#export-source').inputValue()).toContain('<h1>After!</h1>');
  expect(await page.evaluate(() => window.monaco.editor.getModels()[0].getValue())).toBe(
    '<h1>After</h1>',
  );
  await expect(page.frameLocator('#preview').locator('h1')).toHaveText('After!');
});

test('Run once does not double-apply an enabled automatic preview transform', async ({ page }) => {
  await openEditor(page);
  await setSource(page, '<h1>Hello</h1>');
  const popup = await openPopout(page);
  await page.getByRole('button', { name: 'Transformations', exact: true }).click();
  await page.getByRole('button', { name: '+ Add transformation' }).click();
  await page.getByRole('combobox', { name: 'Transformation stage' }).selectOption('preview');
  await page
    .getByRole('textbox', { name: 'Transformation code', exact: true })
    .fill('document.querySelector("h1").append("!");');
  await page.getByRole('checkbox', { name: 'Enable transformation' }).check();
  await page.getByRole('button', { name: 'Run once', exact: true }).click();
  await page.locator('#transform-dialog [data-close]').click();
  await expect(page.frameLocator('#preview').locator('h1')).toHaveText('Hello!');
  await expect(popup.frameLocator('iframe').locator('h1')).toHaveText('Hello!');
});
