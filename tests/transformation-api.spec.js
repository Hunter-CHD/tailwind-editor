import {
  test,
  expect
} from '@playwright/test';

test('scoped selection includes roots, deduplicates and orders matches, and reduces overlapping roots', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    return runTransformations('<p id="outside"></p><!-- pick: ; --><section id="a"><p id="b"></p></section><p id="c"></p>', [{
      name: 'Select',
      kind: 'comment',
      command: 'pick',
      code: `
        const matches = api.select('section, p', [...elements].reverse().concat(elements[0].children[0]));
        if (matches.map(el => el.id).join(',') !== 'a,b,c') throw new Error('Wrong selection');
        if (api.outermost(matches.concat(matches)).map(el => el.id).join(',') !== 'a,c') throw new Error('Overlapping roots');
        if (api.select('#outside', elements).length) throw new Error('Escaped scope');
        if (api.select('#outside').length !== 1) throw new Error('Default scope');
        for (const element of matches) element.setAttribute('selected', '');
      `,
    }]);
  });
  expect(result.code).toBe('<p id="outside"></p><section selected id="a"><p selected id="b"></p></section><p selected id="c"></p>');
});

test('argument splitting respects selectors, nested syntax, quotes and escaped delimiters in every input type', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    const source = String.raw` [title="a|b"]:is(.a,.b) | "c|d" | x\|y | {a|(b|c)} | `;
    const expected = ['[title="a|b"]:is(.a,.b)', '"c|d"', String.raw`x\|y`, '{a|(b|c)}', ''];
    const check = `if (JSON.stringify(api.splitArgs(${JSON.stringify(source)})) !== ${JSON.stringify(JSON.stringify(expected))}) throw new Error('Bad split');`;
    return runTransformations('<!-- split: ; --><p>OK</p>', [{
        name: 'String',
        kind: 'string',
        code: check + 'return code;'
      },
      {
        name: 'DOM',
        kind: 'dom',
        code: check
      },
      {
        name: 'Command',
        kind: 'comment',
        command: 'split',
        code: check
      },
    ]);
  });
  expect(result.code).toBe('<p>OK</p>');
});

test('generated indentation preserves authored subtrees and mixed content, supports CRLF and tabs, and settles on rerun', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    const input = '<main>\r\n\t<section><div><p>keep\n  this <b>exactly</b></p></div></section><aside>word <i>word</i> tail</aside><pre><b>  code</b></pre></main>';
    const transform = {
      name: 'Format generated',
      kind: 'dom',
      code: `
      const section = document.querySelector('section');
      const options = api.indentation(section, { unit: '\\t' });
      if (options.indent !== '\\t' || options.newline !== '\\r\\n') throw new Error('Wrong indentation');
      api.formatGenerated(section, { ...options, generated: [section, section.firstElementChild] });
      api.formatGenerated(document.querySelector('aside'));
      api.formatGenerated(document.querySelector('pre'));
    `
    };
    const first = await runTransformations(input, [transform]);
    const second = await runTransformations(first.code, [transform]);
    return {
      first: first.code,
      second: second.code
    };
  });
  expect(result.first).toContain('<section>\r\n\t\t<div>\r\n\t\t\t<p>keep\n  this <b>exactly</b></p>\r\n\t\t</div>\r\n\t</section>');
  expect(result.first).toContain('<aside>word <i>word</i> tail</aside><pre><b>  code</b></pre>');
  expect(result.second).toBe(result.first);
});

test('JSON metadata is created once, safely serialized, shared across handlers and reparsing, and never merged implicitly', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    return runTransformations('<!-- meta: ; --><p>Content</p>', [{
        name: 'Create',
        kind: 'dom',
        code: `
        if (api.readJSON('frontmatter') !== undefined) throw new Error('Unexpected metadata');
        const data = api.ensureJSON('frontmatter', { title: context.name, html: '</script><b>text</b>' });
        data.title = 'not a live object';
        if (api.ensureJSON('frontmatter', { extra: true }).extra) throw new Error('Merged defaults');
      `
      },
      {
        name: 'Read',
        kind: 'comment',
        command: 'meta',
        code: `
        if (api.readJSON('frontmatter').title !== 'Example') throw new Error('Wrong metadata');
        document.querySelector('p').setAttribute('title', api.readJSON('frontmatter').title);
      `
      },
      {
        name: 'Boundary',
        kind: 'string',
        code: 'return code;'
      },
      {
        name: 'Read again',
        kind: 'dom',
        code: `
        if (api.readJSON('frontmatter').html !== '</script><b>text</b>') throw new Error('Unsafe JSON roundtrip');
        if (document.querySelectorAll('#frontmatter').length !== 1) throw new Error('Duplicated metadata');
      `
      },
    ], {
      name: 'Example'
    });
  });
  expect(result.code).toContain('editor-meta');
  expect(result.code).toContain('\\u003c/script>');
  expect(result.code).toContain('<p title="Example">Content</p>');
});

test('helper failures identify the transform and reject the pipeline instead of overwriting metadata', async ({
  page
}) => {
  await page.goto('./');
  const failures = await page.evaluate(async () => {
    const {
      runTransformations
    } = await import('./app/Services/Transformations.js');
    const errors = [];
    for (const [input, code] of [
        ['<p>Safe</p>', `api.splitArgs('[broken | x');`],
        ['<p>Safe</p>', `api.splitArgs('a | b', '||');`],
        ['<p>Safe</p>', `api.select('[', []);`],
        ['<script id="frontmatter" type="application/json">broken</script>', `api.ensureJSON('frontmatter', {});`],
        ['<div id="frontmatter">Keep</div>', `api.ensureJSON('frontmatter', {});`],
      ]) {
      try {
        await runTransformations(input, [{
          name: 'Helpers',
          kind: 'dom',
          code: 'document.body.append("temporary");' + code
        }]);
        errors.push('Unexpected success');
      } catch (error) {
        errors.push(error.message);
      }
    }
    return errors;
  });
  expect(failures).toHaveLength(5);
  for (const error of failures) {
    expect(error).toContain('Helpers:');
    expect(error).toContain('No changes were applied.');
  }
  expect(failures[0]).toContain('unclosed');
  expect(failures[3]).toContain('invalid JSON');
  expect(failures[4]).toContain('type application/json');
});
