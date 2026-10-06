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

async function configureEditorTransform(page, mode) {
  await page.evaluate(async (mode) => {
    const { loadWorkspace, saveWorkspace } = await import('./app/Models/Workspace.js');
    const { workspace } = await loadWorkspace();
    workspace.settings.wordWrap = false;
    workspace.transformations = [
      {
        id: 'cursor-test',
        name: 'Preserve editing position',
        kind: 'string',
        enabled: true,
        mode,
        target: 'editor',
        code: 'await new Promise(resolve => setTimeout(resolve, 700)); return code.replace("Before", "After");',
      },
    ];
    await saveWorkspace(workspace);
  }, mode);
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
}

for (const mode of ['auto', 'manual']) {
  test(`${mode} editor transforms preserve the latest selections and scroll position`, async ({
    page,
  }) => {
    await openEditor(page);
    await configureEditorTransform(page, mode);
    const source = Array.from(
      { length: 120 },
      (_, i) => `<p>Before ${i} ${'x'.repeat(200)}</p>`,
    ).join('\n');
    const workerStarted = page.waitForEvent('worker', {
      predicate: (worker) => worker.url().endsWith('TransformationWorker.js'),
    });
    await page.evaluate((value) => window.monaco.editor.getModels()[0].setValue(value), source);
    if (mode === 'manual') {
      await page.getByRole('button', { name: 'Transformations', exact: true }).click();
      await page.getByRole('button', { name: 'Run once', exact: true }).click();
    }
    await workerStarted;
    // The user can move the cursor while the asynchronous transform is running.
    const before = await page.evaluate(() => {
      const editor = window.monaco.editor.getEditors()[0];
      editor.setSelections([
        new window.monaco.Selection(60, 45, 60, 35),
        new window.monaco.Selection(70, 40, 70, 40),
      ]);
      editor.setScrollPosition({ scrollTop: 1100, scrollLeft: 200 });
      if (!document.querySelector('dialog[open]')) editor.focus();
      return {
        selections: editor.getSelections(),
        top: editor.getScrollTop(),
        left: editor.getScrollLeft(),
      };
    });
    expect(before.top).toBeGreaterThan(0);
    expect(before.left).toBeGreaterThan(0);
    await page.waitForFunction(() =>
      window.monaco.editor.getModels()[0].getValue().includes('After'),
    );
    await expect(page.locator('#compile-status')).toContainText('Live preview');
    const after = await page.evaluate(() => {
      const editor = window.monaco.editor.getEditors()[0];
      return {
        selections: editor.getSelections(),
        top: editor.getScrollTop(),
        left: editor.getScrollLeft(),
      };
    });
    expect(after).toEqual(before);
    if (mode === 'auto') {
      expect(await page.evaluate(() => window.monaco.editor.getEditors()[0].hasTextFocus())).toBe(
        true,
      );
    } else {
      await page.locator('#transform-dialog [data-close]').click();
      await page.evaluate(() => window.monaco.editor.getEditors()[0].trigger('test', 'undo'));
      expect(await page.evaluate(() => window.monaco.editor.getModels()[0].getValue())).toBe(
        source,
      );
      await page.evaluate(() => window.monaco.editor.getEditors()[0].trigger('test', 'redo'));
      expect(
        await page.evaluate(() => window.monaco.editor.getEditors()[0].getSelections()),
      ).toEqual(before.selections);
      await page.getByRole('button', { name: 'Transformations', exact: true }).click();
      await page
        .getByRole('textbox', { name: 'Transformation code', exact: true })
        .fill('return "<p>x</p>";');
      await page.getByRole('button', { name: 'Run once', exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => window.monaco.editor.getModels()[0].getValue()))
        .toBe('<p>x</p>');
      expect(await page.evaluate(() => window.monaco.editor.getEditors()[0].getPosition())).toEqual(
        {
          lineNumber: 1,
          column: 9,
        },
      );
      expect(await page.evaluate(() => window.monaco.editor.getEditors()[0].getScrollTop())).toBe(
        0,
      );
    }
  });
}

test('plain-text automatic transforms preserve selection direction and scrolling', async ({
  page,
}) => {
  await page.route('**/monaco-editor@0.45.0/min/vs/loader.js', (route) => route.abort());
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await configureEditorTransform(page, 'auto');
  const input = page.getByRole('textbox', { name: 'HTML source', exact: true });
  const source = Array.from({ length: 120 }, () => `<p>Before ${'x'.repeat(200)}</p>`).join('\n');
  const workerStarted = page.waitForEvent('worker', {
    predicate: (worker) => worker.url().endsWith('TransformationWorker.js'),
  });
  await input.fill(source);
  await input.blur();
  await workerStarted;
  const before = await input.evaluate((input) => {
    input.setSelectionRange(6000, 6010, 'backward');
    input.scrollTop = 400;
    input.scrollLeft = 200;
    return [
      input.selectionStart,
      input.selectionEnd,
      input.selectionDirection,
      input.scrollTop,
      input.scrollLeft,
    ];
  });
  await expect(input).toHaveValue(source.replace('Before', 'After'));
  expect(
    await input.evaluate((input) => [
      input.selectionStart,
      input.selectionEnd,
      input.selectionDirection,
      input.scrollTop,
      input.scrollLeft,
    ]),
  ).toEqual([before[0] - 1, before[1] - 1, ...before.slice(2)]);
});

async function openPopout(page) {
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open preview in a new tab', exact: true }).click();
  return opened;
}

for (const detached of [false, true]) {
  test(`${detached ? 'popout' : 'inline'} preview links navigate the parent and section links stay in the preview`, async ({
    page,
    context,
  }) => {
    await context.route('https://preview-links.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Link destination</h1>' }),
    );
    await openEditor(page);
    const source = `<main>
      <a href="#details">Jump to details</a>
      <a href="https://preview-links.test/next">Leave preview</a>
      <section id="details" style="margin-top: 1200px">Section content</section>
    </main>`;
    await setSource(page, source);
    const parent = detached ? await openPopout(page) : page;
    const frame = parent.frameLocator('#preview');
    await frame.getByRole('link', { name: 'Jump to details' }).click();
    await expect(frame.locator('#details')).toBeInViewport();
    await expect(parent).toHaveURL(detached ? /preview\.html#/ : /tailwind-editor\/$/);
    await expect(frame.getByRole('link', { name: 'Leave preview' })).toBeVisible();
    expect(await page.evaluate(() => window.monaco.editor.getModels()[0].getValue())).toBe(source);
    await frame.getByRole('link', { name: 'Leave preview' }).click();
    await expect(parent).toHaveURL('https://preview-links.test/next');
    await expect(parent.getByRole('heading', { name: 'Link destination' })).toBeVisible();
    if (detached) {
      await expect(page.locator('.preview-pane')).toBeVisible();
      await expect(page).toHaveURL(/tailwind-editor\/$/);
    }
  });
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
  await expect(popup.locator('iframe')).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-top-navigation-by-user-activation',
  );
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
  await page.getByRole('button', { name: 'Document settings', exact: true }).click();
  await page.locator('#palette-json').fill('{"brand":"#ff0000"}');
  await page
    .locator('#document-settings-dialog')
    .getByRole('button', { name: 'Save settings', exact: true })
    .click();
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
  await expect(page.locator('#theme-dialog #palette-json')).toHaveCount(0);
  await page.locator('#custom-theme-form [name="background"]').fill('#102030');
  await page.locator('#custom-theme-form [name="surface"]').fill('#182838');
  await page.locator('#custom-theme-form [name="text"]').fill('#eeeeee');
  await page.getByRole('button', { name: 'Save custom theme' }).click();
  await page.locator('#theme-dialog [data-close]').click();
  await page.getByRole('button', { name: 'Document settings', exact: true }).click();
  await page.locator('#palette-json').fill('[]');
  await page
    .locator('#document-settings-dialog')
    .getByRole('button', { name: 'Save settings', exact: true })
    .click();
  await expect(page.locator('#notice')).toHaveText('Colors must be a JSON object.');
  await expect(page.locator('#document-settings-dialog')).toBeVisible();
  await page
    .locator('#palette-json')
    .fill('{"accent":"#ff0000","background":"#ffffff","surface":"#ffffff","text":"#111111"}');
  await page
    .locator('#document-settings-dialog')
    .getByRole('button', { name: 'Save settings', exact: true })
    .click();
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

test('formats HTML and manages separate documents', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  await page.locator('#name-input').fill('Second');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await setSource(page, '<section><h1>Hello</h1><p>Second document</p></section>');
  await page.evaluate(() =>
    window.monaco.editor.getEditors()[0].setPosition({ lineNumber: 1, column: 3 }),
  );
  await page.getByRole('button', { name: /Format/ }).click();
  await expect
    .poll(() => page.evaluate(() => window.monaco.editor.getModels()[0].getValue()))
    .toContain('\n');
  expect(await page.evaluate(() => window.monaco.editor.getEditors()[0].getPosition())).toEqual({
    lineNumber: 1,
    column: 3,
  });
  await page.getByRole('button', { name: '◇ Welcome.html', exact: true }).click();
  await expect(page.frameLocator('#preview').locator('h1')).toContainText('Start with an idea.');
  await page.getByRole('button', { name: '◇ Second.html', exact: true }).click();
  await expect(page.frameLocator('#preview').locator('h1')).toHaveText('Hello');
});

test('document settings stay with each document and separate from workspace preferences', async ({
  page,
}) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const workspaceSettings = page.locator('#settings-dialog');
  await expect(
    workspaceSettings.getByLabel('Include Tailwind base styles (Preflight)'),
  ).toHaveCount(0);
  await expect(workspaceSettings.getByLabel('Additional classes')).toHaveCount(0);
  await workspaceSettings.getByLabel('Editor font size').fill('16');
  await workspaceSettings.getByRole('button', { name: 'Save settings', exact: true }).click();

  const gear = page.getByRole('button', { name: 'Document settings', exact: true });
  const documentSettings = page.getByRole('dialog', { name: 'Document settings', exact: true });
  await gear.click();
  await expect(documentSettings.locator('#document-settings-name')).toHaveText('Welcome.html');
  const firstColors = JSON.parse(
    await documentSettings.getByLabel('Color names and hex values').inputValue(),
  );
  firstColors.brand = '#ff0000';
  await documentSettings.getByLabel('Color names and hex values').fill(JSON.stringify(firstColors));
  await documentSettings.getByLabel('Include Tailwind base styles (Preflight)').uncheck();
  await documentSettings.getByLabel('Additional classes').fill('hidden');
  await documentSettings.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.locator('#compile-status')).toContainText('Live preview');

  await page.getByRole('button', { name: 'New document', exact: true }).click();
  await page.locator('#name-input').fill('Second');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await gear.click();
  await expect(documentSettings.locator('#document-settings-name')).toHaveText('Second.html');
  await expect(
    documentSettings.getByLabel('Include Tailwind base styles (Preflight)'),
  ).toBeChecked();
  await expect(documentSettings.getByLabel('Additional classes')).toHaveValue('');
  const secondColors = JSON.parse(
    await documentSettings.getByLabel('Color names and hex values').inputValue(),
  );
  expect(secondColors.accent).toBe('#0f766e');
  secondColors.brand = '#0000ff';
  await documentSettings
    .getByLabel('Color names and hex values')
    .fill(JSON.stringify(secondColors));
  await documentSettings.getByLabel('Additional classes').fill('block');
  await documentSettings.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.locator('#document-list button').filter({ hasText: 'Welcome.html' }).click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await gear.click();
  await expect(
    documentSettings.getByLabel('Include Tailwind base styles (Preflight)'),
  ).not.toBeChecked();
  await expect(documentSettings.getByLabel('Additional classes')).toHaveValue('hidden');
  expect(
    JSON.parse(await documentSettings.getByLabel('Color names and hex values').inputValue()).brand,
  ).toBe('#ff0000');
  await page.screenshot({ path: 'test-results/document-settings-desktop.png', fullPage: true });
  await documentSettings.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(workspaceSettings.getByLabel('Editor font size')).toHaveValue('16');
  await workspaceSettings.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#document-list button').filter({ hasText: 'Second.html' }).click();
  await gear.click();
  await expect(documentSettings.getByLabel('Additional classes')).toHaveValue('block');
  expect(
    JSON.parse(await documentSettings.getByLabel('Color names and hex values').inputValue()).brand,
  ).toBe('#0000ff');
  await documentSettings.getByRole('button', { name: 'Close', exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await gear.click();
  await expect(documentSettings).toBeVisible();
  await page.screenshot({ path: 'test-results/document-settings-mobile.png', fullPage: true });
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
