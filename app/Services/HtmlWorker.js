// HTML editing readiness, rather than document/schema conformance. Browser HTML
// parsers repair unfinished source, so successful parsing alone is not enough.
let parserModule;
const optional = new Set(
  'html head body p li dt dd rt rp optgroup option colgroup thead tbody tfoot tr td th'.split(' '),
);
const voidTags = new Set(
  'area base br col embed hr img input link meta param source track wbr'.split(' '),
);

async function inspectHtml(source) {
  parserModule ??= import('https://cdn.jsdelivr.net/npm/parse5@8.0.1/+esm');
  const { Parser } = await parserModule;
  const errors = [];
  const options = {
    sourceCodeLocationInfo: true,
    onParseError: (error) => {
      if (!['missing-doctype', 'missing-semicolon-after-character-reference'].includes(error.code))
        errors.push(error);
    },
  };
  const fullDocument = /^\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\b|<(?:html|head|body)\b)/i.test(
    source,
  );
  // The pinned parser supplies the actual HTML tokenizer (including raw text,
  // foreign content and optional end tags). Capture end tokens to find closes
  // it would otherwise silently ignore while repairing the source.
  const parser = fullDocument ? new Parser(options) : Parser.getFragmentParser(null, options);
  const endTags = [];
  const starts = new Map();
  const start = parser.onStartTag.bind(parser);
  const end = parser.onEndTag.bind(parser);
  parser.onStartTag = (token) => {
    starts.set(token.location.startOffset, token);
    start(token);
  };
  parser.onEndTag = (token) => {
    endTags.push(token);
    end(token);
  };
  parser.tokenizer.write(source, true);
  const tree = fullDocument ? parser.document : parser.getFragment();
  const openingTags = [];
  const matchedEnds = new Set();
  const issues = [];
  function visit(node, enclosingEnd = null) {
    const location = node.sourceCodeLocation;
    if (location?.startTag) {
      openingTags.push({ start: location.startTag.startOffset, end: location.startTag.endOffset });
      if (location.endTag) matchedEnds.add(location.endTag.startOffset);
      const token = starts.get(location.startTag.startOffset);
      const html = node.namespaceURI === 'http://www.w3.org/1999/xhtml';
      if (
        !location.endTag &&
        !(html && (optional.has(node.tagName) || voidTags.has(node.tagName))) &&
        !(token?.selfClosing && !html)
      ) {
        issues.push({
          state: enclosingEnd !== null ? 'invalid' : 'incomplete',
          offset: location.startOffset,
          reason: `Missing </${node.tagName}>`,
        });
      }
    }
    const closingOffset = location?.endTag?.startOffset ?? enclosingEnd;
    for (const child of node.childNodes || []) visit(child, closingOffset);
    if (node.content) visit(node.content, closingOffset);
  }
  visit(tree);
  for (const token of endTags) {
    if (!matchedEnds.has(token.location.startOffset))
      issues.push({
        state: 'invalid',
        offset: token.location.startOffset,
        reason: `Unexpected </${token.tagName}>`,
      });
  }
  for (const error of errors) {
    issues.push({
      state:
        error.code.startsWith('eof-') || error.code === 'missing-attribute-value'
          ? 'incomplete'
          : 'invalid',
      offset: error.startOffset,
      reason:
        {
          'eof-in-tag': 'Unfinished tag or quoted attribute',
          'eof-before-tag-name': 'Unfinished tag',
          'eof-in-comment': 'Unclosed comment',
          'eof-in-element-that-can-contain-only-text': 'Unclosed script, style, or text element',
          'missing-attribute-value': 'Attribute is missing its value',
          'duplicate-attribute': 'Duplicate attribute',
        }[error.code] || error.code.replaceAll('-', ' '),
    });
  }
  // EOF diagnostics explain unfinished quotes/tags more precisely than the
  // missing parent close that follows from them.
  const issue =
    issues.find((item) => item.state === 'invalid') ||
    issues.find(
      (item) => item.reason.startsWith('Unfinished') || item.reason.startsWith('Unclosed'),
    ) ||
    issues[0];
  if (!issue) return { state: 'ready', openingTags, reason: '' };
  const line = source.slice(0, issue.offset).split('\n').length;
  return { state: issue.state, openingTags, reason: `Line ${line}: ${issue.reason}` };
}

self.onmessage = async ({ data: { id, source } }) => {
  try {
    self.postMessage({ id, result: await inspectHtml(source) });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
