import {
  createStructureApi
} from './TransformationStructure.js';
import {
  transformationClasses
} from './TransformationClasses.js';

// Helpers for authored transformations. Emmet loads lazily on structure.parse.
export function splitArgs(source, separator = '|') {
  if (typeof source !== 'string' || typeof separator !== 'string' || separator.length !== 1)
    throw new Error('splitArgs expects a string and a single-character separator');
  const parts = [];
  const stack = [];
  const pairs = {
    '(': ')',
    '[': ']',
    '{': '}'
  };
  let start = 0;
  let quote = '';
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '\\') {
      index++;
      if (index === source.length) throw new Error('splitArgs: unfinished escape');
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (pairs[character]) stack.push(pairs[character]);
    else if (')]}'.includes(character)) {
      if (stack.pop() !== character) throw new Error('splitArgs: mismatched brackets');
    } else if (character === separator && !stack.length) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quote || stack.length) throw new Error('splitArgs: unclosed quote or bracket');
  parts.push(source.slice(start).trim());
  return parts;
}

function rootsArray(roots) {
  return roots?.nodeType ? [roots] : Array.from(roots);
}

export function createTransformationApi(document) {
  if (!document) return Object.freeze({
    splitArgs,
    classes: transformationClasses
  });

  function select(selector, roots = document) {
    // Validate even when the supplied roots are empty.
    if (typeof selector !== 'string' || !selector.trim()) throw new Error('select requires a CSS selector');
    document.createElement('div').querySelectorAll(selector);
    const matches = new Set();
    for (const root of rootsArray(roots)) {
      if (root.nodeType === 1 && root.matches(selector)) matches.add(root);
      for (const match of root.querySelectorAll(selector)) matches.add(match);
    }
    // Traversing their common document avoids depending on partial DOM implementations
    // of compareDocumentPosition. Detached matches retain discovery order, at the end.
    const ordered = [];
    for (const element of document.querySelectorAll('*')) {
      if (matches.delete(element)) ordered.push(element);
    }
    return [...ordered, ...matches];
  }

  function outermost(elements) {
    const unique = [...new Set(elements)];
    return unique.filter(element => !unique.some(other => other !== element && other.contains(element)));
  }

  function indentation(node, {
    unit = '  '
  } = {}) {
    if (!/^[ \t]+$/.test(unit)) throw new Error('Indentation unit must contain spaces or tabs');
    // Only use whitespace immediately before this node, never an unrelated sibling.
    let before = '';
    for (let previous = node.previousSibling; previous?.nodeType === 3; previous = previous.previousSibling)
      before = previous.textContent + before;
    const indent = /(?:^|\r\n|\r|\n)([ \t]*)$/.exec(before)?.[1] ?? '';
    const newline = before.match(/\r\n|\r|\n/)?.[0] ?? '\n';
    return {
      indent,
      unit,
      newline
    };
  }

  function formatGenerated(root, options = {}) {
    const {
      generated = [root], indent, unit, newline
    } = {
      ...indentation(root),
      ...options
    };
    if (!/^[ \t]*$/.test(indent) || !/^[ \t]+$/.test(unit) || !/^(?:\r\n|\r|\n)$/.test(newline))
      throw new Error('Invalid generated markup indentation');
    const allowed = new Set(generated);

    function format(element, padding) {
      if (!allowed.has(element) || element.nodeType !== 1 || /^(pre|textarea|script|style)$/i.test(element.localName)) return;
      const children = [...element.childNodes];
      // Formatting mixed content could change visible text. Leave it untouched.
      if (!children.some(child => child.nodeType === 1) ||
        children.some(child => child.nodeType !== 1 && (child.nodeType !== 3 || /[^\t\r\n ]/.test(child.textContent)))) return;
      for (const child of children) {
        if (child.nodeType === 3) child.remove();
        else {
          format(child, padding + unit);
          element.insertBefore(document.createTextNode(newline + padding + unit), child);
        }
      }
      element.append(document.createTextNode(newline + padding));
    }
    format(root, indent);
    return root;
  }

  function metadataElement(id) {
    if (typeof id !== 'string' || !id.trim()) throw new Error('JSON metadata requires a nonempty ID');
    const element = document.getElementById(id);
    if (element && (element.localName !== 'script' || element.getAttribute('type')?.trim().toLowerCase() !== 'application/json'))
      throw new Error(`JSON metadata "${id}" must be a script with type application/json`);
    return element;
  }

  function readJSON(id) {
    const element = metadataElement(id);
    if (!element) return undefined;
    try {
      return JSON.parse(element.textContent);
    } catch {
      throw new Error(`JSON metadata "${id}" contains invalid JSON`);
    }
  }

  function ensureJSON(id, defaults, {
    parent = document.body,
    editorMeta = true
  } = {}) {
    if (metadataElement(id)) return readJSON(id);
    const json = JSON.stringify(defaults, null, 2);
    if (json === undefined) throw new Error(`JSON metadata "${id}" requires a JSON value`);
    const element = document.createElement('script');
    element.setAttribute('type', 'application/json');
    element.id = id;
    if (editorMeta) element.setAttribute('editor-meta', '');
    // JSON script contents are raw text in HTML: prevent embedded closing tags.
    element.textContent = '\n' + json.replaceAll('<', '\\u003c') + '\n';
    parent.prepend(element);
    return JSON.parse(json);
  }

  const helpers = {
    select,
    outermost,
    indentation,
    formatGenerated,
    splitArgs,
    readJSON,
    ensureJSON,
    classes: transformationClasses
  };
  helpers.structure = createStructureApi(document, helpers);
  return Object.freeze(helpers);
}
