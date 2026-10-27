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
      createdAt: i === 1 ? null : 1700000000000 + ((i + 3) % 9) * 86400000,
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
    await expect(page.locator('#document-list .document-item')).toHaveCount(6);
    await expect(page.locator('#document-list .document-item').first()).toContainText('Document 8');
    await page.locator('[data-action="library"]').click();
    const library = page.locator('#library-dialog');
    await expect(library).toBeVisible();
    await expect(page.locator('#library-results li')).toHaveCount(9);
    await expect(page.locator('#library-results .library-document-updated time')).toHaveCount(9);
    await expect(page.locator('#library-results .library-document-created time')).toHaveCount(8);
    await page.locator('#library-sort').selectOption('created-newest');
    await expect(page.locator('#library-results li').first()).toContainText('Document 5');
    await expect(page.locator('#library-results li').last()).toContainText('Document 1');
    await expect(page.locator('#library-results li').last()).toContainText('Created: unknown');
    await page.locator('#library-sort').selectOption('created-oldest');
    await expect(page.locator('#library-results li').first()).toContainText('Document 6');
    await expect(page.locator('#library-results li').last()).toContainText('Document 1');
    await page.locator('#library-sort').selectOption('recent');
    await expect(page.locator('#library-search')).toBeFocused();
    await expect(page.locator('#library-search-note')).toBeEmpty();
    await page.locator('#library-search').fill('Markting');
    await expect(page.locator('#library-results li')).toHaveCount(1);
    await expect(page.locator('#library-results')).toContainText('Marketing');
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
    const marketing = page.locator('#library-results li').filter({ hasText: 'Marketing' });
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
    await expect(page.locator('#document-list .document-item').first()).toContainText('Marketing');
    await expect(page.locator('#document-list .document-item').first()).toHaveAccessibleDescription('Landing pages');
    await expect(page.locator('#document-list .document-folder').first()).toHaveText('Landing pages');
    await expect(page.locator('#save-status')).toHaveText('All changes saved');
    await page.reload();
    await expect(page.locator('#compile-status')).toContainText('Live preview');
    await expect(page.locator('#document-list .document-item').first()).toContainText('Marketing');
    await page.locator('[data-action="library"]').click();
    await page.locator('#library-folders button').filter({ hasText: 'Landing pages' }).click();
    await expect(page.locator('#library-results li')).toHaveCount(1);
    await expect(marketing.getByRole('combobox')).toHaveValue(/.+/);
    await page.locator('#library-new-document').click();
    await page.locator('#name-input').fill('New landing');
    await page.locator('#name-form button[type="submit"]').click();
    await expect(library).not.toBeVisible();
    await expect(page.locator('#document-name')).toHaveText('New landing');
    await page.locator('[data-action="library"]').click();
    await page.locator('#library-folders button').filter({ hasText: 'Landing pages' }).click();
    await expect(page.locator('#library-results li')).toHaveCount(2);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#library-delete-folder').click();
    await expect(page.locator('#library-folder-title')).toHaveText('Unfiled');
    await expect(page.locator('#library-results li')).toHaveCount(10);
    await expect(marketing.getByRole('combobox')).toHaveValue('');
    await expect(page.locator('#document-list .document-folder').first()).toHaveText('Unfiled');
  });
}

test('library dates display padded local dates with 12-hour times and no seconds', async ({ page }) => {
  await page.goto('./preview.html');
  await page.evaluate(async () => {
    const { newWorkspace, newDocument } = await import('./config/editor.js');
    const { saveWorkspace } = await import('./app/Models/Workspace.js');
    const workspace = newWorkspace();
    workspace.documents = [0, 9, 12, 21].map((hour) => ({
      ...newDocument(`Hour ${hour}`, '<p>Dates</p>'),
      createdAt: new Date(2026, 0, 2, hour, 5, 59).getTime(),
      lastEditedAt: new Date(2026, 0, 3, hour, 7, 33).getTime(),
    }));
    workspace.activeId = workspace.documents[0].id;
    await saveWorkspace(workspace);
  });
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.locator('[data-action="library"]').click();
  for (const [hour, displayHour] of [[0, '12:05am'], [9, '09:05am'], [12, '12:05pm'], [21, '09:05pm']]) {
    const entry = page.locator('#library-results li').filter({ hasText: `Hour ${hour}` });
    await expect(entry.locator('.library-document-created time')).toBeVisible();
    await expect(entry.locator('.library-document-dates')).toHaveText(
      `Created: 2026-01-02 ${displayHour} · Updated: 2026-01-03 ${displayHour.replace(':05', ':07')}`,
    );
  }
});

test('library edit times survive reloads and opening a document does not change them', async ({ page }) => {
  await seed(page);
  await page.locator('[data-action="library"]').click();
  const marketing = page.locator('#library-results li').filter({ hasText: 'Marketing' });
  const updatedTime = marketing.locator('.library-document-updated time');
  const createdTime = marketing.locator('.library-document-created time');
  const created = await createdTime.getAttribute('datetime');
  const original = await updatedTime.getAttribute('datetime');
  await expect(updatedTime).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(am|pm)$/);
  await expect(marketing.locator('.library-document-dates')).toHaveText(/^Created: \d{4}-\d{2}-\d{2} \d{2}:\d{2}(am|pm) · Updated: \d{4}-\d{2}-\d{2} \d{2}:\d{2}(am|pm)$/);
  await marketing.locator('.library-document-open').click();
  await page.locator('[data-action="library"]').click();
  await expect(updatedTime).toHaveAttribute('datetime', original);
  await page.locator('#library-dialog [data-close]').click();
  await page.waitForFunction(() => window.monaco?.editor.getModels().length > 0);
  await page.evaluate(() => window.monaco.editor.getModels()[0].setValue('<p>Edited document</p>'));
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.locator('[data-action="library"]').click();
  const edited = await updatedTime.getAttribute('datetime');
  expect(new Date(edited).getTime()).toBeGreaterThan(new Date(original).getTime());
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.locator('[data-action="library"]').click();
  await expect(updatedTime).toHaveAttribute('datetime', edited);
  await expect(createdTime).toHaveAttribute('datetime', created);
});

test('library remains usable when the search CDN fails', async ({ page }) => {
  await page.route('**/fuse.js@*/**', (route) => route.abort());
  await seed(page);
  await page.locator('[data-action="library"]').click();
  await expect(page.locator('#library-search-note')).toContainText('Basic search available');
  await page.locator('#library-search').fill('marketing');
  await expect(page.locator('#library-results li')).toHaveCount(1);
  await page.locator('.library-document-open').click();
  await expect(page.locator('#document-name')).toHaveText('Marketing');
});

test('imported folder IDs cannot collide with built-in library filters', async ({ page }) => {
  await seed(page, [{ id: 'all', name: 'Pages' }, { id: 'unfiled', name: 'Components' }]);
  await page.locator('[data-action="library"]').click();
  await expect(page.locator('#library-results li')).toHaveCount(9);
  await expect(page.locator('#library-rename-folder')).toBeHidden();
  await page.locator('#library-folders button').filter({ hasText: 'Pages' }).click();
  await expect(page.locator('#library-results li')).toHaveCount(1);
  await expect(page.locator('#library-results')).toContainText('Marketing');
  await page.locator('#library-folders button').filter({ hasText: 'Components' }).click();
  await expect(page.locator('#library-results li')).toHaveCount(1);
  await expect(page.locator('#library-results')).toContainText('Document 1');
  await page.locator('#library-folders button').filter({ hasText: 'Unfiled' }).click();
  await expect(page.locator('#library-results li')).toHaveCount(7);
  await expect(page.locator('#library-rename-folder')).toBeHidden();
});

test('library renames and deletes documents while keeping a valid active document', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.locator('[data-action="library"]').click();
  await page.getByRole('button', { name: 'Rename Welcome', exact: true }).click();
  await page.getByLabel('Document name', { exact: true }).fill('Home.HTM');
  await page.locator('#name-form button[type="submit"]').click();
  await expect(page.locator('#document-name')).toHaveText('Home');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Home', exact: true }).click();
  await expect(page.locator('#library-results li')).toHaveCount(1);
  await expect(page.locator('#document-name')).toHaveText('Untitled');
  await page.locator('#library-dialog [data-close]').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await expect(page.locator('#document-name')).toHaveText('Untitled');
});
