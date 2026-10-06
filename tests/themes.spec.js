import { test, expect } from '@playwright/test';

test('theme pickers open and reopen with fully opaque colors before any slider changes', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.getByRole('button', { name: 'Themes', exact: true }).click();
  const popup = page.locator('#theme-color-picker');
  for (const name of ['Background', 'Surface', 'Text', 'Accent', 'Background']) {
    const original = await page.getByLabel(name, { exact: true }).inputValue();
    await page
      .getByRole('button', { name: `Pick ${name.toLowerCase()} color`, exact: true })
      .click();
    const value = popup.getByRole('textbox', { name: `${name} color value`, exact: true });
    await expect(value).toBeVisible();
    await expect(value).toHaveValue(original);
    await expect(popup.locator('.color-picker')).toHaveCSS('--alpha', '100');
    // Selecting a format exposes the initial alpha without editing the color.
    await popup.getByRole('button', { name: 'Switch Color Format', exact: true }).click();
    await expect(value).toHaveValue(/^rgba\([^)]*,\s*1\)$/);
    await expect(popup.locator('.color-picker')).toHaveCSS('--alpha', '100');
    await expect(page.getByLabel(name, { exact: true })).toHaveValue(original);
    await popup.getByRole('button', { name: 'Close color picker', exact: true }).click();
  }
});

test('theme picker supports sliders, CSS colors, opaque saves, keyboard dismissal, and mobile layout', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.getByRole('button', { name: 'Themes', exact: true }).click();
  const popup = page.locator('#theme-color-picker');
  const originalBackground = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--background'),
  );
  await page.getByRole('button', { name: 'Pick background color', exact: true }).click();
  const value = popup.getByRole('textbox', { name: 'Background color value', exact: true });
  await expect(value).toBeVisible();
  await value.fill('#ff0000');
  await value.press('Tab');
  await expect(page.getByLabel('Background', { exact: true })).toHaveValue('#ff0000');
  const hue = popup.getByRole('slider', { name: 'Background hue', exact: true });
  await hue.press('Home');
  await hue.press('ArrowRight');
  await expect(page.getByLabel('Background', { exact: true })).not.toHaveValue('#ff0000');
  await popup.getByRole('button', { name: 'Switch Color Format', exact: true }).click();
  await expect(value).toHaveValue(/^rgba\(/);
  expect(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--background')),
  ).toBe(originalBackground);
  await value.focus();
  await value.press('Escape');
  await expect(popup).not.toBeVisible();
  await expect(page.locator('#theme-dialog')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pick background color', exact: true }),
  ).toBeFocused();

  for (const [name, input, expected] of [
    ['Background', 'rgb(16, 32, 48)', '#102030'],
    ['Surface', '#182838', '#182838'],
    ['Text', '#eeeeee', '#eeeeee'],
    ['Accent', 'rgba(255, 0, 128, 0)', '#ff0080'],
  ]) {
    await page
      .getByRole('button', { name: `Pick ${name.toLowerCase()} color`, exact: true })
      .click();
    const field = popup.getByRole('textbox', { name: `${name} color value`, exact: true });
    await field.fill(input);
    await field.press('Tab');
    await expect(page.getByLabel(name, { exact: true })).toHaveValue(expected);
    await expect(popup.locator('.color-picker')).toHaveCSS('--alpha', '100');
    await popup.getByRole('button', { name: 'Close color picker', exact: true }).click();
  }
  await expect(popup.locator('.color-picker')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save custom theme', exact: true }).click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await page.locator('#theme-dialog [data-close]').click();
  await page.reload();
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  expect(
    await page.evaluate(() =>
      ['background', 'surface', 'text', 'accent'].map((key) =>
        document.documentElement.style.getPropertyValue(`--${key}`),
      ),
    ),
  ).toEqual(['#102030', '#182838', '#eeeeee', '#ff0080']);
  await page.getByRole('button', { name: 'Themes', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Pick accent color', exact: true }).click();
  await expect(
    popup.getByRole('textbox', { name: 'Accent color value', exact: true }),
  ).toBeVisible();
  const box = await popup.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/theme-picker-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/theme-picker-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('theme hex inputs remain usable if the picker fails to load and invalid hex cannot be saved', async ({
  page,
}) => {
  await page.route('**/@yaireo/color-picker@0.15.1/dist/color-picker.es.js', (route) =>
    route.abort(),
  );
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  await page.getByRole('button', { name: 'Themes', exact: true }).click();
  await page.getByRole('button', { name: 'Pick background color', exact: true }).click();
  await expect(page.locator('.theme-picker-controls')).toContainText('Color picker could not load');
  await page.getByRole('button', { name: 'Close color picker', exact: true }).click();
  await page.getByLabel('Background', { exact: true }).fill('#zzzzzz');
  await page.getByRole('button', { name: 'Save custom theme', exact: true }).click();
  expect(
    await page.getByLabel('Background', { exact: true }).evaluate((input) => input.validity.valid),
  ).toBe(false);
  await page.getByLabel('Background', { exact: true }).fill('#123456');
  await page.getByRole('button', { name: 'Save custom theme', exact: true }).click();
  expect(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--background')),
  ).toBe('#123456');
});
