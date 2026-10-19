// Source offsets preserve authored markup, including entities and line endings.
export function htmlTextRanges(source, Parser) {
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
  return ranges;
}
