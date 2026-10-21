import { test, expect } from '@playwright/test';

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

test('Tailwind base size isolates generated utilities and @apply from host rem sizing', async ({ page, context }) => {
  const result = await page.evaluate(async () => {
    const { compile, compileExport } = await import('./app/Services/Compiler.js');
    const { newDocument } = await import('./config/editor.js');
    const content = `<style>
      .authored { padding: 1rem; font-size: 1.5rem; }
      .applied { margin: 1rem; @apply p-4 rounded-lg text-xl md:px-8; }
    </style><section id="fixed-base" style="padding: 16px">
      <div class="utility p-4 -mt-2 rounded-lg text-xl w-[20rem] md:p-8">Utility</div>
      <div class="applied">Applied</div><div class="authored">Authored</div>
      <span class="inherited">Inherited</span>
      <div class="expression w-[calc(100%_-_2rem)]">Expression</div>
      <div class="grid gap-2"><span>Gap 2</span></div>
      <div class="grid gap-4"><span>Gap 4</span></div>
      <div class="grid gap-6"><span>Gap 6</span></div>
      <div class="grid gap-8"><span>Gap 8</span></div>
    </section>`;
    const document = { ...newDocument('Units.html', content), preflight: false, tailwindBaseSize: 16 };
    return { preview: compile(document), exported: await compileExport(document) };
  });
  const host = await context.newPage();
  for (const html of [result.preview.html, result.preview.exportHtml, result.exported.exportHtml]) {
    await host.setContent(html);
    await host.addStyleTag({ content: 'html { font-size: 10px; } body { font-size: 13px; }' });
    await expect(host.locator('html')).toHaveCSS('font-size', '10px');
    await expect(host.locator('#fixed-base')).toHaveCSS('padding-top', '16px');
    await expect(host.locator('.utility')).toHaveCSS('padding-top', '32px');
    await expect(host.locator('.utility')).toHaveCSS('font-size', '20px');
    await expect(host.locator('.utility')).toHaveCSS('line-height', '28px');
    await expect(host.locator('.utility')).toHaveCSS('margin-top', '-8px');
    await expect(host.locator('.utility')).toHaveCSS('width', '320px');
    await expect(host.locator('.utility')).toHaveCSS('border-radius', '8px');
    await expect(host.locator('.applied')).toHaveCSS('padding-left', '32px');
    await expect(host.locator('.applied')).toHaveCSS('font-size', '20px');
    await expect(host.locator('.applied')).toHaveCSS('margin-top', '10px');
    await expect(host.locator('.authored')).toHaveCSS('padding-top', '10px');
    await expect(host.locator('.authored')).toHaveCSS('font-size', '15px');
    await expect(host.locator('.inherited')).toHaveCSS('font-size', '13px');
    for (const [utility, expected] of [['gap-2', '8px'], ['gap-4', '16px'], ['gap-6', '24px'], ['gap-8', '32px']])
      await expect(host.locator(`.${utility}`)).toHaveCSS('gap', expected);
    const widths = await host.evaluate(() => ({
      parent: document.querySelector('#fixed-base').clientWidth - 32,
      child: document.querySelector('.expression').getBoundingClientRect().width,
    }));
    expect(widths.child).toBeCloseTo(widths.parent - 32, 1);
    await host.setViewportSize({ width: 500, height: 800 });
    await expect(host.locator('.utility')).toHaveCSS('padding-top', '16px');
    await expect(host.locator('.applied')).toHaveCSS('padding-left', '16px');
    await host.setViewportSize({ width: 1440, height: 1000 });
  }
});

test('Tailwind base size supports full documents, custom bases, and independent fragments', async ({ page, context }) => {
  const outputs = await page.evaluate(async () => {
    const { compileExport } = await import('./app/Services/Compiler.js');
    const { newDocument } = await import('./config/editor.js');
    const compile = (content, tailwindBaseSize) => compileExport({
      ...newDocument('Units.html', content), preflight: false, tailwindBaseSize,
    });
    return Promise.all([
      compile('<section id="base-18"><p class="p-4 text-base">18</p></section>', 18),
      compile('<section id="base-20"><p class="p-4 text-base">20</p></section>', 20),
      compile('<section id="default-base"><p class="p-4">Default</p></section>', null),
      compile('<!doctype html><html><head></head><body><p class="p-4 text-base">Full</p></body></html>', 18),
    ]);
  });
  const host = await context.newPage();
  await host.setContent('<style>html { font-size: 10px; }</style>' + outputs.slice(0, 3).map((output) => output.exportHtml).join('\n'));
  await expect(host.locator('#base-18 p')).toHaveCSS('padding-top', '18px');
  await expect(host.locator('#base-18 p')).toHaveCSS('font-size', '18px');
  await expect(host.locator('#base-20 p')).toHaveCSS('padding-top', '20px');
  await expect(host.locator('#default-base p')).toHaveCSS('padding-top', '10px');
  expect(outputs[2].css).not.toContain('--twe-rem');
  await host.setContent(outputs[3].exportHtml);
  await host.addStyleTag({ content: 'html { font-size: 10px; }' });
  await expect(host.locator('p')).toHaveCSS('padding-top', '18px');
  await expect(host.locator('p')).toHaveCSS('font-size', '18px');
});

test('Tailwind unit conversion preserves strings, URLs, identifiers, and other units', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { useTailwindBaseSize } = await import('./app/Services/TailwindUnits.js');
    return useTailwindBaseSize({
      r: ['@media (min-width: 40rem)'],
      d: 'content:"1rem";background:url(/images/2rem.svg);--size-1rem:2rem;width:calc(100% - .5rem);height:1e1rem;margin:-1.5rem;border:1px;line-height:1.5;letter-spacing:.1em;/* 3rem */',
    });
  });
  expect(result.r).toEqual(['@media (min-width: 40rem)']);
  expect(result.d).toBe('content:"1rem";background:url(/images/2rem.svg);--size-1rem:calc(2 * var(--twe-rem));width:calc(100% - calc(0.5 * var(--twe-rem)));height:calc(10 * var(--twe-rem));margin:calc(-1.5 * var(--twe-rem));border:1px;line-height:1.5;letter-spacing:.1em;/* 3rem */');
});

test('children variant groups style direct children in preview and export', async ({ page, context }) => {
  const result = await page.evaluate(async () => {
    const { compile, compileExport } = await import('./app/Services/Compiler.js');
    const { newDocument } = await import('./config/editor.js');
    const document = newDocument('Children.html',
      '<section id="children-test"><div class="children:(border my-2)"><p>First <em>nested</em></p><p>Second</p></div></section>');
    return { preview: compile(document), exported: await compileExport(document) };
  });
  const host = await context.newPage();
  for (const html of [result.preview.html, result.preview.exportHtml, result.exported.exportHtml]) {
    await host.setContent(html);
    await expect(host.locator('div > p').first()).toHaveCSS('border-top-width', '1px');
    await expect(host.locator('div > p').first()).toHaveCSS('margin-top', '8px');
    await expect(host.locator('div > p').last()).toHaveCSS('margin-bottom', '8px');
    await expect(host.locator('em')).toHaveCSS('border-top-width', '0px');
    await expect(host.locator('em')).toHaveCSS('margin-top', '0px');
    await expect(host.locator('div')).toHaveCSS('border-top-width', '0px');
  }
});

test('inline @apply uses document utilities and preserves declaration order in preview and exports', async ({ page, context }) => {
  const result = await page.evaluate(async () => {
    const { compile, compileExport } = await import('./app/Services/Compiler.js');
    const { newDocument } = await import('./config/editor.js');
    const content = `<style>
      /* Keep this comment and fallback declarations. */
      .card { padding: 1px; @apply p-4 bg-brand rounded-lg; padding-left: 7px; }
      .ordered { @apply p-2; padding: 3px; @apply px-4; }
      @media (min-width: 600px) { .card { @apply mt-2; } }
      .strong { @apply text-brand !important; color: blue; }
    </style><section id="apply-root"><div class="card ordered strong">Applied</div></section>`;
    const document = { ...newDocument('Apply.html', content), preflight: false, colors: { brand: '#123456' } };
    return { preview: compile(document), exported: await compileExport(document), content: document.content };
  });
  expect(result.content).toContain('@apply p-4');
  expect(result.preview.html).toContain('Keep this comment');
  const host = await context.newPage();
  for (const html of [result.preview.html, result.preview.exportHtml, result.exported.exportHtml]) {
    expect(html).not.toContain('@apply');
    await host.setContent(html);
    const card = host.locator('.card');
    await expect(card).toHaveCSS('padding-top', '3px');
    await expect(card).toHaveCSS('padding-left', '16px');
    await expect(card).toHaveCSS('border-radius', '8px');
    await expect(card).toHaveCSS('background-color', 'rgb(18, 52, 86)');
    await expect(card).toHaveCSS('color', 'rgb(18, 52, 86)');
    await expect(card).toHaveCSS('margin-top', '8px');
    await host.setViewportSize({ width: 500, height: 800 });
    await expect(card).toHaveCSS('margin-top', '0px');
    await host.setViewportSize({ width: 1440, height: 1000 });
  }
});

test('inline @apply supports grouped variants, animation dependencies, and full documents', async ({ page, context }) => {
  const result = await page.evaluate(async () => {
    const { compile, compileExport } = await import('./app/Services/Compiler.js');
    const { newDocument } = await import('./config/editor.js');
    const document = newDocument('Variants.html', `<!doctype html><html><head><style>
      .card { @apply children:(my-2 p-2) hover:bg-red-500 md:p-4; }
      .spin { @apply animate-spin ring-2 ring-red-500 w-[123px]; }
    </style></head><body><div class="card"><p>Child</p></div><div class="spin">Spin</div></body></html>`);
    document.preflight = false;
    return { preview: compile(document), exported: await compileExport(document) };
  });
  const host = await context.newPage();
  for (const html of [result.preview.html, result.exported.exportHtml]) {
    await host.setContent(html);
    await expect(host.locator('.card')).toHaveCSS('padding-top', '16px');
    await expect(host.locator('p')).toHaveCSS('padding-top', '8px');
    await expect(host.locator('p')).toHaveCSS('margin-top', '8px');
    await host.locator('.card').hover();
    await expect(host.locator('.card')).toHaveCSS('background-color', 'rgb(239, 68, 68)');
    expect(await host.locator('.spin').evaluate((element) => element.getAnimations().length)).toBe(1);
    await expect(host.locator('.spin')).toHaveCSS('width', '123px');
    await expect(host.locator('.spin')).not.toHaveCSS('box-shadow', 'none');
    await host.setViewportSize({ width: 500, height: 800 });
    await expect(host.locator('.card')).toHaveCSS('padding-top', '0px');
    await host.setViewportSize({ width: 1440, height: 1000 });
  }
});

test('inline @apply leaves scripts, comments, non-CSS styles, and untouched CSS intact', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { compile } = await import('./app/Services/Compiler.js');
    const { newDocument } = await import('./config/editor.js');
    const source = `<!-- <style>.fake { @apply p-4; }</style> -->
<script type="text/plain"><style>.fake { @apply p-4; }</style></script>
<style type="text/less">.less { @apply p-4; }</style>
<style>.literal::after { content: "@apply p-4;"; } /* @apply p-4; */</style>
<style>.keep { color: red; }</style>
<style type="text/css" media="screen">.actual { @apply p-2; }</style>
<section><div class="actual">Text &amp; spaces   stay</div></section>`;
    const compiled = compile(newDocument('Preserved.html', source));
    const markup = compiled.exportHtml.slice(compiled.exportHtml.indexOf('</style></pre>') + '</style></pre>\n\n'.length);
    return { source, markup };
  });
  expect(result.markup).toContain(result.source.slice(0, result.source.indexOf('<style type="text/css"')));
  expect(result.markup).toContain('media="screen"');
  expect(result.markup).not.toContain('.actual { @apply');
  expect(result.markup).toContain('Text &amp; spaces   stay');
});

test('incomplete inline @apply CSS rejects compilation and recovers after completion', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { compile } = await import('./app/Services/Compiler.js');
    const { newDocument } = await import('./config/editor.js');
    const errors = [];
    for (const css of ['.card { @apply p-4;', '.card { @apply; }', '@apply p-4;']) {
      try { compile(newDocument('Invalid.html', `<style>${css}</style><p>Copy</p>`)); }
      catch (error) { errors.push(error.message); }
    }
    const recovered = compile(newDocument('Ready.html', '<style>.card { @apply p-4; }</style><p class="card">Copy</p>'));
    return { errors, html: recovered.html };
  });
  expect(result.errors).toHaveLength(3);
  expect(result.html).toContain('padding:1rem');
  expect(result.html).not.toContain('@apply');
});

test('inline CSS diagnostics use the full HTML source line and column', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { compile } = await import('./app/Services/Compiler.js');
    const { newDocument } = await import('./config/editor.js');
    const errors = [];
    for (const source of [
      '<!-- Heading -->\n<section>\n<style>.ok { color: red; }</style>\n<style>\n.card {\n  @apply;\n}\n</style></section>',
      '<section>\n<style>@apply p-4;</style></section>',
      '<section>\n<style>\n.card {\n  content\n}\n</style></section>',
    ]) {
      try { compile(newDocument('Error.html', source)); }
      catch (error) { errors.push({ message: error.message, line: error.line, column: error.column }); }
    }
    return errors;
  });
  expect(result).toHaveLength(3);
  expect(result[0]).toMatchObject({ line: 6, column: 3 });
  expect(result[0].message).toContain('CSS error at line 6, column 3:');
  expect(result[1]).toMatchObject({ line: 2, column: 8 });
  expect(result[2]).toMatchObject({ line: 4, column: 3 });
  expect(result[2].message).toContain('Unknown word content');
});

test('generated export CSS uses one compact line per utility rule', async ({ page }) => {
  const result = await exportSource(page,
    '<section id="card"><div class="flex p-2 md:grid animate-spin">Copy</div></section>');
  expect(result.css.split('\n')).toContain('  .flex{display:flex}');
  expect(result.css.split('\n')).toContain('  .p-2{padding:0.5rem}');
  expect(result.css).toMatch(/@media[^\n]*\{\n\s+\.md\\:grid\{[^\n}]*display:grid}/);
  expect(result.css).toMatch(/@keyframes[^\n]*\{\n\s+[^\n]+\{[^\n]+}/);
  expect(result.exportHtml).toContain(result.css.trimEnd());
});

test('export combines generated utilities sharing the same media query', async ({ page }) => {
  const result = await exportSource(page,
    '<section id="card"><div class="md:p-8 md:mx-auto md:text-4xl md:col-span-2">Copy</div></section>');
  expect(result.css.match(/@media \(min-width:768px\)/g)).toHaveLength(1);
  for (const selector of ['p-8', 'mx-auto', 'text-4xl', 'col-span-2']) {
    expect(result.css).toContain(`.md\\:${selector}{`);
  }
  expect(result.exportHtml).toContain(result.css.trimEnd());
});

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
  expect(result.css).toContain('.p-8{padding:2rem}');
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
  expect(result.preview.html).toContain('<style>html { color: red; } body { padding: 19px; }</style>');
  expect(result.exported.exportHtml).toContain('<style>html { color: red; }\n\nbody { padding: 19px; }</style>');
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
    expect(result.exportHtml).toContain(`</style></pre>\n\n${content.replace('pre{color:red}', 'pre { color: red }')}`);
  }
});

test('full-document exports format CSS and preserve leading comments and authored assets', async ({
  page,
}) => {
  const content =
    '<!-- Keep --><!doctype html><html lang="en"><head><title>Title</title><style>.custom{color:red}</style></head><body><p class="p-2">Copy</p></body></html>';
  const result = await exportSource(page, content, { preflight: true });
  expect(
    result.exportHtml.replace(/<style data-generated="tailwind-editor">[\s\S]*?<\/style>\n/, ''),
  ).toBe(content.replace('.custom{color:red}', '.custom { color: red }'));
  expect(result.exportHtml).not.toContain('@scope');
  expect(result.exportHtml).not.toContain('data-tw-scope');
  expect(result.css).toMatch(/padding:0\.5rem;?}/);
  expect(result.css).toContain('html{');
});

test('export compacts short authored rules while preserving source and surrounding HTML', async ({ page }) => {
  const content = '<!-- Keep --><style>\n    img {\n      min-width: 0\n    }\n</style><p>Keep   text\non two lines</p><script>const value = "a   b";</script><style type="text/less">@value:  red;</style>';
  const result = await exportSource(page, content);
  const exported = result.exportHtml.slice(result.exportHtml.indexOf('</style></pre>') + '</style></pre>\n\n'.length);
  expect(exported).toBe(content.replace('img {\n      min-width: 0\n    }', 'img { min-width: 0 }'));
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
  await page.route('**/app/Services/Formatting.js', async (route) => {
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
  await expect(page.locator('#compile-status')).toContainText('document changed while preparing export');
  await expect(page.locator('#export-dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
  expect(await page.locator('#export-source').inputValue()).toContain('Changed during formatting');
});
