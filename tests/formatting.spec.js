import {
  test,
  expect
} from '@playwright/test';
import {
  formatExportCss,
  formatAuthoredCss
} from '../app/Services/Formatting.js';
import beautify from 'js-beautify';

test('authored CSS compacts rules within the limit and includes nesting indentation', () => {
  expect(formatAuthoredCss('.a{color:red;}', beautify, {
    printWidth: 18
  })).toBe('.a { color: red; }\n');
  expect(formatAuthoredCss('.a{color:red;}', beautify, {
    printWidth: 17
  })).toBe('.a {\n  color: red;\n}\n');
  const source = '@media(min-width:600px){.a{color:red;}}';
  expect(formatAuthoredCss(source, beautify, {
    printWidth: 20
  })).toContain('  .a { color: red; }\n');
  expect(formatAuthoredCss(source, beautify, {
    printWidth: 19
  })).toContain('  .a {\n    color: red;\n  }');
  expect(formatAuthoredCss('.a{color:red;}', beautify, {
    printWidth: 19,
    indent: '  '
  })).toContain('.a {\n');
});

test('authored CSS compacts Windows line endings while preserving its output line ending', () => {
  const source = 'img {\r\n  min-width: 0\r\n}\r\n@media(min-width:768px){\r\n.a{color:red;}\r\n}';
  const result = formatAuthoredCss(source, beautify);
  expect(result).toContain('img { min-width: 0 }\r\n');
  expect(result).toContain('  .a { color: red; }\r\n');
  expect(formatAuthoredCss(result, beautify)).toBe(result);
});

test('authored CSS preserves strings, comments, nested selectors and declaration order', () => {
  const source = '.a::before{content:"a   b; }";color:red;color:blue}/* keep\ncomment */.b{display:flex}.c{color:red;&:hover{color:blue}}';
  const result = formatAuthoredCss(source, beautify);
  expect(result).toContain('"a   b; }"');
  expect(result).toContain('/* keep\ncomment */');
  expect(result.indexOf('color: red')).toBeLessThan(result.indexOf('color: blue'));
  expect(result).toMatch(/\.c \{\n/);
  expect(formatAuthoredCss(result, beautify)).toBe(result);
});

test('embedded CSS measures the configured width limit including HTML indentation', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      formatHtml
    } = await import('./app/Services/Editor.js');
    const {
      cssFormatOptions
    } = await import('./app/Services/Formatting.js');
    const width = cssFormatOptions.wrap_line_length;
    const shortSelector = '.' + 'a'.repeat(width - 20);
    const longSelector = '.' + 'b'.repeat(width - 18);
    const source = `<style>${shortSelector}{color:red;}${longSelector}{color:blue;}</style>`;
    const formatted = await formatHtml(source);
    const nested = await formatHtml(`<section><style>${shortSelector}{color:red;}</style></section>`);
    return {
      formatted,
      nested,
      shortSelector,
      longSelector,
      twice: await formatHtml(formatted)
    };
  });
  expect(result.formatted).toContain(`  ${result.shortSelector} { color: red; }\n`);
  expect(result.formatted).toContain(`  ${result.longSelector} {\n    color: blue;\n  }`);
  expect(result.nested).toContain(`    ${result.shortSelector} {\n      color: red;\n    }`);
  expect(result.twice).toBe(result.formatted);
});

test('export CSS puts each rule on one line while retaining nested groups and literal braces', () => {
  const source = '@scope (#card) {\n.flex{display:flex}.label::before{content:"}; {"}.\\{escaped\\}{color:red}@media(min-width:640px){.grid{display:grid}.gap{gap:1rem}}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}\n}';
  expect(formatExportCss(source)).toBe([
    '@scope (#card) {',
    '  .flex{display:flex}',
    '  .label::before{content:"}; {"}',
    '  .\\{escaped\\}{color:red}',
    '  @media(min-width:640px){',
    '    .grid{display:grid}',
    '    .gap{gap:1rem}',
    '  }',
    '  @keyframes spin{',
    '    from{transform:rotate(0deg)}',
    '    to{transform:rotate(360deg)}',
    '  }',
    '}',
    '',
  ].join('\n'));
});

test('export CSS merges adjacent media queries within their original context', () => {
  const media = '@media (min-width:768px)';
  const source = `@scope (#card){${media}{.md\\:p-8{padding:2rem}}${media}{.md\\:mx-auto{margin-left:auto;margin-right:auto}}${media}{.md\\:text-4xl{font-size:2.25rem;line-height:2.5rem}}${media}{.md\\:col-span-2{grid-column:span 2 / span 2}}}`;
  const output = formatExportCss(source);
  expect(output.match(/@media/g)).toHaveLength(1);
  expect(output).toContain('    .md\\:p-8{padding:2rem}\n    .md\\:mx-auto{margin-left:auto;margin-right:auto}');
  expect(output).toContain('    .md\\:text-4xl{font-size:2.25rem;line-height:2.5rem}\n    .md\\:col-span-2{grid-column:span 2 / span 2}');
  expect(formatExportCss(output)).toBe(output);
});

test('export CSS preserves media query order across intervening rules and enclosing groups', () => {
  const source = '@media(min-width:768px){.a{color:red}}.a{color:blue}@media(min-width:768px){.a{color:green}}@media(min-width:1024px){.b{display:grid}}@supports(display:grid){@media(min-width:768px){.c{display:grid}}@media(min-width:768px){.d{gap:1rem}}}';
  const output = formatExportCss(source);
  expect(output.match(/@media/g)).toHaveLength(4);
  expect(output.indexOf('color:red')).toBeLessThan(output.indexOf('color:blue'));
  expect(output.indexOf('color:blue')).toBeLessThan(output.indexOf('color:green'));
  expect(output).toContain('  @media(min-width:768px){\n    .c{display:grid}\n    .d{gap:1rem}\n  }');
  expect(formatExportCss(output)).toBe(output);
});

test('HTML formatting preserves internal text whitespace and formats markup in the browser',
  async ({
    page
  }) => {
    await page.goto('./');
    const result = await page.evaluate(async () => {
      const {
        formatHtml
      } = await import('./app/Services/Editor.js');
      const text = 'Hello   world\twith\n  existing\r\n\r\n    lines &amp; entities ' +
        'long text '.repeat(40);
      const source =
        `<section><p>  ${text}  </p><p>Before  <strong>bold\t text</strong>  after\n text</p><my-element>custom   text</my-element><template><p>template\n  text</p></template><pre>\n  pre\t text\n</pre><textarea>\n  area\t text\n</textarea><script>const value = "a   b";</script><style>.a { color: red; }</style></section>`;
      const formatted = await formatHtml(source);
      return {
        source,
        text,
        formatted,
        twice: await formatHtml(formatted)
      };
    });
    expect(result.formatted).toContain(result.text);
    for (const text of ['bold\t text', 'after\n text', 'custom   text', 'template\n  text',
        '\n  pre\t text\n', '\n  area\t text\n', 'const value = "a   b";'
      ]) {
      expect(result.formatted).toContain(text);
    }
    expect(result.formatted).toContain('\n  <p>');
    expect(result.twice).toBe(result.formatted);
  });

test('HTML formatting handles full documents, fragments, comments and marker-like text', async ({
  page
}) => {
  await page.goto('./');
  const sources = [
    '<!doctype html><html><head><title>A   title</title></head><body><p>EDITOR_TEXT_0_END  remains\n here</p></body></html>',
    '<tr><td>Table   cell\n text</td></tr>',
    '<!-- Keep   comment --><p title="a > b">A &nbsp;  B\t C</p>',
    'Only   text\n  here',
  ];
  const results = await page.evaluate(async (sources) => {
    const {
      formatHtml
    } = await import('./app/Services/Editor.js');
    return Promise.all(sources.map(formatHtml));
  }, sources);
  for (const [index, text] of ['EDITOR_TEXT_0_END  remains\n here', 'Table   cell\n text',
      'A &nbsp;  B\t C', 'Only   text\n  here'
    ].entries()) {
    expect(results[index]).toContain(text);
  }
  expect(results[0]).toContain('A   title');
  expect(results[2]).toContain('<!-- Keep   comment -->');
});

test('HTML formatting beautifies embedded CSS while preserving prose and CSS strings', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      formatHtml
    } = await import('./app/Services/Editor.js');
    const source = '<style>.card{color:red;padding:1rem;--label:"a   b"}@media(min-width:600px){.card{display:grid;gap:2rem}}</style><p>Keep   this\ttext\non its  original lines</p><template><style type="text/css">.nested{margin:0;color:blue}</style></template><style type="text/less">@value:  red;\n.x{color:  @value}</style>';
    const formatted = await formatHtml(source);
    const document = new DOMParser().parseFromString(formatted, 'text/html');
    return {
      formatted,
      css: document.querySelector('style').textContent,
      nestedCss: document.querySelector('template').content.querySelector('style').textContent,
      twice: await formatHtml(formatted),
    };
  });
  expect(result.css).toMatch(/\.card \{ color: red; padding: 1rem; --label: "a   b" }/);
  expect(result.css).toContain('padding: 1rem;');
  expect(result.css).toContain('"a   b"');
  expect(result.css).toMatch(/@media\s*\(min-width:\s*600px\)\s*\{\s*\n/);
  expect(result.nestedCss).toContain('.nested { margin: 0; color: blue }');
  expect(result.formatted).toContain('Keep   this\ttext\non its  original lines');
  expect(result.formatted).toContain('@value:  red;\n.x{color:  @value}');
  expect(result.twice).toBe(result.formatted);
});

test('closing tags follow the last text line without changing internal text whitespace', async ({
  page
}) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const {
      formatHtml
    } = await import('./app/Services/Editor.js');
    const source = '<section><p>First   line\nsecond\t line\n  </p><h1>Heading\r\n </h1><p>Before <strong>bold\n </strong> after\n </p><pre>pre\n  text\n</pre><pre><span>nested\n</span></pre><textarea>area\n</textarea><script>const value = "line";\n</script><style>.a{color:red}</style><p>Last\n </p></section>';
    const formatted = await formatHtml(source);
    return {
      formatted,
      twice: await formatHtml(formatted)
    };
  });
  expect(result.formatted).toContain('First   line\nsecond\t line</p>');
  expect(result.formatted).toContain('Heading</h1>');
  expect(result.formatted).toContain('Last</p>');
  expect(result.formatted).toContain('bold</strong> after</p>');
  expect(result.formatted).toContain('pre\n  text\n</pre>');
  expect(result.formatted).toContain('<span>nested\n</span>');
  expect(result.formatted).toContain('area\n</textarea>');
  expect(result.formatted).toContain('const value = "line";\n</script>');
  expect(result.formatted).toMatch(/\.a \{ color: red }\s*\n\s*<\/style>/);
  expect(result.twice).toBe(result.formatted);
});

for (const trigger of ['button', 'Alt+Shift+f', 'Control+Alt+f']) {
  test(`${trigger} formats single-line CSS inside an exported pre wrapper`, async ({
    page
  }) => {
    await page.goto('./');
    await page.waitForFunction(() => window.monaco?.editor.getModels().length > 0);
    const css = '*{box-sizing:border-box}body{margin:0}.chd-main{--primary:#ffe300;--secondary:#000;--accent:#de0707;--max-width:1200px;font-family:Arial,Helvetica,sans-serif;color:#202020;line-height:1.6}#iey18y,#inq8x7{display:none}.chd-main .chd-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;line-height:1.3}';
    const source = `<pre style="display:none"><style>${css}</style></pre><p>Keep   this\ttext\non its lines</p>`;
    await page.evaluate((source) => {
      const editor = window.monaco.editor.getEditors()[0];
      editor.setValue(source);
      editor.focus();
    }, source);
    if (trigger === 'button') await page.getByRole('button', {
      name: /Format/
    }).click();
    else await page.keyboard.press(trigger);
    const read = () => page.evaluate(() => window.monaco.editor.getModels()[0].getValue());
    await expect.poll(read).toContain('box-sizing: border-box');
    const formatted = await read();
    expect(formatted).toMatch(/<style>\n\s+\* \{ box-sizing: border-box }/);
    expect(formatted).toContain('--max-width: 1200px;');
    expect(formatted).toContain('Keep   this\ttext\non its lines');
    await page.evaluate(async () => {
      const editor = window.monaco.editor.getEditors()[0];
      await editor.getAction('editor.action.formatDocument').run();
    });
    expect(await read()).toBe(formatted);
  });
}
