export function validateTailwindBaseSize(value) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.01)
    throw new Error('Tailwind base size must be a number of at least 0.01px.');
  return value;
}

// Runs on Twind declarations, including @apply expansions, before insertion.
// Preserve strings, URLs, comments, and identifiers that happen to contain rem.
// Selectors and media conditions are deliberately outside this conversion.
export function useTailwindBaseSize(rule) {
  return {
    ...rule,
    d: rule.d?.replace(
      /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|url\((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\\.|[^)"'\\])*\)|(?<![\w.\\\-\u0080-\uffff])(-?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?)rem(?![\w\-\u0080-\uffff])/gi,
      (token, amount) => amount === undefined ? token : `calc(${Number(amount)} * var(--twe-rem))`,
    ),
  };
}
