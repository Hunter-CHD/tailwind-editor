const MAX_SOURCE = 16000;
export const structureLimits = Object.freeze({
  nodes: 5000,
  depth: 64,
  groups: 500,
  cloneNodes: 20000
});
const templates = new WeakMap();
let dependency;
let sequence = 0;

export function templateData(template) {
  const data = templates.get(template);
  if (!data) throw new Error('structure: expected a template returned by await api.structure.parse()');
  return data;
}

export function withImplicitCapture(template) {
  const data = templateData(template);
  if (data.referenced.size) return template;
  const tree = structuredClone(data.tree);
  let branch = tree;
  while (branch.length === 1 && branch[0].type === 'element') {
    if (!branch[0].children.length) {
      if (voidTags.has(branch[0].tag.toLowerCase())) fail(`void element ${branch[0].tag} cannot receive a capture`);
      if (data.size + 1 > structureLimits.nodes) fail('expanded node budget exceeded');
      branch[0].children.push({
        type: 'capture',
        index: 1,
        column: 1
      });
      const handle = Object.freeze({
        source: template.source,
        references: Object.freeze([1])
      });
      templates.set(handle, {
        tree,
        referenced: new Set([1]),
        size: data.size + 1
      });
      return handle;
    }
    branch = branch[0].children;
  }
  throw new Error('structure: branched or text-producing range templates require an explicit @1');
}

function fail(message, column = 1) {
  throw new Error(`structure template at column ${column}: ${message}`);
}

function preprocess(source) {
  if (typeof source !== 'string' || !source.trim()) fail('expected a nonempty expression');
  if (source.length > MAX_SOURCE) fail(`expression exceeds ${MAX_SOURCE} characters`);
  const prefix = `te-capture-${++sequence}-`;
  let lowered = '';
  const positions = [];
  const captures = new Map();
  let quote = '';
  let brackets = 0;
  let parentheses = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    const append = text => {
      lowered += text;
      positions.push(...Array(text.length).fill(index));
    };
    if (character === '\\') {
      append(character);
      if (++index >= source.length) fail('unfinished escape', index);
      append(source[index]);
      continue;
    }
    if (quote) {
      append(character);
      if (character === quote) quote = '';
      continue;
    }
    if (brackets && (character === '"' || character === "'")) quote = character;
    else if (character === '[') brackets++;
    else if (character === ']') {
      if (!brackets--) fail('unmatched attribute bracket', index + 1);
    } else if (!brackets) {
      if (source.startsWith('te-capture-', index)) fail('reserved internal placeholder name', index + 1);
      if (character === '{' || character === '}') fail('text literals are unsupported; braces are reserved', index + 1);
      if (character === '"' || character === "'" || character === '|' || character === '/' || character === '!')
        fail(`unsupported token ${character}`, index + 1);
      if (character === '(' && ++parentheses > structureLimits.depth) fail('nesting depth exceeded', index + 1);
      if (character === ')' && --parentheses < 0) fail('unmatched group', index + 1);
      if (character === '@') {
        const previous = source.slice(0, index).trimEnd().at(-1);
        if (!previous || '>+^('.includes(previous)) {
          const match = /^@([1-9]\d*)/.exec(source.slice(index));
          if (!match) fail('expected a capture number after @', index + 1);
          const capture = Number(match[1]);
          if (!Number.isSafeInteger(capture)) fail('invalid capture number', index + 1);
          const name = prefix + captures.size;
          captures.set(name, {
            index: capture,
            column: index + 1
          });
          append(name);
          index += match[0].length - 1;
          continue;
        }
      }
      if (/\s/.test(character)) {
        const previous = source.slice(0, index).trimEnd().at(-1);
        const next = source.slice(index + 1).trimStart()[0];
        if (previous && next && !'>+^(*'.includes(previous) && !'>+^)*'.includes(next))
          fail('whitespace is allowed only around structural operators', index + 1);
        continue;
      }
    }
    append(character);
  }
  if (brackets || quote || parentheses) fail('unclosed attribute, quote, or group', source.length);
  positions.push(source.length);
  return {
    lowered,
    positions,
    captures
  };
}

async function loadEmmet() {
  dependency ||= Promise.all([
    import('https://cdn.jsdelivr.net/npm/emmet@2.4.11/+esm'),
    import('https://cdn.jsdelivr.net/npm/@emmetio/abbreviation@2.3.3/+esm')
  ]).catch(error => {
    dependency = null;
    throw new Error(`structure: Emmet dependency could not load: ${error.message}`);
  });
  return dependency;
}

export async function parseTemplate(source) {
  const lowered = preprocess(source);
  const [emmet, abbreviation] = await loadEmmet();
  let raw;
  try {
    raw = abbreviation.parse(abbreviation.tokenize(lowered.lowered));
  } catch (error) {
    const position = error.pos ?? error.position ?? 0;
    fail(error.message.split('\n')[0], (lowered.positions[position] ?? 0) + 1);
  }
  const tokenText = tokens => (tokens || []).map(token => token.value || '').join('');
  const columnOf = node => (lowered.positions[node.name?.[0]?.start ?? node.repeat?.start ?? 0] ?? 0) + 1;
  const referenced = new Set();
  // Validate before conversion. Emmet converts a zero repeat to one; prune zeros
  // only after validating all original branches, including capture children.
  function validate(node, depth = 0) {
    if (depth > structureLimits.depth) fail('nesting depth exceeded', columnOf(node));
    if (node.value) fail('literal values and editor fields are unsupported', columnOf(node));
    const name = tokenText(node.name);
    const capture = lowered.captures.get(name);
    if (name.startsWith('te-capture-') && !capture) fail('capture attributes are unsupported', columnOf(node));
    if (capture) {
      referenced.add(capture.index);
      if (node.attributes?.length || node.elements.length) fail('captures cannot have attributes or children', capture.column);
    } else if (node.type === 'TokenElement') {
      if (node.name && node.name.some(token => !['Literal', 'RepeaterNumber'].includes(token.type))) fail('unsupported element name', columnOf(node));
      if (name && (!/^[a-zA-Z][\w$-]*$/.test(name) || /^(?:svg|math)$/i.test(name))) fail('unsupported tag or namespace', columnOf(node));
      if (node.selfClose) fail('explicit self-closing syntax is unsupported', columnOf(node));
      for (const attribute of node.attributes || []) {
        for (const token of [...(attribute.name || []), ...(attribute.value || [])]) {
          if (!['Literal', 'Quote', 'RepeaterNumber'].includes(token.type)) fail('unsupported attribute expression or editor field', columnOf(node));
        }
        if (attribute.expression) fail('attribute expressions are unsupported', columnOf(node));
      }
    }
    if (node.repeat && (node.repeat.implicit || !Number.isSafeInteger(node.repeat.count) || node.repeat.count < 0 || node.repeat.count > structureLimits.nodes))
      fail('repetition requires an integer from 0 to ' + structureLimits.nodes, columnOf(node));
    const count = node.type === 'TokenElement' ? 1 : 0;
    const children = (node.elements || []).reduce((sum, child) => sum + validate(child, depth + 1), 0);
    const size = (count + children) * (node.repeat?.count ?? 1);
    if (size > structureLimits.nodes) fail('expanded node budget exceeded', columnOf(node));
    return size;
  }
  validate(raw);

  function normalize(node) {
    node.elements = node.elements.filter(child => child.repeat?.count !== 0);
    for (const child of node.elements) {
      if (child.type === 'TokenElement' && !child.name) child.name = [{
        type: 'Literal',
        value: 'div'
      }];
      // Keep literal tags literal; override only names actually present, disabling
      // snippets such as a -> a[href] without reimplementing lorem generation.
      normalize(child);
    }
  }
  normalize(raw);
  const snippets = Object.create(null);

  function literalSnippets(node) {
    if (node.type === 'TokenElement') {
      const name = tokenText(node.name);
      if (name && !/^lorem(?:\d+)?$/.test(name)) snippets[name] = name;
      const lorem = /^lorem(\d+)?$/.exec(name);
      if (lorem && Number(lorem[1] || 30) > 1000) fail('lorem word limit is 1000', columnOf(node));
    }
    node.elements.forEach(literalSnippets);
  }
  literalSnippets(raw);
  const resolved = emmet.parseMarkup(abbreviation.convert(raw, {
    maxRepeat: structureLimits.nodes
  }), emmet.resolveConfig({
    syntax: 'html',
    snippets,
    maxRepeat: structureLimits.nodes,
    options: {
      'output.format': false,
      'bem.enabled': false,
      'markup.href': false
    }
  }));
  let count = 0;

  function valueOf(values = []) {
    if (values.some(value => typeof value !== 'string')) fail('editor fields are unsupported');
    return values.join('');
  }

  function adapt(node, depth = 0) {
    if (++count > structureLimits.nodes || depth > structureLimits.depth) fail('resolved tree budget exceeded');
    const capture = lowered.captures.get(node.name);
    if (capture) return {
      type: 'capture',
      index: capture.index,
      column: capture.column
    };
    const children = (node.children || []).map(child => adapt(child, depth + 1));
    const value = valueOf(node.value);
    if (!node.name) return {
      type: 'text',
      value,
      children
    };
    if (!/^[a-zA-Z][\w-]*$/.test(node.name) || /^(?:svg|math)$/i.test(node.name)) fail('unsupported resolved tag');
    if (voidTags.has(node.name.toLowerCase()) && (children.length || value)) fail(`void element ${node.name} cannot have children`);
    const attributes = Object.create(null);
    for (const attribute of node.attributes || []) {
      if (!attribute.name || !/^[^\s"'<>/=]+$/.test(attribute.name)) fail('invalid attribute name');
      attributes[attribute.name] = valueOf(attribute.value);
    }
    if (value) children.unshift({
      type: 'text',
      value,
      children: []
    });
    return {
      type: 'element',
      tag: node.name,
      attributes,
      children
    };
  }
  const tree = resolved.children.map(node => adapt(node));
  const handle = Object.freeze({
    source,
    references: Object.freeze([...referenced])
  });
  templates.set(handle, {
    tree,
    referenced,
    size: count
  });
  return handle;
}

const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
