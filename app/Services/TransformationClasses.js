// Shared scanning for utility expressions. Expressions remain opaque strings.
export function splitExpressions(source, separator = null) {
  if (typeof source !== 'string') throw new Error('Class expressions must be a string');
  const parts = [];
  const stack = [];
  const pairs = {
    '(': ')',
    '[': ']',
    '{': '}'
  };
  let quote = '';
  let start = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '\\') {
      if (++index === source.length) throw new Error('Unfinished escape in class expression');
    } else if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") quote = character;
    else if (pairs[character]) stack.push(pairs[character]);
    else if (')]}'.includes(character)) {
      if (stack.pop() !== character) throw new Error('Mismatched brackets in class expression');
    } else if (!stack.length && (separator === null ? /\s/.test(character) : character === separator)) {
      const part = source.slice(start, index);
      if (part || separator !== null) parts.push(part);
      start = index + 1;
    }
  }
  if (quote || stack.length) throw new Error('Unclosed quote or bracket in class expression');
  if (start < source.length || separator !== null) parts.push(source.slice(start));
  return parts;
}

const defaultCategories = [
  [/^(?:static|fixed|absolute|relative|sticky|isolate|isolation)$/, /^(?:inset(?:-x|-y)?|start|end|top|right|bottom|left|z)-/],
  [/^(?:w|h|min-w|min-h|max-w|max-h|size|aspect)-/],
  [/^(?:block|inline|inline-block|flow-root|flex|inline-flex|grid|inline-grid|contents|hidden|table(?:-[\w-]+)?|inline-table|list-item)$/, /^(?:flex|grow|shrink|basis|order|grid|col|row|auto-cols|auto-rows|gap|justify|items|self|content|place|overflow|overscroll)(?:-|$)/],
  [/^(?:m|mx|my|mt|mr|mb|ml|ms|me|p|px|py|pt|pr|pb|pl|ps|pe|space-x|space-y)-/],
  [/^(?:bg|from|via|to)-/],
  [/^(?:border|rounded|divide|outline|ring)(?:-|$)/],
  [/^(?:text|font|leading|tracking|decoration|whitespace|break|hyphens|indent|line-clamp|list|placeholder)(?:-|$)/, /^(?:underline|overline|line-through|no-underline|uppercase|lowercase|capitalize|normal-case|italic|not-italic|antialiased|subpixel-antialiased|truncate)$/],
  [/^(?:transition|duration|delay|ease|animate)(?:-|$)/]
];

function sort(value, {
  categories = defaultCategories,
  breakpoints = ['xs', 'sm', 'md', 'lg', 'xl', '2xl']
} = {}) {
  if (!Array.isArray(categories) || !categories.every(group => Array.isArray(group) && group.every(pattern => pattern instanceof RegExp)) ||
    !Array.isArray(breakpoints) || !breakpoints.every(name => typeof name === 'string'))
    throw new Error('Class sorting requires arrays of regex categories and breakpoint names');
  return splitExpressions(value).map((token, index) => {
      const parts = splitExpressions(token, ':');
      const utility = parts.pop();
      if (utility.startsWith('(') && utility.endsWith(')'))
        return {
          token,
          index,
          category: categories.length + 1,
          breakpoint: 0
        };
      const normalized = utility.replace(/^!/, '').replace(/!$/, '').replace(/^-/, '');
      const category = categories.findIndex(group => group.some(pattern => {
        // Do not mutate a caller's regex lastIndex, including global expressions.
        return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '')).test(normalized);
      }));
      return {
        token,
        index,
        category: category < 0 ? categories.length : category,
        breakpoint: Math.max(0, ...parts.map(variant => breakpoints.indexOf(variant) + 1))
      };
    }).sort((a, b) => a.category - b.category || a.breakpoint - b.breakpoint || a.index - b.index)
    .map(item => item.token).join(' ');
}

function edit(element, {
  add = [],
  remove = []
} = {}) {
  const expressions = value => {
    if (typeof value === 'string') return splitExpressions(value);
    if (!Array.isArray(value)) throw new Error('Class changes require a string or an array of strings');
    return value.flatMap(item => splitExpressions(item));
  };
  const additions = expressions(add);
  const removals = new Set(expressions(remove));
  const result = new Set(splitExpressions(element.getAttribute('class') || '').filter(token => !removals.has(token)));
  for (const token of additions) result.add(token);
  element.setAttribute('class', [...result].join(' '));
  return element;
}

export const transformationClasses = Object.freeze({
  tokenize: source => splitExpressions(source),
  splitVariants: source => splitExpressions(source, ':'),
  sort,
  edit
});
