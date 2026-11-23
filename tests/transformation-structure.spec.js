import {
  test,
  expect
} from '@playwright/test';

async function transform(page, input, code) {
  await page.goto('./');
  return page.evaluate(async ({
    input,
    code
  }) => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    return runTransformations(input, [{
      name: 'Structure',
      kind: 'dom',
      target: 'preview',
      code
    }]);
  }, {
    input,
    code
  });
}

test('Emmet resolves nesting, climb-up, numbering, attributes and lorem without snippets or editor fields', async ({
  page
}) => {
  const result = await transform(page, '<main></main>', `
    const template = await api.structure.parse('section>(h2+p>lorem5)^aside#item$*2+a+img');
    const plan = api.structure.plan({ mode: 'range', nodes: [document.querySelector('main')], template, format: false });
    api.structure.apply(plan);
  `);
  const parsed = await page.evaluate(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      section: doc.querySelector('section').innerHTML,
      ids: [...doc.querySelectorAll('aside')].map(el => el.id),
      main: doc.querySelectorAll('main').length,
      a: doc.querySelector('a').outerHTML,
      img: doc.querySelector('img').outerHTML
    };
  }, result.code);
  expect(parsed.section).toBe('<h2></h2><p>Lorem ipsum dolor sit amet.</p>');
  expect(parsed.ids).toEqual(['item1', 'item2']);
  expect(parsed.main).toBe(1); // Unused capture remains in place.
  expect(parsed.a).toBe('<a></a>');
  expect(parsed.img).toBe('<img>');
});

test('capture repetition moves originals once and deep clones snapshots while preserving duplicate IDs and grouped attributes', async ({
  page
}) => {
  const result = await transform(page, '<main><h3 id="same"><em>Title</em></h3><p id="body">Body</p><p>Extra</p></main>', `
    const original = document.querySelector('h3');
    const child = original.firstChild;
    const body = document.querySelector('p');
    await api.structure.rewrite([document.querySelector('main')], '{h3}{p{1}}', 'section[class="md:(flex gap-4)"]>(@1*2+div>@2)', { format: false });
    const headings = document.querySelectorAll('h3');
    if (headings[0] !== original || headings[0].firstChild !== child) throw new Error('Lost original identity');
    if (headings[1] === original || headings[1].firstChild === child) throw new Error('Did not deep clone');
    if (document.querySelector('section div p') !== body) throw new Error('Lost body identity');
    original.textContent = 'Changed';
    if (headings[1].textContent !== 'Title') throw new Error('Clone changed with original');
  `);
  expect(result.code).toContain('class="md:(flex gap-4)"');
  expect(result.code).toContain('<h3 id="same">Changed</h3><h3 id="same"><em>Title</em></h3>');
  expect(result.code).toContain('</section><p>Extra</p>');
});

test('unused captures and zero-repeat branches stay in place but still validate required matches', async ({
  page
}) => {
  const result = await transform(page, '<main><h3>Title</h3><p>Keep</p></main>', `
    const paragraph = document.querySelector('p');
    await api.structure.rewrite([document.querySelector('main')], '{h3}{p}', 'section>(@1+@2*0)', { format: false });
    if (paragraph.parentElement !== document.querySelector('main')) throw new Error('Moved unused capture');
  `);
  expect(result.code).toBe('<main><section><h3>Title</h3></section><p>Keep</p></main>');
});

test('range wrapping and sections preserve meaningful text, comments and authored subtrees', async ({
  page
}) => {
  const result = await transform(page, '<main>intro<h2>One</h2>tail<!-- note --><p>  Keep\n this <b>exactly</b></p><h2>Two</h2>last</main>', `
    const main = document.querySelector('main');
    const paragraph = main.querySelector('p');
    const before = paragraph.innerHTML;
    await api.structure.sections([...main.childNodes], 'h2', 'section>div', { format: false });
    if (paragraph.innerHTML !== before) throw new Error('Changed authored subtree');
    await api.structure.wrap([...main.childNodes], 'article.shell', { format: false });
  `);
  expect(result.code).toBe('<main><article class="shell">intro<section><div><h2>One</h2>tail<!-- note --><p>  Keep\n this <b>exactly</b></p></div></section><section><div><h2>Two</h2>last</div></section></article></main>');
});

test('strict matching reports every partial group and leaves the document untouched', async ({
  page
}) => {
  const result = await transform(page, '<main><h3>Complete</h3><p>Yes</p><h3>Missing one</h3><aside></aside><h3>Missing two</h3></main>', `
    const before = document.toString();
    try {
      await api.structure.rewrite([document.querySelector('main')], '{h3}{p}', 'section>(@1+@2)');
      throw new Error('Unexpected success');
    } catch (error) {
      if (error.diagnostics?.length !== 2) throw error;
      if (!error.message.includes('Missing one') || !error.message.includes('Missing two')) throw error;
      if (error.diagnostics.some(item => item.found !== 0 || item.capture !== 2)) throw error;
    }
    if (document.toString() !== before) throw new Error('Partial mutation');
  `);
  expect(result.code).not.toContain('<section');
});

test('partial diagnostics survive the worker boundary and reject earlier mutations', async ({
  page
}) => {
  await page.goto('./');
  const error = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    try {
      await runTransformations('<h3>Missing</h3>', [{
          name: 'Earlier',
          kind: 'dom',
          code: 'document.body.append(document.createElement("aside"));'
        },
        {
          name: 'Failing',
          kind: 'dom',
          code: 'await api.structure.rewrite([...document.body.children], "{h3}{p}", "section>(@1+@2)");'
        }
      ]);
    } catch (error) {
      return {
        message: error.message,
        diagnostics: error.diagnostics
      };
    }
  });
  expect(error.message).toContain('Failing: structure:');
  expect(error.message).toContain('No changes were applied.');
  expect(error.diagnostics[0]).toMatchObject({
    type: 'partial-match',
    capture: 2,
    found: 0
  });
});

test('overlapping source captures fail even when a conflicting capture is unused', async ({
  page
}) => {
  const result = await transform(page, '<main><h3>Outer</h3><section><h3>Inner</h3><p>Content</p></section></main>', `
    const before = document.toString();
    try {
      await api.structure.rewrite([document.querySelector('main')], '{h3}{section{0,1}}', 'div>@1');
      throw new Error('Unexpected success');
    } catch (error) {
      if (!error.diagnostics?.some(item => item.type === 'overlap')) throw error;
    }
    if (document.toString() !== before) throw new Error('Partial mutation');
  `);
  expect(result.code).not.toContain('<div');
});

test('structured relations match against the current anchor and optional captures can be empty', async ({
  page
}) => {
  const result = await transform(page, '<main><h3>One</h3><aside></aside><p>Later</p><h3>Two</h3><p>Next</p></main>', `
    await api.structure.rewrite([document.querySelector('main')], [
      { selector: 'h3' }, { selector: 'p', relation: 'next', min: 0, max: 1 }
    ], 'section>(@1+@2)', { format: false });
  `);
  expect(result.code).toBe('<main><section><h3>One</h3></section><aside></aside><p>Later</p><section><h3>Two</h3><p>Next</p></section></main>');
});

test('invalid capture modifications and unsupported syntax fail before zero branches disappear', async ({
  page
}) => {
  const result = await transform(page, '<p>Safe</p>', `
    const invalid = ['@1.featured', '@1[role="region"]', '@1>span', '(@1>span)*0', '(@1.featured)*0',
      'div{literal}', 'div{literal}*0', 'svg>circle', 'img>span', '(@1+div)*5001', 'div>lorem1001'];
    for (const source of invalid) {
      let failed = false;
      try { await api.structure.parse(source); } catch { failed = true; }
      if (!failed) throw new Error('Accepted invalid expression: ' + source);
    }
    const template = await api.structure.parse('section>@9*0');
    try {
      api.structure.plan({ template, mode: 'range', nodes: [...document.body.childNodes] });
      throw new Error('Unknown capture accepted');
    } catch (error) { if (!error.message.includes('@9 has no defined capture')) throw error; }
  `);
  expect(result.code).toBe('<p>Safe</p>');
});

test('formatting changes generated wrappers only and preserves CRLF and tabs', async ({
  page
}) => {
  const result = await transform(page, '<main>\r\n\t<h3>Title</h3>\r\n\t<p>  Keep\n this <b>exactly</b></p>\r\n</main>', `
    await api.structure.rewrite([document.querySelector('main')], '{h3}{p}', 'section>(@1+div>@2)', { unit: '\\t' });
  `);
  expect(result.code).toContain('<section>\r\n\t\t<h3>Title</h3>\r\n\t\t<div>\r\n\t\t\t<p>  Keep\n this <b>exactly</b></p>');
});

test('plans are single-use, document-bound and reject source changes before moving nodes', async ({
  page
}) => {
  const result = await transform(page, '<h3>Title</h3><p>Body</p>', `
    const template = await api.structure.parse('section>(@1+@2)');
    const plan = api.structure.plan({ roots: [...document.body.children], captures: '{h3}{p}', template });
    document.querySelector('p').textContent = 'Changed';
    try { api.structure.apply(plan); throw new Error('Accepted stale plan'); }
    catch (error) { if (!error.message.includes('stale')) throw error; }
    const next = api.structure.plan({ roots: [...document.body.children], captures: '{h3}{p}', template });
    api.structure.apply(next);
    try { api.structure.apply(next); throw new Error('Reused plan'); }
    catch (error) { if (!error.message.includes('already')) throw error; }
  `);
  expect(result.code).toContain('Changed');
});

test('class helpers preserve whole groups, exact removals and configurable stable category order', async ({
  page
}) => {
  const result = await transform(page, '<p class="md:(flex gap-4) flex -mt-4 custom-one custom-two"></p>', `
    const element = document.querySelector('p');
    api.classes.edit(element, { remove: 'flex', add: 'bg-surface md:(flex gap-4)' });
    if (!element.getAttribute('class').includes('md:(flex gap-4)')) throw new Error('Changed group');
    if (api.classes.splitVariants("before:content-['a:b']").length !== 2) throw new Error('Split arbitrary value');
    element.setAttribute('class', api.classes.sort(element.getAttribute('class'), { categories: [[/^bg-/], [/^m/]] }));
    if (element.getAttribute('class') !== 'bg-surface -mt-4 custom-one custom-two md:(flex gap-4)') throw new Error('Wrong sort');
    api.classes.edit(element, { remove: 'md:(flex gap-4)' });
  `);
  expect(result.code).toContain('class="bg-surface -mt-4 custom-one custom-two"');
});

test('comment commands can opt into structure helpers and share node identity with adjacent transforms', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    return runTransformations('<!-- wrap: section.card>div; --><p>Body</p>', [{
        name: 'Remember',
        kind: 'dom',
        code: 'document.remember = document.querySelector("p");'
      },
      {
        name: 'Wrap',
        kind: 'comment',
        command: 'wrap',
        code: 'await api.structure.wrap(nodes, args, { format: false });'
      },
      {
        name: 'Check',
        kind: 'dom',
        code: 'if (document.remember !== document.querySelector("section p")) throw new Error("Reparsed capture");'
      }
    ]);
  });
  expect(result.code).toBe('<section class="card"><div><p>Body</p></div></section>');
});

test('literal attribute markers are untouched and grouped zero repetition preserves original content', async ({
  page
}) => {
  const result = await transform(page, '<main><h3>Title</h3><p>Body</p></main>', `
    await api.structure.rewrite([document.querySelector('main')], '{h3}{p}',
      'section[title="@1 te-capture-literal {reserved}"]>(@1+(@2+span)*0)', { format: false });
  `);
  expect(result.code).toBe('<main><section title="@1 te-capture-literal {reserved}"><h3>Title</h3></section><p>Body</p></main>');
});

test('identity replacement with identical serialization invalidates a plan', async ({
  page
}) => {
  const result = await transform(page, '<h3>Title</h3><p>Body</p>', `
    const template = await api.structure.parse('section>(@1+@2)');
    const plan = api.structure.plan({ roots: [...document.body.children], captures: '{h3}{p}', template });
    document.body.innerHTML = document.body.innerHTML;
    try { api.structure.apply(plan); throw new Error('Accepted replaced nodes'); }
    catch (error) { if (!error.message.includes('stale')) throw error; }
  `);
  expect(result.code).toBe('<h3>Title</h3><p>Body</p>');
});

test('clones of multi-node captures preserve IDs and originals follow expanded template order', async ({
  page
}) => {
  const result = await transform(page, '<h3>Title</h3><p id="p1">First</p><p id="p2">Second</p>', `
    const originals = [...document.querySelectorAll('p')];
    await api.structure.rewrite([...document.body.children], '{h3}{p{2}}', 'section>(div>@2)^aside>(@1+@2)', { format: false });
    const first = [...document.querySelectorAll('section p')];
    const second = [...document.querySelectorAll('aside p')];
    if (first.some((node, index) => node !== originals[index]) || second.some(node => originals.includes(node))) throw new Error('Wrong occurrence identity');
    if (second.map(node => node.id).join(',') !== 'p1,p2') throw new Error('Changed IDs');
  `);
  expect(result.code.match(/id="p1"/g)).toHaveLength(2);
  expect(result.code).not.toContain('te-capture');
});

test('class expressions work in string transforms without loading Emmet', async ({
  page,
  context
}) => {
  let requests = 0;
  await context.route('https://cdn.jsdelivr.net/npm/emmet@2.4.11/**', route => {
    requests++;
    return route.abort();
  });
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    return runTransformations('<p>Safe</p>', [{
      name: 'Classes only',
      kind: 'string',
      code: `
      if (api.classes.tokenize('md:(flex gap-4) flex').length !== 2) throw new Error('Bad tokens');
      return code;
    `
    }]);
  });
  expect(result.code).toBe('<p>Safe</p>');
  expect(requests).toBe(0);
});

test('range captures include cloned text and comments and preserve whitespace when formatting is disabled', async ({
  page
}) => {
  const result = await transform(page, '<main>\n  text<!-- note --><p>Body</p>\n</main>', `
    await api.structure.wrap([...document.querySelector('main').childNodes], 'section>(@1+div>@1)', { format: false });
  `);
  expect(result.code).toBe('<main><section>\n  text<!-- note --><p>Body</p>\n<div>\n  text<!-- note --><p>Body</p>\n</div></section></main>');
});
