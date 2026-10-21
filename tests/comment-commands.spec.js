import { test, expect } from '@playwright/test';

test('comment commands route arguments, scope siblings, and share the DOM across mixed inputs', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { runTransformations } = await import('./app/Services/Transformations.js');
    return runTransformations(
      '<section><p>Before</p><!-- mark: .card > span, [title="two words"]; --><div><span>Nested</span></div>tail<p>After</p></section><aside>Outside</aside>',
      [
        { name: 'Remember', kind: 'dom', code: 'document.saved = document.querySelector("section");' },
        { name: 'Mark', kind: 'comment', command: 'mark', target: 'preview', code: `
          await Promise.resolve();
          if (document.saved !== comment.parentElement) throw new Error('Reparsed');
          if (args !== '.card > span, [title="two words"]') throw new Error('Wrong args');
          if (elements.map(el => el.localName).join(',') !== 'div,p') throw new Error('Wrong scope');
          if (nodes.length !== 3 || nodes[1].textContent !== 'tail') throw new Error('Missing text');
          for (const element of elements) element.setAttribute('data-stage', context.stage);
        ` },
        { name: 'String boundary', kind: 'string', code: 'return code.replace("After", "Changed");' },
        { name: 'No rerun', kind: 'comment', command: 'mark', code: 'throw new Error("Ran twice");' },
      ], {}, 2,
    );
  });
  expect(result.code).toBe('<section><p>Before</p><div data-stage="preview"><span>Nested</span></div>tail<p data-stage="preview">Changed</p></section><aside>Outside</aside>');
  expect(result.checkpoint).toContain('>After</p>');
  expect(result.checkpoint).not.toContain('<!-- mark:');
});

test('comment command traversal tolerates wrapping, nested commands, and detached comments', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { runTransformations } = await import('./app/Services/Transformations.js');
    return runTransformations(
      '<!doctype html><html><head><!-- stamp: head; --><title>Title</title></head><body><!-- group: h2; --><p>Before</p><h2>One</h2>text<section><!-- stamp: nested; --><b>Nested</b></section><h2>Two</h2><p>Last</p><aside><!-- stamp: removed; --><i>Gone</i></aside></body></html>',
      [
        { name: 'Group', kind: 'comment', command: 'group', code: `
          let wrapper;
          for (const node of nodes) {
            if (node.nodeType === 1 && node.matches(args)) {
              wrapper = document.createElement('div');
              comment.parentElement.insertBefore(wrapper, node);
            }
            if (wrapper) wrapper.append(node);
          }
        ` },
        { name: 'Stamp', kind: 'comment', command: 'stamp', code: `
          document.querySelector('aside')?.remove();
          elements.forEach(el => el.setAttribute('data-stamp', args));
        ` },
      ],
    );
  });
  expect(result.code).toContain('<title data-stamp="head">Title</title>');
  expect(result.code).toContain('<p>Before</p><div><h2>One</h2>text<section><b data-stamp="nested">Nested</b></section></div><div><h2>Two</h2><p>Last</p></div>');
  expect(result.code).not.toContain('<!--');
  expect(result.code).not.toContain('Gone');
});

test('unknown or malformed commands remain and handler failures reject the pipeline', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { runTransformations } = await import('./app/Services/Transformations.js');
    const input = '<!-- other: x; --><!-- act: missing --><!-- act: x; extra --><!-- Act: x; --><p>Safe</p>';
    const unchanged = await runTransformations(input, [{ name: 'Act', kind: 'comment', command: 'act', code: 'throw new Error("Unexpected invocation");' }]);
    const failures = [];
    for (const code of ['elements[0].remove(); throw new Error("Failed");', 'return "HTML";']) {
      try {
        await runTransformations('<!-- act: ; --><p>Safe</p>', [{ name: 'Act', kind: 'comment', command: 'act', code }]);
      } catch (error) { failures.push(error.message); }
    }
    return { input, unchanged, failures };
  });
  expect(result.unchanged.code).toBe(result.input);
  expect(result.failures[0]).toContain('Act: Failed. No changes were applied.');
  expect(result.failures[1]).toContain('must not return a value');
});

for (const target of ['editor', 'preview']) {
test(`comment commands automatically run in ${target} with only supported controls`, async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.getByRole('button', { name: 'Transformations', exact: true }).click();
  await page.getByRole('button', { name: '+ Add transformation' }).click();
  await page.getByRole('combobox', { name: 'Transformation input' }).selectOption('comment');
  await expect(page.locator('[data-field="target"] option')).toHaveText(['Editor', 'Preview + export']);
  await expect(page.getByRole('combobox', { name: 'Transformation trigger' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Run once', exact: true })).not.toBeVisible();
  await page.getByRole('textbox', { name: 'Command prefix' }).fill('mark');
  await page.getByRole('combobox', { name: 'Transformation stage' }).selectOption(target);
  await page.getByRole('textbox', { name: 'Transformation code' }).fill('elements.forEach(el => { el.className = args; el.textContent += "!"; });');
  await page.getByRole('checkbox', { name: 'Enable transformation' }).check();
  await page.locator('#transform-dialog [data-close]').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.evaluate(() => window.monaco.editor.getModels()[0].setValue('<!-- mark: flex; --><p>Hello</p>'));
  await page.getByRole('button', { name: 'Transformations', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Transformation input' })).toHaveValue('comment');
  await expect(page.getByRole('textbox', { name: 'Command prefix' })).toHaveValue('mark');
  await page.locator('#transform-dialog [data-close]').click();
  const source = target === 'editor' ? '<p class="flex">Hello!</p>' : '<!-- mark: flex; --><p>Hello</p>';
  await expect.poll(() => page.evaluate(() => window.monaco.editor.getModels()[0].getValue())).toBe(source);
  await expect(page.frameLocator('#preview').locator('p')).toHaveText(['Hello!']);
  expect(await page.locator('#preview').getAttribute('srcdoc')).not.toContain('<!-- mark:');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
  const output = await page.locator('#export-source').inputValue();
  expect(output).toContain('<p class="flex">Hello!</p>');
  expect(output).not.toContain('<!-- mark:');
  expect(await page.evaluate(() => window.monaco.editor.getModels()[0].getValue())).toBe(source);
  const imported = await page.evaluate(async () => {
    const { loadWorkspace, validateTransformations } = await import('./app/Models/Workspace.js');
    const { workspace } = await loadWorkspace();
    return validateTransformations(JSON.parse(JSON.stringify(workspace.transformations)))[0];
  });
  expect(imported).toMatchObject({ kind: 'comment', command: 'mark', mode: 'auto', target });
});
}

test('legacy comment settings normalize and other transform controls remain available', async ({ page }) => {
  await page.goto('./');
  const targets = await page.evaluate(async () => {
    const { validateTransformations } = await import('./app/Models/Workspace.js');
    return validateTransformations(['editor', 'preview', 'export'].map(target => ({
      name: 'Legacy', code: '', kind: 'comment', command: 'mark', mode: 'manual', target,
    }))).map(({ mode, target }) => ({ mode, target }));
  });
  expect(targets).toEqual([
    { mode: 'auto', target: 'editor' },
    { mode: 'auto', target: 'preview' },
    { mode: 'auto', target: 'preview' },
  ]);
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.getByRole('button', { name: 'Transformations', exact: true }).click();
  await page.getByRole('button', { name: '+ Add transformation' }).click();
  const kind = page.getByRole('combobox', { name: 'Transformation input' });
  await kind.selectOption('comment');
  await expect(page.getByRole('textbox', { name: 'Command prefix' })).toHaveValue('add-classes');
  const sample = await page.getByRole('textbox', { name: 'Transformation code' }).inputValue();
  const sampleOutput = await page.evaluate(async (code) => {
    const { runTransformations } = await import('./app/Services/Transformations.js');
    return runTransformations('<!-- add-classes: flex gap-4; --><p class="existing">One</p><p>Two</p>', [
      { name: 'Sample', kind: 'comment', command: 'add-classes', code },
    ]);
  }, sample);
  expect(sampleOutput.code).toBe('<p class="existing flex gap-4">One</p><p class="flex gap-4">Two</p>');
  await expect(page.getByRole('combobox', { name: 'Transformation stage' })).toHaveValue('preview');
  await kind.selectOption('dom');
  await expect(page.locator('[data-field="target"] option')).toHaveText(['Editor', 'Preview + export', 'Export only']);
  await expect(page.getByRole('combobox', { name: 'Transformation trigger' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run once', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Transformation code' }).fill('// My custom handler');
  await kind.selectOption('comment');
  await expect(page.getByRole('textbox', { name: 'Transformation code' })).toHaveValue('// My custom handler');
});
