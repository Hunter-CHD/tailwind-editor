import { htmlTextRanges } from './HtmlText.js';

export const cssFormatOptions = {
  indent_size: 2,
  wrap_line_length: 100,
  end_with_newline: true
};

// Generated CSS is already compact. Break between rules, preserving strings,
// escaped selector characters, and declaration values as supplied by Twind.
function cssBlocks(source, mergeMedia = false) {
  const root = {
    children: []
  };
  const groups = [root];
  let chunk = '';
  let ruleDepth = 0;
  let parentheses = 0;
  let brackets = 0;
  let quote = '';
  let comment = false;
  const emit = (end) => {
    if (chunk.trim()) groups.at(-1).children.push({
      text: chunk.trim(),
      start: end - chunk.trimStart().length,
      end: end - (chunk.length - chunk.trimEnd().length)
    });
    chunk = '';
  };
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    chunk += character;
    if (comment) {
      if (character === '*' && source[index + 1] === '/') {
        chunk += source[++index];
        comment = false;
      }
      continue;
    }
    if (character === '\\') {
      if (index + 1 < source.length) chunk += source[++index];
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      chunk += source[++index];
      comment = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') parentheses++;
    if (character === ')') parentheses--;
    if (character === '[') brackets++;
    if (character === ']') brackets--;
    if (parentheses || brackets) continue;
    if (character === '{') {
      if (!ruleDepth && /^\s*@(?:media|supports|(?:-webkit-)?keyframes|scope|layer|container|starting-style|document)\b/i.test(chunk)) {
        const header = chunk.trim();
        const children = groups.at(-1).children;
        const previous = children.at(-1);
        // Only adjacent identical media queries can merge without moving rules
        // past intervening CSS and changing which declaration wins.
        let group = mergeMedia && /^@media\b/i.test(header) && previous?.header === header ? previous : null;
        if (!group) {
          group = {
            header,
            children: []
          };
          children.push(group);
        }
        groups.push(group);
        chunk = '';
      } else ruleDepth++;
    } else if (character === '}') {
      if (ruleDepth) {
        if (--ruleDepth === 0) emit(index + 1);
      } else {
        chunk = chunk.slice(0, -1);
        emit(index);
        if (groups.length > 1) groups.pop();
      }
    } else if (character === ';' && !ruleDepth) emit(index + 1);
  }
  emit(source.length);
  return root;
}

export function formatExportCss(source) {
  const root = cssBlocks(source, true);
  const lines = [];

  function print(children, indent) {
    for (const node of children) {
      const padding = '  '.repeat(indent);
      if (node.header) {
        lines.push(padding + node.header);
        print(node.children, indent + 1);
        lines.push(padding + '}');
      } else lines.push(padding + node.text);
    }
  }
  print(root.children, 0);
  return lines.join('\n') + (lines.length ? '\n' : '');
}

// Fold formatter-inserted line breaks only outside CSS literals and comments.
// Nested rules and multiline literals stay expanded.
function singleLineRule(source) {
  let result = '';
  let quote = '';
  let comment = false;
  let depth = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '\\') {
      result += character + (source[++index] || '');
      continue;
    }
    if (comment) {
      result += character;
      if (character === '*' && source[index + 1] === '/') {
        result += source[++index];
        comment = false;
      }
      continue;
    }
    if (quote) {
      result += character;
      if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      result += character + source[++index];
      comment = true;
    } else if (character === '"' || character === "'") {
      result += character;
      quote = character;
    } else if (character === '\n' || character === '\r') {
      result += ' ';
      if (character === '\r' && source[index + 1] === '\n') index++;
      while (/[ \t]/.test(source[index + 1] || '') && index + 1 < source.length) index++;
    } else {
      if (character === '{' && ++depth > 1) return null;
      if (character === '}') depth--;
      result += character;
    }
  }
  return /[\r\n]/.test(result) ? null : result;
}

export function formatAuthoredCss(source, beautify, {
  printWidth = cssFormatOptions.wrap_line_length,
  indent = ''
} = {}) {
  const formatted = beautify.css(source, {
    ...cssFormatOptions,
    wrap_line_length: 0
  });
  const edits = [];

  function visit(children) {
    for (const node of children) {
      if (node.children) {
        visit(node.children);
        continue;
      }
      if (node.text.startsWith('@') || !node.text.includes('{')) continue;
      const compact = singleLineRule(node.text);
      const lineStart = formatted.lastIndexOf('\n', node.start - 1) + 1;
      const indentation = formatted.slice(lineStart, node.start);
      if (compact && indent.length + indentation.length + compact.length <= printWidth) {
        edits.push({
          start: node.start,
          end: node.end,
          text: compact
        });
      }
    }
  }
  visit(cssBlocks(formatted).children);
  let result = formatted;
  for (const edit of edits.reverse()) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

export function beautifyStyleContents(source, beautify, Parser) {
  let result = source;
  for (const {
      start,
      end,
      css
    }
    of htmlTextRanges(source, Parser).reverse()) {
    if (!css) continue;
    const text = source.slice(start, end);
    const [, leading, content, trailing] = /^([\t\n\f\r ]*)([\s\S]*?)([\t\n\f\r ]*)$/.exec(text);
    if (!content) continue;
    const indent = leading.slice(leading.lastIndexOf('\n') + 1);
    const styled = formatAuthoredCss(content, beautify, {
      indent
    }).trimEnd();
    const replacement = leading + styled.split('\n').map((line, index) =>
      index && line ? indent + line : line).join('\n') + trailing;
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}

export function beautifyHtml(source, beautify, Parser) {
  const ranges = htmlTextRanges(source, Parser);
  let prefix = 'EDITOR_TEXT_';
  while (source.includes(prefix)) prefix += '_';
  const texts = [];
  let masked = '';
  let offset = 0;
  for (const {
      start,
      end,
      css,
      preserve
    }
    of ranges) {
    const text = source.slice(start, end);
    if (css) {
      masked += source.slice(offset, start) + `${prefix}${texts.length}_END`;
      texts.push({
        css: true,
        text
      });
      offset = end;
      continue;
    }
    const match = /[^\t\n\f\r ][\s\S]*[^\t\n\f\r ]|[^\t\n\f\r ]/.exec(text);
    if (!match) continue;
    const from = start + match.index;
    const to = from + match[0].length;
    masked += source.slice(offset, from) + `${prefix}${texts.length}_END`;
    texts.push({
      css: false,
      text: match[0],
      preserve
    });
    offset = to;
  }
  masked += source.slice(offset);
  const formatted = beautify.html(masked, {
    indent_size: 2,
    wrap_line_length: 0,
    templating: ['none'],
    content_unformatted: ['pre', 'textarea', 'script', 'style'],
    end_with_newline: true,
  });
  // Remove boundary line breaks before closing tags while text is still masked,
  // so existing line breaks within the actual text cannot be changed.
  const aligned = formatted.replace(
    new RegExp(`${prefix}(\\d+)_END([\\t\\n\\f\\r ]+)(?=</)`, 'g'),
    (match, index, whitespace) => {
      const text = texts[index];
      return text.css || text.preserve || !/[\r\n]/.test(whitespace) ?
        match :
        `${prefix}${index}_END`;
    });
  return aligned.replace(new RegExp(`${prefix}(\\d+)_END`, 'g'), (_, index, position) => {
    const {
      css,
      text
    } = texts[index];
    if (!css) return text;
    // Format CSS independently, including styles inside preserved <pre> wrappers.
    const line = aligned.slice(aligned.lastIndexOf('\n', position - 1) + 1, position);
    const indent = /^[ \t]*/.exec(line)[0];
    const cssIndent = indent + '  ';
    const styled = formatAuthoredCss(text, beautify, {
      indent: cssIndent
    });
    return '\n' + styled.split('\n').map((line) => line ? cssIndent + line : '').join('\n') + indent;
  });
}
