import { twind, virtual, consume, stringify } from '@twind/core';
import presetTailwind from '@twind/preset-tailwind';
import presetAutoprefix from '@twind/preset-autoprefix';
import { formatCss } from './Editor.js';

export function compile(document, content = document.content) {
  const { markup, exportContext, ...result } = compileSource(document, content);
  const output = prepareExport(markup, result.css, exportContext);
  return { ...result, exportHtml: output.before + generatedStyle(output.css) + output.after };
}

export async function compileExport(document, content = document.content) {
  const { markup, exportContext, ...result } = compileSource(document, content);
  const output = prepareExport(markup, result.css, exportContext);
  const css = await formatCss(output.css);
  return { ...result, css, exportHtml: output.before + generatedStyle(css) + output.after };
}

function generatedStyle(css) {
  const safeCss = css.replace(/<\/style/gi, '<\\/style');
  return `<style data-generated="tailwind-editor">\n${safeCss.trimEnd()}\n</style>`;
}

function compileSource(document, content) {
  const config = {
    presets: [presetAutoprefix(), presetTailwind()],
    preflight: document.preflight,
    hash: false,
    theme: { extend: { colors: document.colors } },
  };
  const engine = twind(config, virtual());

  try {
    engine(document.safelist);
    const markup = consume(content, engine);
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    const exportContext = inspectExport(markup, parsed);
    const includeDocumentRules = ['html', 'body'].includes(exportContext.wrapperTag);
    // Twind's virtual sheet stores each generated rule separately. Filter the
    // document preflight rules without touching utility values or authored CSS.
    const css = stringify(
      includeDocumentRules
        ? engine.target
        : engine.target.filter((rule) => !/^(?:html|body)\{/.test(rule)),
    );
    const safeCss = css.replace(/<\/style/gi, '<\\/style');
    if (!parsed.documentElement.lang) parsed.documentElement.lang = 'en';
    if (!parsed.querySelector('meta[charset]')) {
      const charset = parsed.createElement('meta');
      charset.setAttribute('charset', 'UTF-8');
      parsed.head.prepend(charset);
    }
    if (!parsed.querySelector('meta[name="viewport"]')) {
      const viewport = parsed.createElement('meta');
      viewport.name = 'viewport';
      viewport.content = 'width=device-width, initial-scale=1';
      parsed.head.append(viewport);
    }
    if (!parsed.title) parsed.title = document.name.replace(/\.html?$/i, '');
    const style = parsed.createElement('style');
    style.dataset.generated = 'tailwind-editor';
    style.textContent = safeCss;
    parsed.head.append(style);
    // Reset the preview frame without adding rules to generated/exported CSS.
    // Authored styles and utilities can still override this baseline.
    const previewReset = parsed.createElement('style');
    previewReset.dataset.preview = 'document-reset';
    previewReset.textContent = 'html, body { margin: 0; padding: 0; }';
    parsed.head.prepend(previewReset);
    const classes = new Set(
      [...parsed.querySelectorAll('[class]')].flatMap((element) => [...element.classList]),
    );
    return {
      html: '<!doctype html>\n' + parsed.documentElement.outerHTML,
      markup,
      exportContext,
      css,
      classes: classes.size,
    };
  } finally {
    engine.destroy();
  }
}

function inspectExport(markup, parsed) {
  // Comments before the doctype/html tag still belong to a full document.
  const documentStart =
    /^(\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype[^>]*>\s*)?(?:<(?:html|body)\b[^>]*>\s*)?)/i.exec(
      markup,
    )[0];
  const prolog = documentStart.replace(/<!--[\s\S]*?-->/g, '');
  const isFullDocument = /<!doctype\b|<html\b/i.test(prolog);
  let wrapper;

  if (isFullDocument) {
    wrapper = parsed.documentElement;
  } else if (/<body\b/i.test(prolog)) {
    // Fragment parsing strips body/html tags; only use the parsed body when
    // there is an authored opening body tag, not the parser's synthetic body.
    wrapper = parsed.body;
  } else {
    // Template parsing preserves fragment-only elements such as tr/td.
    const template = globalThis.document.createElement('template');
    template.innerHTML = markup;
    const ignoredTags = new Set(['PRE', 'STYLE', 'SCRIPT', 'LINK', 'META', 'TEMPLATE']);
    const eligibleChildren = (element) =>
      [...element.children].filter((child) => !ignoredTags.has(child.tagName));
    let mostChildren = -1;
    for (const candidate of eligibleChildren(template.content)) {
      const count = eligibleChildren(candidate).length;
      if (count > mostChildren) {
        wrapper = candidate;
        mostChildren = count;
      }
    }
  }

  // Prefer a stable authored ID, otherwise use the tag and all existing classes.
  // CSS.escape handles Tailwind variants, arbitrary values, and numeric IDs.
  // With only ignored elements/text, match nothing instead of leaking global CSS.
  const selector = wrapper
    ? wrapper.id
      ? `#${CSS.escape(wrapper.id)}`
      : CSS.escape(wrapper.localName) +
        [...wrapper.classList].map((name) => `.${CSS.escape(name)}`).join('')
    : ':not(*)';

  return { isFullDocument, documentStart, selector, wrapperTag: wrapper?.localName };
}

function prepareExport(markup, css, { isFullDocument, documentStart, selector }) {
  if (isFullDocument) {
    const headEnd = /<\/head\s*>/i.exec(markup);
    const index = headEnd ? headEnd.index : documentStart.length;
    return { css, before: markup.slice(0, index), after: `\n${markup.slice(index)}` };
  }
  return {
    css: `@scope (${selector}) {\n${css}\n}`,
    before: '<pre style="display:none">',
    after: `</pre>\n\n${markup}`,
  };
}
