import { test, expect } from '@playwright/test';

for (const detached of [false, true]) {
  test(`${detached ? 'popout' : 'inline'} preview preserves scroll through edits and document switches`, async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#compile-status')).toContainText('Live preview');
    const source = '<main style="width:3000px;height:5000px"><h1>Original</h1></main>';
    await page.evaluate((source) => window.monaco.editor.getModels()[0].setValue(source), source);
    let parent = page;
    if (detached) {
      const popup = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'Open preview in a new tab', exact: true }).click();
      parent = await popup;
    }
    const frame = parent.frameLocator('#preview');
    await expect(frame.locator('h1')).toHaveText('Original');
    const position = () => frame.locator('body').evaluate(() => [scrollX, scrollY]);
    await frame.locator('body').evaluate(() => window.scrollTo(180, 900));
    await expect.poll(position).toEqual([180, 900]);
    await page.evaluate((source) => window.monaco.editor.getModels()[0].setValue(source), source.replace('Original', 'Edited'));
    await expect(frame.locator('h1')).toHaveText('Edited');
    await expect.poll(position).toEqual([180, 900]);
    await frame.locator('body').evaluate(() => window.scrollTo(240, 1500));
    await expect.poll(position).toEqual([240, 1500]);
    await page.evaluate((source) => window.monaco.editor.getModels()[0].setValue(source), source.replace('Original', 'Edited again'));
    await expect(frame.locator('h1')).toHaveText('Edited again');
    await expect.poll(position).toEqual([240, 1500]);

    await page.getByRole('button', { name: 'New document', exact: true }).click();
    await page.locator('#name-input').fill('Other');
    await page.locator('#name-form button[type="submit"]').click();
    await expect(frame.locator('h1')).toHaveCount(0);
    await expect.poll(position).toEqual([0, 0]);
    await page.locator('#document-list').getByRole('button', { name: '◇ Welcome', exact: true }).click();
    await expect(frame.locator('h1')).toHaveText('Edited again');
    await expect.poll(position).toEqual([240, 1500]);

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.locator('#export-dialog')).toBeVisible();
    expect(await page.locator('#export-source').inputValue()).not.toContain('scroll-restoration');
    await expect.poll(position).toEqual([240, 1500]);
    if (detached) await parent.close();
  });
}

for (const interact of [false, true]) {
  test(`preview handles late-loading images ${interact ? 'without undoing user scrolling' : 'across rapid edits'}`, async ({ page }) => {
    let releaseAsset;
    const asset = new Promise((resolve) => { releaseAsset = resolve; });
    await page.route('https://preview-assets.test/**', async (route) => {
      await asset;
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="5000"></svg>' });
    });
    await page.goto('./preview.html');
    await page.evaluate(async () => {
      const { createPreviewRenderer } = await import('./app/Services/Preview.js');
      window.renderer = createPreviewRenderer(document.querySelector('#preview'));
      window.renderer.render('<main style="width:3000px;height:5000px">Initial</main>', 'test');
    });
    const frame = page.frameLocator('#preview');
    await expect(frame.locator('main')).toHaveText('Initial');
    await frame.locator('body').evaluate(async () => {
      window.scrollTo(180, 900);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const renderImage = (version) => page.evaluate(({ interact, version }) => {
      window.renderer.render(`${interact ? '<main style="height:5000px"></main>' : ''}<img src="https://preview-assets.test/height.svg?v=${version}">`, 'test');
    }, { interact, version });
    await renderImage(1);
    await expect(frame.locator('img')).toHaveCount(1);
    const position = () => frame.locator('body').evaluate(() => [scrollX, scrollY]);
    if (interact) {
      await frame.locator('body').dispatchEvent('wheel', { bubbles: true, deltaY: 100 });
      await frame.locator('body').evaluate(() => window.scrollTo(0, 1400));
      await expect.poll(position).toEqual([0, 1400]);
    } else {
      await expect.poll(position).toEqual([0, 0]);
      await renderImage(2);
      await expect(frame.locator('img')).toHaveAttribute('src', /v=2$/);
    }
    releaseAsset();
    await expect.poll(() => frame.locator('img').evaluate((img) => img.complete)).toBe(true);
    await expect.poll(position).toEqual(interact ? [0, 1400] : [180, 900]);
  });
}

test('inline position survives editing in a popout and returning', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  const source = '<main style="height:5000px"><h1>Original</h1></main>';
  await page.evaluate((source) => window.monaco.editor.getModels()[0].setValue(source), source);
  const inline = page.frameLocator('#preview');
  await expect(inline.locator('h1')).toHaveText('Original');
  await inline.locator('body').evaluate(async () => {
    scrollTo(0, 900);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open preview in a new tab', exact: true }).click();
  const popup = await opened;
  await expect(popup.frameLocator('#preview').locator('h1')).toHaveText('Original');
  await page.evaluate((source) => window.monaco.editor.getModels()[0].setValue(source), source.replace('Original', 'Edited'));
  await expect(popup.frameLocator('#preview').locator('h1')).toHaveText('Edited');
  await popup.close();
  await expect(page.locator('.preview-pane')).toBeVisible();
  await expect.poll(() => inline.locator('body').evaluate(() => scrollY)).toBe(900);
});

for (const withId of [false, true]) {
  test(`nested scrolling container ${withId ? 'with' : 'without'} an ID keeps its position after an edit`, async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#compile-status')).toContainText('Live preview');
    const source = `<main ${withId ? 'id="scroller"' : ''} style="height:300px;overflow:auto"><article style="height:5000px"><h1>Original</h1></article></main>`;
    await page.evaluate((source) => window.monaco.editor.getModels()[0].setValue(source), source);
    const preview = page.frameLocator('#preview');
    await expect(preview.locator('h1')).toHaveText('Original');
    await preview.locator('main').evaluate((element) => { element.scrollTop = 900; });
    await expect.poll(() => preview.locator('main').evaluate((element) => element.scrollTop)).toBe(900);
    await page.evaluate((source) => window.monaco.editor.getModels()[0].setValue(source), source.replace('Original', 'Edited'));
    await expect(preview.locator('h1')).toHaveText('Edited');
    await expect.poll(() => preview.locator('main').evaluate((element) => element.scrollTop)).toBe(900);
  });
}
