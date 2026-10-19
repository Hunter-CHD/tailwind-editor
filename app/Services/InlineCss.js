import postcss from 'https://cdn.jsdelivr.net/npm/postcss@8.5.6/+esm';
import {
  Parser
} from 'https://cdn.jsdelivr.net/npm/parse5@8.0.1/+esm';
import {
  twind,
  virtual,
  stringify
} from '@twind/core';
import {
  htmlTextRanges
} from './HtmlText.js';

// Replace only CSS text ranges, retaining all surrounding authored HTML.
export function compileInlineCss(source, config) {
  try {
    return compileStyles(source, config);
  } catch (error) {
    error.code = 'INLINE_CSS_ERROR';
    throw error;
  }
}

function compileStyles(source, config) {
  const cache = new Map();
  for (const {
      start,
      end,
      css
    }
    of htmlTextRanges(source, Parser).reverse()) {
    if (!css) continue;
    const text = source.slice(start, end);
    try {
      const compiled = compileStyle(text, config, cache);
      source = source.slice(0, start) + compiled + source.slice(end);
    } catch (error) {
      const prefix = source.slice(0, start);
      const relativeLine = error.line || 1;
      const line = prefix.split('\n').length + relativeLine - 1;
      const column = (error.column || 1) + (relativeLine === 1 ? start - prefix.lastIndexOf('\n') - 1 : 0);
      const diagnostic = new Error(`CSS error at line ${line}, column ${column}: ${error.reason || error.message}`);
      diagnostic.line = line;
      diagnostic.column = column;
      throw diagnostic;
    }
  }
  return source;
}

function compileStyle(text, config, cache) {
  const root = postcss.parse(text, {
    from: undefined
  });
  const globals = new Set();
  let changed = false;
  root.walkAtRules((directive) => {
    if (directive.name.toLowerCase() !== 'apply') return;
    let parent = directive.parent;
    while (parent && parent.type !== 'rule') parent = parent.parent;
    if (!parent || directive.nodes || !directive.params.trim()) {
      throw directive.error('@apply requires utilities inside a CSS rule');
    }
    const utilities = directive.params.trim();
    if (!cache.has(utilities)) {
      try {
        cache.set(utilities, expandUtilities(utilities, config));
      } catch (error) {
        throw directive.error(error.reason || error.message);
      }
    }
    const expansion = cache.get(utilities);
    for (const rule of expansion.globals) {
      if (!globals.has(rule)) {
        globals.add(rule);
        root.append(postcss.parse(rule).nodes);
      }
    }
    directive.replaceWith(expansion.nodes.map((node) => node.clone()));
    changed = true;
  });
  if (changed) {
    return root.toString().replace(/<\/style/gi, '<\\/style');
  }
  return text;
}

function expandUtilities(utilities, config) {
  const important = /\s+!important\s*$/i.test(utilities);
  utilities = utilities.replace(/\s+!important\s*$/i, '').trim();
  if (!utilities) throw new Error('@apply requires at least one utility');
  // A private alias expands with Twind's apply ordering without registering
  // persistent global aliases or adding synthetic classes to the document.
  const engine = twind({
    ...config,
    preflight: false,
    rules: [
      ['editor-apply', {
        '@apply': utilities
      }]
    ],
  }, virtual());
  try {
    const className = engine(`${important ? '!' : ''}editor-apply`);
    const selector = `.${CSS.escape(className)}`;
    const generated = postcss.parse(stringify(engine.target));
    const nodes = [];
    const globals = [];
    for (const node of [...generated.nodes]) {
      if (node.type === 'rule' && node.selector === selector) {
        nodes.push(...node.nodes);
      } else {
        let local = false;
        const replace = (rule) => {
          if (rule.selector.includes(selector)) {
            rule.selector = rule.selector.split(selector).join('&');
            local = true;
          }
        };
        if (node.type === 'rule') replace(node);
        node.walkRules?.(replace);
        if (local) nodes.push(node);
        else globals.push(node.toString());
      }
    }
    return {
      nodes,
      globals
    };
  } finally {
    engine.destroy();
  }
}
