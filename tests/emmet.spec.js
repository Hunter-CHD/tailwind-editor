import { test, expect } from '@playwright/test';

async function openEditor(page) {
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.waitForFunction(() => window.monaco?.editor.getModels().length > 0);
  await page.evaluate(() => window.monaco.editor.getModels()[0].setValue(''));
  const input = page.locator('#editor .inputarea');
  await input.focus();
  return input;
}

const source = (page) => page.evaluate(() => window.monaco.editor.getModels()[0].getValue());

test('Emmet expands nested HTML with Tab and preserves undo and ordinary indentation', async ({
  page,
}) => {
  const input = await openEditor(page);
  const abbreviation = 'ul.list>li.item$*3';
  await input.pressSequentially(abbreviation);
  await expect(page.locator('#editor .suggest-widget.visible')).toBeVisible();
  await input.press('Tab');
  await expect.poll(() => source(page)).toContain('<ul class="list">');
  const expanded = await source(page);
  for (const number of [1, 2, 3]) expect(expanded).toContain(`<li class="item${number}"></li>`);
  expect(expanded).not.toContain('${');
  await input.press('Escape');
  await input.press('Control+z');
  await expect.poll(() => source(page)).toBe(abbreviation);
  await page.evaluate(() => window.monaco.editor.getModels()[0].setValue(''));
  await input.press('Escape');
  await input.press('Tab');
  await expect.poll(() => source(page)).toBe('  ');
});

test('Emmet snippet placeholders support Tab navigation', async ({ page }) => {
  const input = await openEditor(page);
  await input.pressSequentially('a');
  await expect(page.locator('#editor .suggest-widget.visible')).toBeVisible();
  await input.press('Tab');
  await expect.poll(() => source(page)).toBe('<a href=""></a>');
  await input.pressSequentially('https://example.com');
  await input.press('Tab');
  await input.pressSequentially('Example');
  await expect.poll(() => source(page)).toBe('<a href="https://example.com">Example</a>');
});

test('Monaco stays usable if the Emmet module cannot load', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/emmet-monaco-es@5.7.0/+esm', (route) => route.abort());
  const input = await openEditor(page);
  await expect(page.locator('.source-fallback')).toHaveCount(0);
  await input.pressSequentially('<h1>Still editable</h1>');
  await expect.poll(() => source(page)).toContain('Still editable');
  expect(errors).toEqual([]);
});
