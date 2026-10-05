import { test, expect } from '@playwright/test';

test('HTML readiness supports authored fragments and HTML syntax without repairing mistakes', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
  const cases = [
    ['<div class="">Text</div>', 'ready'],
    ['<my-card x-data="{}"><input disabled><br></my-card>', 'ready'],
    ['<ul><li>First<li>Second</ul><p>Hello', 'ready'],
    ['<table><tbody><tr><td>A<td>B</table>', 'ready'],
    ['<tr><td>Fragment</td></tr>', 'ready'],
    ['<svg><path d="M0 0" /></svg>', 'ready'],
    ['<script>const x = "<div>";</script><style>a::before { content: "<span>" }</style>', 'ready'],
    [
      '<!doctype html><html><head><title>Title</title></head><body><p>Text</p></body></html>',
      'ready',
    ],
    ['<html><body>Text</body></html>', 'ready'],
    ['<!-- note -->', 'ready'],
    ['<div class="', 'incomplete'],
    ['<div class=></div>', 'incomplete'],
    ['<div>', 'incomplete'],
    ['<script>const x = 1;', 'incomplete'],
    ['<!-- unfinished', 'incomplete'],
    ['<div><span></div>', 'invalid'],
    ['<div></span></div>', 'invalid'],
    ['<div class="a" class="b"></div>', 'invalid'],
    ['<div/>', 'invalid'],
  ];
  for (const [source, state] of cases) {
    const result = await page.evaluate(
      async (source) => (await import('./app/Services/Html.js')).inspectHtml(source),
      source,
    );
    expect(result.state, `${source}: ${result.reason}`).toBe(state);
  }
});

test('editing protection includes multiline opening tags and all selections', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { inspectHtml, affectsEditingRegion } = await import('./app/Services/Html.js');
    const source = '<div\n class=""\n id="card">Text</div>\n<p>Next</p>';
    const { openingTags } = await inspectHtml(source);
    const changed = source.replace(' class=""\n', '');
    const here = source.indexOf('id=');
    const away = source.indexOf('Next');
    return [
      affectsEditingRegion(source, changed, [{ start: here, end: here }], openingTags),
      affectsEditingRegion(source, changed, [{ start: away, end: away }], openingTags),
      affectsEditingRegion(
        source,
        changed,
        [
          { start: away, end: away },
          { start: here, end: here },
        ],
        openingTags,
      ),
    ];
  });
  expect(result).toEqual([true, false, true]);
});

test('HTML readiness unavailable keeps source saving and retries after the parser loads', async ({
  page,
}) => {
  await page.route('**/parse5@8.0.1/+esm', (route) => route.abort());
  await page.goto('./');
  await expect(page.locator('#html-status')).toHaveText('HTML check unavailable');
  await page.evaluate(() => window.monaco.editor.getModels()[0].setValue('<p>Still saved</p>'));
  await expect(page.locator('#save-status')).toHaveText('All changes saved');
  await expect(page.locator('#html-status')).toHaveText('HTML check unavailable');
  expect(
    await page.evaluate(async () => {
      const { workspace } = await (await import('./app/Models/Workspace.js')).loadWorkspace();
      return workspace.documents.find((item) => item.id === workspace.activeId).content;
    }),
  ).toBe('<p>Still saved</p>');
  await page.unroute('**/parse5@8.0.1/+esm');
  await page.evaluate(() => window.monaco.editor.getModels()[0].setValue('<p>Ready again</p>'));
  await expect(page.locator('#html-status')).toHaveText('HTML ready');
  await expect(page.frameLocator('#preview').locator('p')).toHaveText('Ready again');
});
