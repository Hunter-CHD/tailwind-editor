import { test, expect } from '@playwright/test';

async function seed(page, folders = []) {
  await page.goto('./preview.html');
  await page.evaluate(async (folders) => {
    const { newWorkspace, newDocument } = await import('./config/editor.js');
    const { saveWorkspace } = await import('./app/Models/Workspace.js');
    const workspace = newWorkspace();
    workspace.documents = Array.from({ length: 9 }, (_, i) => ({
      ...newDocument(i === 0 ? 'Marketing.html' : `Document ${i}.html`, `<p>Document ${i}</p>`),
      lastOpenedAt: i,
    }));
    workspace.activeId = workspace.documents[8].id;
    workspace.folders = folders;
    folders.forEach((folder, i) => { workspace.documents[i].folderId = folder.id; });
    await saveWorkspace(workspace);
  }, folders);
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
}

for (const mobile of [false, true]) {
  test(`document library organizes, searches, and persists documents on ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    await expect(page.locator('#document-list button')).toHaveCount(6);
    await expect(page.locator('#document-list button').first()).toContainText('Document 8.html');
    await page.locator('[data-action="library"]').click();
    const library = page.locator('#library-dialog');
    await expect(library).toBeVisible();
    await expect(page.locator('#library-results li')).toHaveCount(9);
    await expect(page.locator('#library-search')).toBeFocused();
    await expect(page.locator('#library-search-note')).toBeEmpty();
    await page.locator('#library-search').fill('Markting');
    await expect(page.locator('#library-results li')).toHaveCount(1);
    await expect(page.locator('#library-results')).toContainText('Marketing.html');
    await page.locator('#library-search').fill('nothing-like-this');
    await expect(page.locator('#library-empty')).toContainText('No matching documents');
    await page.locator('#library-search').fill('');

    await page.locator('#library-new-folder').click();
    await page.getByLabel('Folder name', { exact: true }).fill('Campaigns');
    await page.locator('#name-form button[type="submit"]').click();
    await expect(page.locator('#library-folder-title')).toHaveText('Campaigns');
    await expect(page.locator('#library-results li')).toHaveCount(0);
    await page.locator('#library-rename-folder').click();
    await page.getByLabel('Folder name', { exact: true }).fill('Landing pages');
    await page.locator('#name-form button[type="submit"]').click();
    await page.locator('#library-folders button').filter({ hasText: 'All documents' }).click();
    const marketing = page.locator('#library-results li').filter({ hasText: 'Marketing.html' });
    await marketing.getByRole('combobox').selectOption({ label: 'Landing pages' });
    await page.locator('#library-search').fill('Landing pages');
    await expect(page.locator('#library-results li')).toHaveCount(1);
    await page.locator('#library-search').fill('');
    await page.locator('#library-folders button').filter({ hasText: 'Landing pages' }).click();
    await expect(page.locator('#library-results li')).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath('library.png') });
    const dimensions = await library.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      viewport: window.innerWidth,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await marketing.locator('.library-document-open').click();
    await expect(library).not.toBeVisible();
    await expect(page.locator('#document-list button').first()).toContainText('Marketing.html');
    await expect(page.locator('#save-status')).toHaveText('All changes saved');
    await page.reload();
    await expect(page.locator('#compile-status')).toContainText('Live preview');
    await expect(page.locator('#document-list button').first()).toContainText('Marketing.html');
    await page.locator('[data-action="library"]').click();
    await page.locator('#library-folders button').filter({ hasText: 'Landing pages' }).click();
    await expect(page.locator('#library-results li')).toHaveCount(1);
    await expect(marketing.getByRole('combobox')).toHaveValue(/.+/);
    await page.locator('#library-new-document').click();
    await page.locator('#name-input').fill('New landing');
    await page.locator('#name-form button[type="submit"]').click();
    await expect(library).not.toBeVisible();
    await expect(page.locator('#document-name')).toHaveText('New landing.html');
    await page.locator('[data-action="library"]').click();
    await page.locator('#library-folders button').filter({ hasText: 'Landing pages' }).click();
    await expect(page.locator('#library-results li')).toHaveCount(2);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#library-delete-folder').click();
    await expect(page.locator('#library-folder-title')).toHaveText('Unfiled');
    await expect(page.locator('#library-results li')).toHaveCount(10);
    await expect(marketing.getByRole('combobox')).toHaveValue('');
  });
}

test('library remains usable when the search CDN fails', async ({ page }) => {
  await page.route('**/fuse.js@*/**', (route) => route.abort());
  await seed(page);
  await page.locator('[data-action="library"]').click();
  await expect(page.locator('#library-search-note')).toContainText('Basic search available');
  await page.locator('#library-search').fill('marketing');
  await expect(page.locator('#library-results li')).toHaveCount(1);
  await page.locator('.library-document-open').click();
  await expect(page.locator('#document-name')).toHaveText('Marketing.html');
});

test('imported folder IDs cannot collide with built-in library filters', async ({ page }) => {
  await seed(page, [{ id: 'all', name: 'Pages' }, { id: 'unfiled', name: 'Components' }]);
  await page.locator('[data-action="library"]').click();
  await expect(page.locator('#library-results li')).toHaveCount(9);
  await expect(page.locator('#library-rename-folder')).toBeHidden();
  await page.locator('#library-folders button').filter({ hasText: 'Pages' }).click();
  await expect(page.locator('#library-results li')).toHaveCount(1);
  await expect(page.locator('#library-results')).toContainText('Marketing.html');
  await page.locator('#library-folders button').filter({ hasText: 'Components' }).click();
  await expect(page.locator('#library-results li')).toHaveCount(1);
  await expect(page.locator('#library-results')).toContainText('Document 1.html');
  await page.locator('#library-folders button').filter({ hasText: 'Unfiled' }).click();
  await expect(page.locator('#library-results li')).toHaveCount(7);
  await expect(page.locator('#library-rename-folder')).toBeHidden();
});

test('library renames and deletes documents while keeping a valid active document', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.locator('[data-action="library"]').click();
  await page.getByRole('button', { name: 'Rename Welcome.html', exact: true }).click();
  await page.locator('#name-input').fill('Home');
  await page.locator('#name-form button[type="submit"]').click();
  await expect(page.locator('#document-name')).toHaveText('Home.html');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Home.html', exact: true }).click();
  await expect(page.locator('#library-results li')).toHaveCount(1);
  await expect(page.locator('#document-name')).toHaveText('Untitled.html');
  await page.locator('#library-dialog [data-close]').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await expect(page.locator('#document-name')).toHaveText('Untitled.html');
});
