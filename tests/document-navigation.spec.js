import { test, expect } from '@playwright/test';

async function seed(page) {
  await page.goto('./preview.html');
  await page.evaluate(async () => {
    const { newWorkspace, newDocument } = await import('./config/editor.js');
    const { saveWorkspace } = await import('./app/Models/Workspace.js');
    const workspace = newWorkspace();
    workspace.documents = Array.from({ length: 9 }, (_, i) => ({
      ...newDocument(`Doc ${i}`, `<p>Document ${i}</p>`), lastOpenedAt: i + 1,
    }));
    workspace.activeId = workspace.documents[8].id;
    await saveWorkspace(workspace);
  });
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
}

const names = (page, list = '#document-list') => page.locator(`${list} .document-item-name`).allTextContents();
const openLibrary = (page) => page.locator('[data-action="library"]').click();
const openFromLibrary = (page, name) => page.locator('#library-results .library-document-open').filter({ hasText: name }).click();
async function sidebarAction(page, name, action) {
  await page.locator('#documents-sidebar').getByRole('button', { name: `◇ ${name}`, exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

test('recent targets stay stable during a session while library sorting and next-session order track recency', async ({ page }) => {
  await seed(page);
  await expect(page.locator('#pinned-section')).toBeHidden();
  const initial = await names(page);
  expect(initial).toEqual(['Doc 8', 'Doc 7', 'Doc 6', 'Doc 5', 'Doc 4', 'Doc 3']);
  for (const name of ['Doc 5', 'Doc 7']) {
    const button = page.locator('#document-list .document-item').filter({ hasText: name });
    await button.click();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-current', 'true');
    expect(await names(page)).toEqual(initial);
  }
  await openLibrary(page);
  await expect(page.locator('#library-results .library-document-open').first()).toContainText('Doc 7');
  await openFromLibrary(page, 'Doc 5');
  expect(await names(page)).toEqual(initial);
  await openLibrary(page);
  await openFromLibrary(page, 'Doc 0');
  expect(await names(page)).toEqual(['Doc 0', ...initial.slice(0, 5)]);
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  expect((await names(page)).slice(0, 2)).toEqual(['Doc 0', 'Doc 5']);
});

test('pins have their own stable section, persist, and can be managed in the sidebar or library', async ({ page }) => {
  await seed(page);
  await sidebarAction(page, 'Doc 8', 'Pin document');
  await sidebarAction(page, 'Doc 7', 'Pin document');
  await expect(page.locator('#pinned-section')).toBeVisible();
  expect(await names(page, '#pinned-list')).toEqual(['Doc 8', 'Doc 7']);
  expect(await names(page)).toEqual(['Doc 6', 'Doc 5', 'Doc 4', 'Doc 3', 'Doc 2', 'Doc 1']);
  await page.locator('#pinned-list .document-item').filter({ hasText: 'Doc 7' }).click();
  expect(await names(page, '#pinned-list')).toEqual(['Doc 8', 'Doc 7']);
  await openLibrary(page);
  await page.locator('#library-dialog').getByRole('button', { name: 'Pin Doc 0', exact: true }).click();
  await page.locator('#library-dialog [data-close]').click();
  expect(await names(page, '#pinned-list')).toEqual(['Doc 8', 'Doc 7', 'Doc 0']);
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  expect(await names(page, '#pinned-list')).toEqual(['Doc 8', 'Doc 7', 'Doc 0']);
  await page.screenshot({ path: test.info().outputPath('pinned-desktop.png') });
  for (const name of ['Doc 8', 'Doc 7', 'Doc 0'])
    await sidebarAction(page, name, 'Unpin document');
  await expect(page.locator('#pinned-section')).toBeHidden();
  expect((await names(page))[0]).toBe('Doc 0');
  await sidebarAction(page, 'Doc 0', 'Pin document');
  await openLibrary(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#library-dialog').getByRole('button', { name: 'Delete Doc 0', exact: true }).click();
  await page.locator('#library-dialog [data-close]').click();
  await expect(page.locator('#pinned-section')).toBeHidden();
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await expect(page.locator('#pinned-section')).toBeHidden();
});

test('sidebar context actions target the clicked document without opening it first', async ({ page }) => {
  await seed(page);
  await expect(page.locator('.document-pin')).toHaveCount(0);
  await sidebarAction(page, 'Doc 5', 'Pin document');
  await expect(page.locator('#document-name')).toHaveText('Doc 8');
  await sidebarAction(page, 'Doc 5', 'Rename');
  await expect(page.locator('#name-input')).toHaveValue('Doc 5');
  await page.locator('#name-input').fill('Renamed');
  await page.locator('#name-form button[type="submit"]').click();
  expect(await names(page, '#pinned-list')).toEqual(['Renamed']);
  await expect(page.locator('#document-name')).toHaveText('Doc 8');
  await sidebarAction(page, 'Renamed', 'Duplicate');
  await expect(page.locator('#document-name')).toHaveText('Renamed copy');
  await expect(page.frameLocator('#preview').locator('p')).toHaveText('Document 5');
  page.once('dialog', (dialog) => dialog.accept());
  await sidebarAction(page, 'Renamed', 'Delete');
  await expect(page.locator('#document-name')).toHaveText('Renamed copy');
  await expect(page.locator('#pinned-section')).toBeHidden();
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await expect(page.locator('#document-name')).toHaveText('Renamed copy');
  await expect(page.locator('#pinned-section')).toBeHidden();
});

test('sidebar context menu supports keyboard navigation, dismissal, and native menus elsewhere', async ({ page }) => {
  await seed(page);
  const target = page.locator('#document-list .document-item').filter({ hasText: 'Doc 6' });
  await target.focus();
  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Pin document', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Rename', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(target).toBeFocused();
  await target.click({ button: 'right' });
  await page.screenshot({ path: test.info().outputPath('document-menu.png') });
  await page.locator('.document-toolbar').click({ button: 'right' });
  await expect(menu).toBeHidden();
  expect(await page.locator('.document-toolbar').evaluate((element) => element.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
  ))).toBe(true);
  await page.keyboard.press('Escape');
  await target.click({ button: 'right' });
  await page.locator('.app-header').click();
  await expect(menu).toBeHidden();
});

test('deleting the last document through the context menu creates a usable replacement', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  page.once('dialog', (dialog) => dialog.accept());
  await sidebarAction(page, 'Welcome', 'Delete');
  await expect(page.locator('#document-name')).toHaveText('Untitled');
  await expect(page.locator('#document-list .document-item')).toHaveCount(1);
  await expect(page.locator('#compile-status')).toContainText('Live preview');
});

test('mobile navigation keeps the active pinned document and library controls usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await openLibrary(page);
  await page.locator('#library-dialog').getByRole('button', { name: 'Pin Doc 8', exact: true }).click();
  await page.locator('#library-dialog [data-close]').click();
  await expect(page.locator('#pinned-list .document-item[aria-current="true"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New document', exact: true })).toBeVisible();
  const newButton = await page.getByRole('button', { name: 'New document', exact: true }).boundingBox();
  const sidebar = await page.locator('.sidebar-documents').boundingBox();
  expect(newButton.x + newButton.width).toBeLessThanOrEqual(sidebar.x + sidebar.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('pinned-mobile.png') });
  await openLibrary(page);
  await openFromLibrary(page, 'Doc 7');
  await expect(page.locator('#document-list .document-item[aria-current="true"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
