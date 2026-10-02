/**
 * Twind CSS extraction service
 */
import { TWIND_CDN, EXCLUDED_SELECTORS } from '../utils/constants.js';

export class TwindService {
  constructor() {
    this.extractedCSS = '';
  }
  
  /**
   * Get Twind setup script for injection
   * @returns {string} Script tag with Twind setup
   */
  getTwindSetupScript() {
    return `
<script type="module" id="twind-setup">
  import { install } from '${TWIND_CDN.CORE}';
  import presetAutoprefix from '${TWIND_CDN.AUTOPREFIX}';
  import presetTailwind from '${TWIND_CDN.TAILWIND}';
  
  install({
    presets: [presetAutoprefix(), presetTailwind()],
    hash: false
  });
<\/script>`;
  }
  
  /**
   * Get CSS extraction script for injection
   * @returns {string} Script tag with extraction logic
   */
  getExtractionScript() {
    const excludedList = JSON.stringify(EXCLUDED_SELECTORS);
    
    return `
<script id="twind-extractor">
(function() {
  function extractAndSend() {
    try {
      let css = '';
      const excludedSelectors = ${excludedList};
      
      const sheets = Array.from(document.styleSheets);
      let twindSheet = null;
      
      for (const sheet of sheets) {
        try {
          if (sheet.cssRules && sheet.cssRules.length > 0) {
            const ownerNode = sheet.ownerNode;
            if (ownerNode && ownerNode.tagName === 'STYLE' && !ownerNode.textContent.trim()) {
              twindSheet = sheet;
              break;
            }
          }
        } catch(e) {}
      }
      
      if (twindSheet) {
        try {
          for (let i = 0; i < twindSheet.cssRules.length; i++) {
            const rule = twindSheet.cssRules[i];
            const ruleText = rule.cssText;
            
            const selectorMatch = ruleText.match(/^([^{]+)\\{/);
            if (!selectorMatch) continue;
            
            const selector = selectorMatch[1].trim();
            
            const shouldExclude = excludedSelectors.some(excludedSelector => {
              const normalizedSelector = selector.replace(/\\s+/g, ' ').trim();
              const normalizedExcluded = excludedSelector.replace(/\\s+/g, ' ').trim();
              return normalizedSelector === normalizedExcluded;
            });
            
            if (!shouldExclude) {
              css += ruleText + '\\n';
            }
          }
        } catch(e) {
          console.warn('Could not read CSS rules:', e);
        }
      }
      
      window.parent.postMessage({
        type: 'TWIND_CSS_EXTRACTED',
        css: css
      }, '*');
      
    } catch(e) {
      console.error('Twind extraction error:', e);
      window.parent.postMessage({
        type: 'TWIND_CSS_EXTRACTED',
        css: ''
      }, '*');
    }
    
    const script = document.getElementById('twind-extractor');
    if (script) script.remove();
  }
  
  if (document.readyState === 'complete') {
    setTimeout(extractAndSend, 200);
  } else {
    window.addEventListener('load', () => setTimeout(extractAndSend, 200));
  }
})();
<\/script>`;
  }
  
  /**
   * Set extracted CSS (called from message listener)
   * @param {string} css - Extracted CSS
   */
  setExtractedCSS(css) {
    this.extractedCSS = css;
  }
  
  /**
   * Get extracted CSS
   * @returns {string} Extracted CSS
   */
  getExtractedCSS() {
    return this.extractedCSS;
  }
  
  /**
   * Count Twind classes in CSS
   * @param {string} css - CSS to analyze
   * @returns {number} Number of classes
   */
  countClasses(css) {
    if (!css) return 0;
    const matches = css.match(/\.([\w-:[\]#/.%]+)\s*\{/g);
    return matches ? matches.length : 0;
  }
}
