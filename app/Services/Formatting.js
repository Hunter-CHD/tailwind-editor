export const cssFormatOptions = {
  indent_size: 2,
  wrap_line_length: 100,
  end_with_newline: true
};

// Generated CSS is already compact. Break between rules, preserving strings,
// escaped selector characters, and declaration values as supplied by Twind.
export function formatExportCss(source) {
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
  const emit = () => {
    if (chunk.trim()) groups.at(-1).children.push({
      text: chunk.trim()
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
        let group = /^@media\b/i.test(header) && previous?.header === header ? previous : null;
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
        if (--ruleDepth === 0) emit();
      } else {
        chunk = chunk.slice(0, -1);
        emit();
        if (groups.length > 1) groups.pop();
      }
    } else if (character === ';' && !ruleDepth) emit();
  }
  emit();
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

// Mask text before beautifying: disabling line wrapping alone still collapses
// spaces and tabs. Source offsets retain entities and original line endings.
export function beautifyHtml(source, beautify, Parser) {
  const parser = Parser.getFragmentParser(null, {
    sourceCodeLocationInfo: true
  });
  const ranges = [];
  for (const name of ['onCharacter', 'onWhitespaceCharacter', 'onNullCharacter']) {
    const handle = parser[name].bind(parser);
    parser[name] = (token) => {
      const location = token.location;
      const element = parser.openElements.current;
      const type = element?.attrs?.find((attribute) => attribute.name === 'type')?.value;
      const css = element?.tagName === 'style' && (!type || type.trim().toLowerCase() === 'text/css');
      const preserve = parser.openElements.items.slice(0, parser.openElements.stackTop + 1).some((node) => ['pre', 'textarea', 'script', 'style', 'xmp', 'plaintext', 'listing'].includes(node.tagName));
      if (location) {
        const previous = ranges.at(-1);
        if (previous?.end === location.startOffset && previous.css === css) previous.end = location.endOffset;
        else ranges.push({
          start: location.startOffset,
          end: location.endOffset,
          css,
          preserve
        });
      }
      handle(token);
    };
  }
  parser.tokenizer.write(source, true);
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
        text: beautify.css(text, cssFormatOptions)
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
    return '\n' + text.split('\n').map((line) => line ? indent + '  ' + line : '').join('\n') + indent;
  });
}
