export class PreviewManager {
  constructor(config, eventBus, twindService) {
    this.config = config;
    this.eventBus = eventBus;
    this.twindService = twindService;
    this.iframe = null;
    this.popoutWindow = null;
    this.savedScrollPosition = { x: 0, y: 0 };
    this.popoutScrollPosition = { x: 0, y: 0 };
    
    this.setupMessageListener();
  }
  
  setIframe(iframe) {
    this.iframe = iframe;
  }
  
  setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'TWIND_CSS_EXTRACTED') {
        this.twindService.setExtractedCSS(event.data.css);
        this.eventBus.emit('twind:extracted', event.data.css);
      }
    });
  }
  
  update(code) {
    if (this.iframe) {
      this.updateFrame(this.iframe, code);
    }
    if (this.popoutWindow && !this.popoutWindow.closed) {
      this.updateFrame(this.popoutWindow, code, true);
    }
  }
  
  updateFrame(target, code, isPopout = false) {
    const doc = isPopout ? target.document : (target.contentDocument || target.contentWindow.document);
    
    // Save scroll position
    try {
      if (doc && doc.documentElement) {
        const pos = {
          x: doc.documentElement.scrollLeft || doc.body.scrollLeft || 0,
          y: doc.documentElement.scrollTop || doc.body.scrollTop || 0
        };
        if (isPopout) {
          this.popoutScrollPosition = pos;
        } else {
          this.savedScrollPosition = pos;
        }
      }
    } catch (e) {}
    
    const twindSetup = this.twindService.getTwindSetupScript();
    const extractionScript = isPopout ? '' : this.twindService.getExtractionScript();
    
    const isFullDocument = code.trim().toLowerCase().startsWith('<!doctype') ||
      code.trim().toLowerCase().startsWith('<html');
    
    let modifiedCode;
    
    if (isFullDocument) {
      modifiedCode = code;
      if (code.includes('</head>')) {
        modifiedCode = modifiedCode.replace('</head>', twindSetup + '\n</head>');
      } else if (code.includes('<body')) {
        modifiedCode = modifiedCode.replace('<body', twindSetup + '\n<body');
      } else {
        modifiedCode = twindSetup + '\n' + modifiedCode;
      }
      
      if (!isPopout && modifiedCode.includes('</body>')) {
        modifiedCode = modifiedCode.replace('</body>', extractionScript + '\n</body>');
      } else if (!isPopout) {
        modifiedCode = modifiedCode + extractionScript;
      }
    } else {
      modifiedCode = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  ${twindSetup}
</head>
<body>
${code}
${extractionScript}
</body>
</html>`;
    }
    
    doc.open();
    doc.write(modifiedCode);
    doc.close();
    
    // Restore scroll position
    const restoreScroll = () => {
      try {
        const pos = isPopout ? this.popoutScrollPosition : this.savedScrollPosition;
        if (doc && doc.documentElement && (pos.x !== 0 || pos.y !== 0)) {
          const win = isPopout ? target : target.contentWindow;
          win.requestAnimationFrame(() => {
            doc.documentElement.scrollLeft = pos.x;
            doc.documentElement.scrollTop = pos.y;
            doc.body.scrollLeft = pos.x;
            doc.body.scrollTop = pos.y;
          });
        }
      } catch (e) {}
    };
    
    if (isPopout) {
      target.onload = restoreScroll;
    } else {
      target.onload = restoreScroll;
    }
    setTimeout(restoreScroll, 50);
  }
  
  openPopout() {
    if (this.popoutWindow && !this.popoutWindow.closed) {
      this.popoutWindow.focus();
      return;
    }
    
    this.popoutWindow = window.open('', 'TwindPreview');
    
    if (!this.popoutWindow) {
      this.eventBus.emit('toast:show', {
        message: 'Popup blocked - please allow popups',
        type: 'error'
      });
      return;
    }
    
    // Get current editor content and update the popout immediately
    this.eventBus.emit('preview:get-content');
    
    this.eventBus.emit('preview:popout-opened');
    
    // Monitor closure
    const checkClosed = setInterval(() => {
      if (this.popoutWindow.closed) {
        clearInterval(checkClosed);
        this.popoutWindow = null;
        this.eventBus.emit('preview:popout-closed');
      }
    }, 500);
    
    this.eventBus.emit('toast:show', {
      message: 'Preview opened in new window',
      type: 'success'
    });
  }
}
