import {
  parseTemplate,
  withImplicitCapture,
  templateData,
  structureLimits
} from './EmmetTemplate.js';

const plans = new WeakMap();
const htmlNamespace = 'http://www.w3.org/1999/xhtml';

function array(value) {
  return value?.nodeType ? [value] : Array.from(value || []);
}

export function parseCaptures(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('structure captures: expected selectors');
  source = source.trim();
  if (!source.startsWith('{')) return [{
    selector: source,
    anchor: true
  }];
  const captures = [];
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] || '') && index < source.length) index++;
    if (index === source.length) break;
    if (source[index++] !== '{') throw new Error(`structure captures at column ${index}: expected {`);
    const start = index;
    let depth = 1;
    let brackets = 0;
    let quote = '';
    while (index < source.length && depth) {
      const character = source[index++];
      if (character === '\\') index++;
      else if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '[') brackets++;
      else if (character === ']') brackets--;
      else if (!brackets && character === '{') depth++;
      else if (!brackets && character === '}') depth--;
    }
    if (depth || brackets || quote) throw new Error('structure captures: unclosed group');
    let selector = source.slice(start, index - 1).trim();
    const quantifier = /\{(\d+)(?:,(\d*))?\}$/.exec(selector);
    let min = 1;
    let max = Infinity;
    if (quantifier) {
      selector = selector.slice(0, quantifier.index).trim();
      min = Number(quantifier[1]);
      max = quantifier[0].includes(',') ? (quantifier[2] ? Number(quantifier[2]) : Infinity) : min;
    } else if (selector.endsWith('}')) throw new Error('structure captures: invalid count; use {n}, {n,m}, or {n,}');
    if (!captures.length && quantifier) throw new Error('structure captures: anchor counts are implicit; omit the anchor quantifier');
    captures.push({
      selector,
      min,
      max,
      anchor: captures.length === 0
    });
  }
  if (!captures.length) throw new Error('structure captures: expected at least one selector');
  return captures;
}

function pathOf(element) {
  if (element.nodeType !== 1) return element.nodeType === 3 ? '#text' : '#comment';
  const parts = [];
  for (let current = element; current?.nodeType === 1; current = current.parentElement) {
    let part = current.localName;
    if (current.id) part += '#' + current.id;
    const siblings = array(current.parentNode?.children).filter(node => node.localName === current.localName);
    if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    parts.unshift(part);
  }
  return parts.join(' > ');
}

function reject(diagnostics) {
  const error = new Error('structure: ' + diagnostics.map(item => item.message).join('\n'));
  error.diagnostics = diagnostics;
  throw error;
}

function nodeCount(node) {
  let count = 0;
  const pending = [node];
  while (pending.length) {
    const current = pending.pop();
    if (++count > structureLimits.cloneNodes) throw new Error('structure: capture node budget exceeded');
    pending.push(...current.childNodes);
  }
  return count;
}

export function createStructureApi(document, helpers) {
  function specifications(input) {
    const captures = typeof input === 'string' ? parseCaptures(input) : array(input).map(spec => ({
      ...spec
    }));
    if (!captures.length) throw new Error('structure: expected at least one capture');
    return captures.map((spec, index) => {
      if (typeof spec.selector !== 'string' || !spec.selector.trim()) throw new Error('structure: captures require CSS selectors');
      helpers.select(spec.selector, []);
      const min = spec.min ?? 1;
      const max = spec.max ?? Infinity;
      const relation = spec.relation ?? 'any-following';
      if (!Number.isSafeInteger(min) || min < 0 || !(max === Infinity || Number.isSafeInteger(max)) || max < min ||
        !['any-following', 'next', 'following'].includes(relation)) throw new Error('structure: invalid capture bounds or relation');
      if (index && spec.anchor) throw new Error('structure: only the first capture may be an anchor');
      if (!index && (min !== 1 || max !== Infinity || relation !== 'any-following')) throw new Error('structure: the anchor is one element with implicit bounds');
      return {
        selector: spec.selector,
        min,
        max,
        relation
      };
    });
  }

  function plan({
    template,
    roots = [],
    captures,
    nodes = [],
    mode = 'captures',
    format = true,
    unit = '  '
  } = {}) {
    const compiled = templateData(template);
    if (!['captures', 'sections', 'range'].includes(mode)) throw new Error('structure: unknown grouping mode');
    if (!/^[ \t]+$/.test(unit)) throw new Error('structure: indentation unit must be spaces or tabs');
    const specs = mode === 'range' ? [] : specifications(captures);
    const captureCount = mode === 'captures' ? specs.length : 1;
    for (const index of compiled.referenced) {
      if (index > captureCount) throw new Error(`structure: @${index} has no defined capture`);
    }
    const groups = [];
    const diagnostics = [];
    if (mode === 'range' || mode === 'sections') {
      const range = array(nodes);
      if (!range.length) throw new Error('structure: expected a nonempty sibling node range');
      const parent = range[0].parentNode;
      if (!parent || !document.contains(parent)) throw new Error('structure: range must be in the current document');
      range.forEach((node, index) => {
        if (node.parentNode !== parent || (index && range[index - 1].nextSibling !== node))
          throw new Error('structure: range nodes must be contiguous siblings in document order');
      });
      if (mode === 'range') groups.push({
        anchor: range[0],
        parent,
        captures: [range]
      });
      else {
        if (specs.length !== 1) throw new Error('structure: section mode takes one anchor selector');
        let group;
        for (const node of range) {
          if (node.nodeType === 1 && node.matches(specs[0].selector)) {
            group = {
              anchor: node,
              parent,
              captures: [
                []
              ]
            };
            groups.push(group);
          }
          if (group) group.captures[0].push(node);
        }
      }
    } else {
      const scope = array(roots);
      for (const root of scope) {
        if (root.ownerDocument !== document || !document.contains(root)) throw new Error('structure: roots must belong to the current document');
      }
      const anchors = helpers.select(specs[0].selector, scope);
      for (const anchor of anchors) {
        const parent = anchor.parentNode;
        const siblings = array(parent.children);
        const start = siblings.indexOf(anchor);
        const next = siblings.findIndex((node, index) => index > start && node.matches(specs[0].selector));
        const window = siblings.slice(start + 1, next < 0 ? undefined : next);
        const group = {
          anchor,
          parent,
          captures: [
            [anchor]
          ]
        };
        for (let index = 1; index < specs.length; index++) {
          const spec = specs[index];
          const eligible = window.filter(node => (spec.relation !== 'next' || node === anchor.nextElementSibling) && node.matches(spec.selector));
          const selected = eligible.slice(0, spec.max);
          group.captures.push(selected);
          if (selected.length < spec.min) diagnostics.push({
            type: 'partial-match',
            anchor: pathOf(anchor),
            text: anchor.textContent.trim().slice(0, 80),
            capture: index + 1,
            selector: spec.selector,
            min: spec.min,
            max: spec.max === Infinity ? null : spec.max,
            found: eligible.length,
            window: {
              parent: pathOf(parent),
              nextAnchor: next < 0 ? null : pathOf(siblings[next])
            },
            message: `${pathOf(anchor)} (${JSON.stringify(anchor.textContent.trim().slice(0, 80))}): @${index + 1} ${spec.selector} requires ${spec.min}..${spec.max === Infinity ? 'unlimited' : spec.max}, found ${eligible.length}; window ends ${next < 0 ? 'at parent end' : 'before ' + pathOf(siblings[next])}`
          });
        }
        groups.push(group);
      }
    }
    if (!groups.length) diagnostics.push({
      type: 'no-anchor',
      message: 'no anchors matched in the supplied scope'
    });
    if (groups.length > structureLimits.groups) throw new Error('structure: matched group limit exceeded');
    const owners = [];
    for (const [groupIndex, group] of groups.entries()) {
      for (const [captureIndex, captured] of group.captures.entries()) {
        for (const node of captured) {
          if (node.namespaceURI && node.namespaceURI !== htmlNamespace) throw new Error('structure: namespace captures are unsupported');
          for (const other of owners) {
            if (node === other.node || node.contains(other.node) || other.node.contains(node)) diagnostics.push({
              type: 'overlap',
              capture: captureIndex + 1,
              group: groupIndex + 1,
              otherCapture: other.capture + 1,
              otherGroup: other.group + 1,
              message: `overlapping captures: group ${other.group + 1} @${other.capture + 1} ${pathOf(other.node)} and group ${groupIndex + 1} @${captureIndex + 1} ${pathOf(node)}`
            });
          }
          owners.push({
            node,
            group: groupIndex,
            capture: captureIndex
          });
        }
      }
    }
    if (diagnostics.length) reject(diagnostics);
    const occurrences = new Map();

    function countReferences(tree) {
      for (const instruction of tree) {
        if (instruction.type === 'capture') occurrences.set(instruction.index, (occurrences.get(instruction.index) || 0) + 1);
        else countReferences(instruction.children);
      }
    }
    countReferences(compiled.tree);
    let expanded = compiled.size * groups.length;
    if (expanded > structureLimits.cloneNodes) throw new Error('structure: output node budget exceeded');
    for (const group of groups) {
      // Snapshot every reused capture before any original is moved.
      group.snapshots = new Map();
      group.spacing = helpers.indentation(group.anchor, {
        unit
      });
      for (const [index, times] of occurrences) {
        const captured = group.captures[index - 1];
        expanded += captured.reduce((count, node) => count + nodeCount(node), 0) * times;
        if (expanded > structureLimits.cloneNodes) throw new Error('structure: output node budget exceeded');
        if (times > 1) group.snapshots.set(index, captured.map(node => node.cloneNode(true)));
      }
    }
    const identities = [];
    const pending = owners.map(({
      node
    }) => node);
    while (pending.length) {
      const node = pending.pop();
      if (identities.length >= structureLimits.cloneNodes) throw new Error('structure: captured subtree budget exceeded');
      identities.push({
        node,
        parent: node.parentNode,
        next: node.nextSibling
      });
      pending.push(...node.childNodes);
    }
    const handle = Object.freeze({
      mode,
      groups: groups.length
    });
    plans.set(handle, {
      document,
      snapshot: document.toString(),
      identities,
      groups,
      compiled,
      format,
      applied: false
    });
    return handle;
  }

  function apply(handle) {
    const state = plans.get(handle);
    if (!state || state.document !== document) throw new Error('structure: plan belongs to another document or is invalid');
    if (state.applied || state.snapshot !== document.toString() || state.identities.some(({
          node,
          parent,
          next
        }) =>
        !document.contains(node) || node.parentNode !== parent || node.nextSibling !== next))
      throw new Error('structure: plan is stale or has already been applied');
    // Prepare detached generated nodes and clone placements before live mutations.
    const prepared = state.groups.map(group => {
      const generated = [];
      const moves = [];
      const seen = new Set();

      function render(tree) {
        const output = [];
        for (const instruction of tree) {
          if (instruction.type === 'capture') {
            const index = instruction.index;
            if (seen.has(index)) output.push(...group.snapshots.get(index).map(node => node.cloneNode(true)));
            else {
              seen.add(index);
              const marker = document.createComment('structure-placement');
              moves.push({
                marker,
                nodes: group.captures[index - 1]
              });
              output.push(marker);
            }
          } else if (instruction.type === 'text') {
            output.push(document.createTextNode(instruction.value), ...render(instruction.children));
          } else {
            const element = document.createElement(instruction.tag);
            generated.push(element);
            for (const [name, value] of Object.entries(instruction.attributes)) element.setAttribute(name, value);
            element.append(...render(instruction.children));
            output.push(element);
          }
        }
        return output;
      }
      const fragment = document.createDocumentFragment();
      fragment.append(...render(state.compiled.tree));
      return {
        group,
        generated,
        moves,
        fragment
      };
    });
    state.applied = true;
    const output = [];
    for (const {
        group,
        generated,
        moves,
        fragment
      }
      of prepared) {
      // A capture-only/zero template with no placements is a deliberate no-op.
      if (!fragment.childNodes.length) continue;
      const insertion = document.createComment('structure-anchor');
      group.parent.insertBefore(insertion, group.anchor);
      for (const {
          marker,
          nodes
        }
        of moves) {
        for (const node of nodes) {
          // Remove only a separate line of indentation before a moved element.
          // Meaningful text, comments, and inline spaces stay at their old position.
          const previous = node.previousSibling;
          if (state.format && node.nodeType === 1 && previous?.nodeType === 3 && /^[ \t\r\n]*$/.test(previous.textContent) && /[\r\n]/.test(previous.textContent) &&
            !nodes.includes(previous) && previous.previousSibling !== insertion) previous.remove();
          marker.before(node);
        }
        marker.remove();
      }
      const roots = [...fragment.childNodes];
      if (state.format)
        for (const root of roots) {
          if (generated.includes(root)) helpers.formatGenerated(root, {
            generated,
            ...group.spacing
          });
        }
      insertion.before(fragment);
      insertion.remove();
      output.push(...roots);
    }
    return output;
  }

  async function rangeTemplate(source) {
    return withImplicitCapture(await parseTemplate(source));
  }

  return Object.freeze({
    parse: parseTemplate,
    selectors: parseCaptures,
    plan,
    apply,
    async wrap(nodes, source, options = {}) {
      return apply(plan({
        ...options,
        mode: 'range',
        nodes,
        template: await rangeTemplate(source)
      }));
    },
    async sections(nodes, selector, source = 'section', options = {}) {
      return apply(plan({
        ...options,
        mode: 'sections',
        nodes,
        captures: [{
          selector
        }],
        template: await rangeTemplate(source)
      }));
    },
    async rewrite(roots, captures, source, options = {}) {
      return apply(plan({
        ...options,
        mode: 'captures',
        roots,
        captures,
        template: await parseTemplate(source)
      }));
    }
  });
}
