import { test, expect } from '@playwright/test';
import { format } from 'prettier';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#compile-status')).toContainText('Live preview');
});

async function exportSource(page, content, options = {}) {
  return page.evaluate(
    async ({ content, options }) => {
      const { compileExport } = await import('./app/Services/Compiler.js');
      const { newDocument } = await import('./config/editor.js');
      return compileExport({ ...newDocument('Test.html', content), preflight: false, ...options });
    },
    { content, options },
  );
}

test('preview link handling preserves authored targets and base URLs without changing exports', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { compile, compileExport } = await import('./app/Services/Compiler.js');
    const { newDocument } = await import('./config/editor.js');
    const source =
      '<!doctype html><html><head><base href="https://preview-links.test/"></head><body><main><a href="next">Default</a><a href="#details">Section</a><a href="frame" target="_self">Frame</a><a href="tab" target="_blank">Tab</a><section id="details">Details</section></main></body></html>';
    const document = newDocument('Links.html', source);
    const preview = compile(document);
    const exported = await compileExport(document);
    const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
    const original = parse(source);
    const rendered = parse(preview.html);
    const exportLinks = (html) =>
      [...parse(html).querySelectorAll('a')].map((link) => link.outerHTML);
    const authoredBase = compile(
      newDocument('Authored.html', source.replace('<base href=', '<base target="_self" href=')),
    );
    return {
      originalLinks: exportLinks(source),
      previewTargets: [...rendered.querySelectorAll('a[target]')].map((link) => [
        link.textContent,
        link.target,
      ]),
      baseHref: rendered.querySelector('base[href]').getAttribute('href'),
      originalBase: original.querySelector('base').outerHTML,
      exportBases: [preview.exportHtml, exported.exportHtml].map((html) =>
        [...parse(html).querySelectorAll('base')].map((base) => base.outerHTML),
      ),
      exportLinks: [exportLinks(preview.exportHtml), exportLinks(exported.exportHtml)],
      authoredBaseTarget: parse(authoredBase.html).querySelector('base[target]').target,
    };
  });
  expect(result.baseHref).toBe('https://preview-links.test/');
  expect(result.previewTargets).toContainEqual(['Frame', '_self']);
  expect(result.previewTargets).toContainEqual(['Tab', '_blank']);
  expect(result.exportBases).toEqual([[result.originalBase], [result.originalBase]]);
  expect(result.exportLinks).toEqual([result.originalLinks, result.originalLinks]);
  expect(result.authoredBaseTarget).toBe('_self');
});

test('preview resets html and body spacing without including the reset in exports', async ({
  page,
  context,
}) => {
  for (const content of [
    '<section><p class="p-2">Fragment</p></section>',
    '<!doctype html><html><head></head><body><p class="p-2">Full document</p></body></html>',
  ]) {
    for (const preflight of [false, true]) {
      const { preview, exported } = await page.evaluate(
        async ({ content, preflight }) => {
          const { compile, compileExport } = await import('./app/Services/Compiler.js');
          const { newDocument } = await import('./config/editor.js');
          const document = { ...newDocument('Reset.html', content), preflight };
          return { preview: compile(document), exported: await compileExport(document) };
        },
        { content, preflight },
      );
      await page.locator('#preview').evaluate((iframe, html) => {
        iframe.srcdoc = html;
      }, preview.html);
      for (const tag of ['html', 'body']) {
        await expect(page.frameLocator('#preview').locator(tag)).toHaveCSS('margin', '0px');
        await expect(page.frameLocator('#preview').locator(tag)).toHaveCSS('padding', '0px');
      }
      expect(preview.exportHtml).not.toContain('data-preview=');
      expect(exported.exportHtml).not.toContain('data-preview=');
      expect(exported.css).not.toMatch(/html\s*,\s*body\s*\{/);
      if (!preflight) {
        const host = await context.newPage();
        await host.setContent(exported.exportHtml);
        await expect(host.locator('body')).toHaveCSS('margin', '8px');
        await host.close();
      }
    }
  }
});

test('scoped export styles descendants with arbitrary classes and variants while leaving the wrapper unstyled', async ({
  page,
  context,
}) => {
  const result = await exportSource(
    page,
    '<section id="123:card" class="p-8 sm:grid bg-[#abc123] hover:bg-brand"><div class="p-8 sm:grid bg-[#abc123] hover:bg-brand"><p class="w-1/2 p-2">Inside</p></div></section>',
    { colors: { brand: '#123456' } },
  );
  expect(result.css).toBe(
    await format(result.css, { parser: 'css', tabWidth: 2, printWidth: 100 }),
  );
  const host = await context.newPage();
  await host.setContent(
    `<div id="outside" class="p-8 sm:grid bg-[#abc123]"><p class="p-2">Outside</p></div>${result.exportHtml}`,
  );
  const root = host.locator('section');
  await expect(root).toHaveCSS('padding', '0px');
  await expect(root).toHaveCSS('display', 'block');
  await expect(root).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const inner = root.locator('div');
  await expect(inner).toHaveCSS('padding', '32px');
  await expect(inner).toHaveCSS('display', 'grid');
  await expect(inner).toHaveCSS('background-color', 'rgb(171, 193, 35)');
  await expect(root.locator('p')).toHaveCSS('padding', '8px');
  await expect(host.locator('#outside')).toHaveCSS('padding', '0px');
  await expect(host.locator('#outside p')).toHaveCSS('padding', '0px');
  await inner.hover();
  await expect(inner).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await host.setViewportSize({ width: 500, height: 800 });
  await expect(inner).toHaveCSS('display', 'block');
});

test('authored wrapper IDs keep exports with identical classes separate from each other and the host', async ({
  page,
  context,
}) => {
  const red = await exportSource(
    page,
    '<section id="red-card" class="p-8 text-brand"><p class="p-8 text-brand">Red</p></section>',
    {
      colors: { brand: '#ff0000' },
    },
  );
  const blue = await exportSource(
    page,
    '<section id="blue-card" class="p-8 text-brand"><p class="p-8 text-brand">Blue</p></section>',
    {
      colors: { brand: '#0000ff' },
    },
  );
  const host = await context.newPage();
  await host.setContent(
    `<section class="p-8 text-brand">Host</section>${red.exportHtml}${blue.exportHtml}`,
  );
  await expect(host.getByText('Red', { exact: true })).toHaveCSS('color', 'rgb(255, 0, 0)');
  await expect(host.getByText('Blue', { exact: true })).toHaveCSS('color', 'rgb(0, 0, 255)');
  await expect(host.getByText('Host', { exact: true })).toHaveCSS('padding', '0px');
});

test('scoped selectors retain descendant pseudo-elements, group variants, and animation keyframes', async ({
  page,
  context,
}) => {
  const result = await exportSource(
    page,
    '<section><div class="group before:content-[\'Hello\'] before:block"><p class="group-hover:text-brand animate-spin">Animated</p></div></section>',
    { colors: { brand: '#ff0000' }, preflight: true },
  );
  const host = await context.newPage();
  await host.setContent(result.exportHtml);
  const pseudo = await host.locator('div').evaluate((element) => ({
    content: getComputedStyle(element, '::before').content,
    display: getComputedStyle(element, '::before').display,
    boxSizing: getComputedStyle(element, '::before').boxSizing,
  }));
  expect(pseudo).toEqual({ content: '"Hello"', display: 'block', boxSizing: 'border-box' });
  await host.locator('div').hover();
  await expect(host.locator('p')).toHaveCSS('color', 'rgb(255, 0, 0)');
  expect(await host.locator('p').evaluate((element) => element.getAnimations().length)).toBe(1);
});

test('fragment preflight resets descendants and leaves wrapper styling to authored CSS', async ({
  page,
  context,
}) => {
  const result = await exportSource(
    page,
    '<style>#wrapper { padding: 11px; }</style><article id="wrapper" class="m-4"><h1>Heading</h1><p>Copy</p></article>',
    { preflight: true },
  );
  const host = await context.newPage();
  await host.setContent(
    `<style>body { font-family: serif; line-height: 2; margin: 37px; }</style><h1>Host</h1>${result.exportHtml}`,
  );
  await expect(host.locator('body')).toHaveCSS('margin', '37px');
  await expect(host.locator('body')).toHaveCSS('font-family', 'serif');
  await expect(host.locator('article')).toHaveCSS('padding', '11px');
  await expect(host.locator('article')).toHaveCSS('line-height', '32px');
  await expect(host.locator('article')).toHaveCSS('margin', '0px');
  await expect(host.locator('article')).toHaveCSS('font-family', 'serif');
  await expect(host.locator('article h1')).toHaveCSS('font-size', '16px');
  await expect(host.locator('article p')).toHaveCSS('margin', '0px');
  await expect(host.locator('body > h1')).toHaveCSS('font-size', '32px');
});

test('fragment compilation omits document preflight rules from preview and export while preserving authored CSS', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { compile, compileExport } = await import('./app/Services/Compiler.js');
    const { newDocument } = await import('./config/editor.js');
    const document = newDocument(
      'Fragment.html',
      '<style>html { color: red; } body { padding: 19px; }</style><section id="card"><p class="p-2">Copy</p></section>',
    );
    const preview = compile(document);
    const exported = await compileExport(document);
    const parsed = new DOMParser().parseFromString(preview.html, 'text/html');
    return {
      preview,
      exported,
      previewStyle: parsed.querySelector('style[data-generated="tailwind-editor"]').textContent,
    };
  });
  for (const css of [result.preview.css, result.previewStyle, result.exported.css]) {
    expect(css).not.toMatch(/(?:^|[{}])\s*(?:html|body)\s*\{/);
    expect(css).toMatch(/box-sizing:\s*border-box/);
    expect(css).toMatch(/padding:\s*0\.5rem/);
  }
  for (const html of [result.preview.html, result.exported.exportHtml]) {
    expect(html).toContain('<style>html { color: red; } body { padding: 19px; }</style>');
  }
});

test('authored html and body wrappers retain document preflight rules', async ({ page }) => {
  for (const content of [
    '<!doctype html><html><head></head><body><p class="p-2">Copy</p></body></html>',
    '<html lang="en"><body><p class="p-2">Copy</p></body></html>',
    '<!-- Keep --><body id="page-root"><section><p class="p-2">Copy</p></section></body>',
  ]) {
    const result = await exportSource(page, content, { preflight: true });
    expect(result.css).toMatch(/(?:^|[{}])\s*html\s*\{/);
    expect(result.css).toMatch(/(?:^|[{}])\s*body\s*\{/);
    if (content.includes('id="page-root"')) {
      expect(result.css).toContain('@scope (#page-root)');
      expect(result.exportHtml).toContain(`</style></pre>\n\n${content}`);
    }
  }
});

test('wrapper detection chooses the top-level element with the most eligible children without changing HTML', async ({
  page,
}) => {
  const content = `Loose text<!-- Keep -->
<pre><i></i><i></i><i></i><i></i></pre>
<style>.custom { color: red; }</style><script type="application/json">{"keep":true}</script>
<aside><pre></pre><pre></pre><script></script><style></style><p>Side</p></aside>
<main id="wrapper"><section><i></i><i></i><i></i></section><footer>Foot</footer></main>`;
  const result = await exportSource(page, content);
  expect(result.css).toContain('@scope (#wrapper)');
  expect(
    result.exportHtml.slice(
      result.exportHtml.indexOf('</style></pre>') + '</style></pre>\n\n'.length,
    ),
  ).toBe(content);
  expect(result.exportHtml).not.toContain('data-tw-scope');
  expect(result.exportHtml).not.toContain('chd-main');
});

test('wrapper selectors escape classes, use a tag fallback, and preserve ignored-only input and table rows', async ({
  page,
}) => {
  for (const [content, selector] of [
    [
      '<section class="sm:grid w-1/2 bg-[#abc123]"><p>Copy</p></section>',
      'section.sm\\:grid.w-1\\/2.bg-\\[\\#abc123\\]',
    ],
    ['<article><p>Copy</p></article>', 'article'],
    ['<div id="first"></div><section id="second"></section>', '#first'],
    ['<tr class="p-2"><td>Cell</td></tr>', 'tr.p-2'],
    ['<tr><td>Unclassed row</td></tr>', 'tr'],
    ['<pre class="p-2">Code</pre><style>pre{color:red}</style><script></script>', ':not(*)'],
    ['Only text', ':not(*)'],
  ]) {
    const result = await exportSource(page, content);
    expect(result.css).toContain(`@scope (${selector})`);
    expect(result.exportHtml).toContain(`</style></pre>\n\n${content}`);
  }
});

test('full-document exports format only generated CSS and preserve leading comments and authored assets', async ({
  page,
}) => {
  const content =
    '<!-- Keep --><!doctype html><html lang="en"><head><title>Title</title><style>.custom{color:red}</style></head><body><p class="p-2">Copy</p></body></html>';
  const result = await exportSource(page, content, { preflight: true });
  expect(
    result.exportHtml.replace(/<style data-generated="tailwind-editor">[\s\S]*?<\/style>\n/, ''),
  ).toBe(content);
  expect(result.exportHtml).not.toContain('@scope');
  expect(result.exportHtml).not.toContain('data-tw-scope');
  expect(result.css).toContain('padding: 0.5rem;');
  expect(result.css).toContain('html {');
});

test('an edit while the CSS formatter loads rejects the stale export snapshot', async ({
  page,
}) => {
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let started;
  const loading = new Promise((resolve) => {
    started = resolve;
  });
  await page.route('**/prettier@3.5.3/plugins/postcss.mjs', async (route) => {
    started();
    await blocked;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await loading;
  await page.evaluate(() =>
    window.monaco.editor.getModels()[0].setValue('<h1>Changed during formatting</h1>'),
  );
  release();
  await expect(page.locator('#notice')).toContainText('document changed while preparing export');
  await expect(page.locator('#export-dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
  expect(await page.locator('#export-source').inputValue()).toContain('Changed during formatting');
});
