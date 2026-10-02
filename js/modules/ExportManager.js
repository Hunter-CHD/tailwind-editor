import { formatBytes } from '../utils/string.js';

export class ExportManager {
  constructor(eventBus, twindService) {
    this.eventBus = eventBus;
    this.twindService = twindService;
  }
  
  buildExportHTML(userHTML, css) {
    if (!css) return userHTML;
    
    let exported = userHTML;
    
    // Remove Twind scripts
    exported = exported.replace(
      /<script[^>]*id=["']twind-setup["'][^>]*>[\s\S]*?<\/script>/gi,
      ''
    );
    exported = exported.replace(
      /<script[^>]*id=["']twind-extractor["'][^>]*>[\s\S]*?<\/script>/gi,
      ''
    );
    
    const trimmedExport = exported.trim().toLowerCase();
    const isFullDocument =
      trimmedExport.startsWith('<!doctype') ||
      trimmedExport.startsWith('<html');
    
    if (isFullDocument) {
      const styleBlock = `
  <style>

${css}

  </style>`;
      
      if (exported.includes('</head>')) {
        exported = exported.replace('</head>', `${styleBlock}\n</head>`);
      } else {
        exported = `${styleBlock}\n${exported}`;
      }
      
      return exported;
    }
    
    // Fragment handling
    const parser = new DOMParser();
    const tempDoc = parser.parseFromString(
      `<div id="__export-root">${exported}</div>`,
      'text/html'
    );
    const container = tempDoc.getElementById('__export-root');
    
    const ignoredTags = ['style', 'pre', 'link', 'script'];
    const validChildren = [...container.children].filter(el => {
      return !ignoredTags.includes(el.tagName.toLowerCase());
    });
    
    let wrapperSelector = '.chd-main';
    let needsWrapper = true;
    
    if (validChildren.length === 1) {
      const rootElement = validChildren[0];
      let selector = '';
      
      if (rootElement.id) {
        selector += `#${rootElement.id}`;
      }
      if (rootElement.classList.length) {
        selector += [...rootElement.classList].map(cls => `.${cls}`).join('');
      }
      
      if (selector) {
        wrapperSelector = selector;
        needsWrapper = false;
      } else {
        rootElement.classList.add('chd-main');
        wrapperSelector = '.chd-main';
        exported = container.innerHTML;
        needsWrapper = false;
      }
    }
    
    if (needsWrapper) {
      exported = `<div class="chd-main">\n${exported}\n</div>`;
      wrapperSelector = '.chd-main';
    }
    
    const scopedCSS = `
@scope (${wrapperSelector}) {
${css}
}
`;
    
    const styleBlock = `<pre style="display:none"><style>

${scopedCSS}

</style></pre>\n\n`;
    
    return styleBlock + exported;
  }
  
  getExportStats(userHTML) {
    const css = this.twindService.getExtractedCSS();
    const finalHTML = this.buildExportHTML(userHTML, css);
    
    return {
      classes: this.twindService.countClasses(css),
      cssSize: formatBytes(css),
      htmlSize: formatBytes(finalHTML),
      css: css,
      html: finalHTML
    };
  }
}
