import { test, expect } from '@playwright/test';

async function openEditor(page) {
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.waitForFunction(() => window.monaco?.editor.getModels().length > 0);
}

test('collapsing documents expands Monaco and preview, persists, and can be restored by keyboard', async ({
  page,
}) => {
  await openEditor(page);
  const editorWidth = (await page.locator('#editor').boundingBox()).width;
  const previewWidth = (await page.locator('#preview').boundingBox()).width;
  const monacoWidth = (await page.locator('#editor .monaco-editor').boundingBox()).width;
  const toggle = page.getByRole('button', { name: 'Hide documents', exact: true });
  await expect(toggle).toHaveAttribute('aria-controls', 'documents-sidebar');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Show documents', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.locator('#documents-sidebar')).toBeHidden();
  await expect
    .poll(async () => (await page.locator('#editor').boundingBox()).width)
    .toBeGreaterThan(editorWidth + 90);
  await expect
    .poll(async () => (await page.locator('#editor .monaco-editor').boundingBox()).width)
    .toBeGreaterThan(monacoWidth + 90);
  expect((await page.locator('#preview').boundingBox()).width).toBeGreaterThan(previewWidth + 90);
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await expect(page.locator('#documents-sidebar')).toBeHidden();
  const show = page.getByRole('button', { name: 'Show documents', exact: true });
  await page.screenshot({ path: 'test-results/sidebar-collapsed-desktop.png', fullPage: true });
  await show.focus();
  await show.press('Space');
  await expect(page.locator('#documents-sidebar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide documents', exact: true })).toBeFocused();
  await expect
    .poll(async () => (await page.locator('#editor').boundingBox()).width)
    .toBeCloseTo(editorWidth, 0);
  await expect(page.locator('#document-list .document-item')).toHaveCount(1);
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await expect(page.locator('#documents-sidebar')).toBeVisible();
});

test('the documents toggle stays usable without overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page);
  await page.getByRole('button', { name: 'Hide documents', exact: true }).click();
  await expect(page.locator('#documents-sidebar')).toBeHidden();
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#preview')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/sidebar-collapsed-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Show documents', exact: true }).click();
  await expect(page.locator('#documents-sidebar')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
