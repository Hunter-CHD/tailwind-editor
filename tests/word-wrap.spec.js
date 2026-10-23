import { test, expect } from '@playwright/test';

for (const fallback of [false, true]) {
  test(`Alt+Z synchronizes and saves word wrap in ${fallback ? 'plain-text' : 'Monaco'} editing`, async ({ page }) => {
    if (fallback)
      await page.route('**/monaco-editor@0.45.0/min/vs/loader.js', (route) => route.abort());
    await page.goto('./');
    await expect(page.locator('#compile-status')).toContainText('Live preview');
    const wraps = () => page.evaluate((fallback) => fallback
      ? document.querySelector('.source-fallback').wrap === 'soft'
      : window.monaco.editor.getEditors()[0].getOption(window.monaco.editor.EditorOption.wordWrap) === 'on', fallback);
    expect(await wraps()).toBe(true);
    const source = `<p>${'Long line '.repeat(100)}</p>`;
    await page.evaluate(({ fallback, source }) => {
      if (fallback) {
        const input = document.querySelector('.source-fallback');
        input.value = source;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      } else {
        const editor = window.monaco.editor.getEditors()[0];
        editor.setValue(source);
        editor.focus();
      }
    }, { fallback, source });
    await page.keyboard.press('Alt+z');
    await expect.poll(wraps).toBe(false);
    expect(await page.evaluate((fallback) => fallback
      ? document.querySelector('.source-fallback').value
      : window.monaco.editor.getEditors()[0].getValue(), fallback)).toBe(source);
    await expect(page.locator('#save-status')).toHaveText('All changes saved');
    await page.reload();
    await expect(page.locator('#compile-status')).toContainText('Live preview');
    expect(await wraps()).toBe(false);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const checkbox = page.getByRole('checkbox', { name: 'Wrap long lines', exact: true });
    await expect(checkbox).not.toBeChecked();
    await page.keyboard.press('Alt+z');
    await expect(checkbox).toBeChecked();
    expect(await wraps()).toBe(true);
    await checkbox.uncheck();
    await page.locator('#settings-form button[type="submit"]').click();
    expect(await wraps()).toBe(false);
    await page.keyboard.press('Alt+z');
    await expect.poll(wraps).toBe(true);
  });
}
