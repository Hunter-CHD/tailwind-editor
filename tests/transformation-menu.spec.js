import { test, expect } from '@playwright/test';

async function openMenu(page) {
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.evaluate(async () => {
    const { loadWorkspace, saveWorkspace } = await import('./app/Models/Workspace.js');
    const { workspace } = await loadWorkspace();
    workspace.transformations = [
      { id: 'export-a', name: 'Export A', target: 'export' },
      { id: 'editor-a', name: 'Editor A', target: 'editor' },
      { id: 'preview-a', name: 'Preview A', target: 'preview' },
      { id: 'export-b', name: 'Export B', target: 'export' },
    ].map(item => ({ kind: 'dom', code: '// Original', enabled: false, mode: 'auto', ...item }));
    await saveWorkspace(workspace);
  });
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.getByRole('button', { name: 'Transformations', exact: true }).click();
}

test('grouped navigator edits one transform and preserves stage ordering, selection, and saved changes', async ({ page }) => {
  await openMenu(page);
  const nav = page.getByRole('navigation', { name: 'Transformations by stage' });
  const selectedName = page.getByRole('textbox', { name: 'Transformation name', exact: true });
  await expect(page.getByRole('textbox', { name: 'Transformation code', exact: true })).toHaveCount(1);
  await expect(selectedName).toHaveValue('Editor A');
  await expect(nav.getByRole('button', { name: /^Editor \(/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('button', { name: /^Preview \+ export/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('button', { name: /^Export only/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('button', { name: /Export B/ })).not.toBeVisible();
  await nav.getByRole('button', { name: /^Export only/ }).click();
  await nav.getByRole('button', { name: 'Export B', exact: false }).click();
  await selectedName.fill('Cleanup B');
  await expect(nav.getByRole('button', { name: /^Export only/ })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('textbox', { name: 'Transformation code', exact: true }).fill('// Edited B');
  await nav.getByRole('button', { name: 'Editor A', exact: false }).click();
  await expect(selectedName).toHaveValue('Editor A');
  await nav.getByRole('button', { name: 'Cleanup B', exact: false }).click();
  await expect(page.getByRole('textbox', { name: 'Transformation code', exact: true })).toHaveValue('// Edited B');
  await page.getByRole('button', { name: 'Move transformation up', exact: true }).click();
  await expect(selectedName).toHaveValue('Cleanup B');
  await expect(nav.locator('section[aria-label="Export only"] .transform-select')).toHaveText([
    'Cleanup BShared DOM · On export', 'Export AShared DOM · On export',
  ]);
  await expect(page.getByRole('button', { name: 'Move transformation up', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Transformation stage' }).selectOption('preview');
  await expect(nav.locator('section[aria-label="Preview + export"] .transform-select')).toHaveText([
    'Cleanup BShared DOM · Automatic', 'Preview AShared DOM · Automatic',
  ]);
  await page.getByRole('checkbox', { name: 'Enable transformation', exact: true }).check();
  await page.locator('#transform-dialog [data-close]').click();
  await page.getByRole('button', { name: 'Transformations', exact: true }).click();
  await expect(selectedName).toHaveValue('Cleanup B');
  await expect(nav.getByRole('button', { name: /^Preview \+ export/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('button', { name: /^Export only/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  const saved = await page.evaluate(async () => {
    const { loadWorkspace } = await import('./app/Models/Workspace.js');
    return (await loadWorkspace()).workspace.transformations;
  });
  expect(saved.map(item => item.id)).toEqual(['export-b', 'editor-a', 'preview-a', 'export-a']);
  expect(saved[0]).toMatchObject({ name: 'Cleanup B', code: '// Edited B', target: 'preview', enabled: true });
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(selectedName).toHaveValue('Preview A');
});

test('mobile navigator opens details, returns to selection, and fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMenu(page);
  const nav = page.getByRole('navigation', { name: 'Transformations by stage' });
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: /^Export only/ }).click();
  await nav.getByRole('button', { name: 'Export B', exact: false }).click();
  await expect(nav).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Transformation name', exact: true })).toHaveValue('Export B');
  await page.getByRole('checkbox', { name: 'Enable transformation', exact: true }).check();
  await page.getByRole('button', { name: 'All transformations', exact: false }).click();
  await expect(nav).toBeVisible();
  await expect(nav.locator('[aria-current="true"]')).toBeFocused();
  await expect(nav.getByRole('checkbox', { name: 'Enable transformation', exact: true })).toBeChecked();
  await page.getByRole('button', { name: '+ Add transformation' }).click();
  await expect(nav).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Transformation name', exact: true })).toHaveValue('Remove editor metadata');
  const fits = await page.locator('#transform-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth);
  expect(fits).toBe(true);
});
