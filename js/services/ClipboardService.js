/**
 * Clipboard service
 */
export class ClipboardService {
  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>} Success status
   */
  async copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Fallback for older browsers
      return this.fallbackCopy(text);
    }
  }
  
  /**
   * Fallback copy method
   * @param {string} text - Text to copy
   * @returns {boolean} Success status
   */
  fallbackCopy(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (e) {
      console.error('Clipboard copy failed:', e);
      return false;
    }
  }
}
