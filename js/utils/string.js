/**
 * String utility functions
 */

/**
 * Format bytes to human-readable string
 * @param {string|number} input - String to measure or byte count
 * @returns {string} Formatted size
 */
export function formatBytes(input) {
  const bytes = typeof input === 'number' ? input : new Blob([input]).size;
  if (bytes === 0) return '0B';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

/**
 * Truncate string to max length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add
 * @returns {string}
 */
export function truncate(str, maxLength, suffix = '...') {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + suffix;
}

/**
 * Count occurrences of pattern in string
 * @param {string} str - String to search
 * @param {RegExp} pattern - Pattern to match
 * @returns {number}
 */
export function countMatches(str, pattern) {
  const matches = str.match(pattern);
  return matches ? matches.length : 0;
}
