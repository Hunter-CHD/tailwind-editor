export class EditorManager {
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.editor = null;
    this.updateTimer = null;
    this.suppressChangeEvent = false;
  }
  
  async initialize(container) {
    return new Promise((resolve) => {
      require(['vs/editor/editor.main'], () => {
        // Configure HTML formatter
        monaco.languages.html.htmlDefaults.setOptions({
          format: {
            wrapLineLength: 0,
            wrapAttributes: 'preserve',
            endWithNewline: false,
            indentInnerHtml: false,
            preserveNewLines: true,
            maxPreserveNewLines: null,
            indentHandlebars: false,
            unformatted: '',
            contentUnformatted: 'pre,code,textarea',
            extraLiners: ''
          }
        });
        
        this.editor = monaco.editor.create(container, {
          value: '',
          language: 'html',
          ...this.config.editor
        });
        
        // Enable Emmet
        if (typeof emmetMonaco !== 'undefined') {
          emmetMonaco.emmetHTML(monaco);
          emmetMonaco.emmetCSS(monaco);
        }
        
        this.setupEventListeners();
        resolve(this.editor);
      });
    });
  }
  
  setupEventListeners() {
    this.editor.onDidChangeModelContent(() => {
      // Skip emitting events if we're programmatically setting content
      if (this.suppressChangeEvent) return;
      
      clearTimeout(this.updateTimer);
      this.eventBus.emit('editor:changing');
      this.updateTimer = setTimeout(() => {
        const content = this.editor.getValue();
        this.eventBus.emit('editor:changed', content);
      }, this.config.preview.updateDelay);
    });
    
    // Keyboard shortcuts
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      this.eventBus.emit('editor:save');
    });
  }
  
  getValue() {
    return this.editor ? this.editor.getValue() : '';
  }
  
  setValue(value) {
    if (this.editor) {
      this.editor.setValue(value);
    }
  }
  
  /**
   * Get current cursor position
   */
  getCursorPosition() {
    if (!this.editor) return null;
    return this.editor.getPosition();
  }
  
  /**
   * Set cursor position
   */
  setCursorPosition(position) {
    if (this.editor && position) {
      this.editor.setPosition(position);
      this.editor.revealPositionInCenter(position);
    }
  }
  
  /**
   * Set value while preserving cursor position (relative to content changes)
   */
  setValuePreservingCursor(newValue) {
    if (!this.editor) return;
    
    const oldValue = this.editor.getValue();
    const position = this.editor.getPosition();
    const model = this.editor.getModel();
    
    // Get lines before cursor to use as anchor
    const linesBefore = oldValue.split('\n').slice(0, position.lineNumber - 1);
    const currentLine = model.getLineContent(position.lineNumber);
    const charsBefore = currentLine.substring(0, position.column - 1);
    
    // Suppress change events while setting value
    this.suppressChangeEvent = true;
    
    // Set new value
    this.editor.setValue(newValue);
    
    // Re-enable change events
    this.suppressChangeEvent = false;
    
    // Find best matching position in new content
    const newLines = newValue.split('\n');
    let bestLine = 1;
    let bestColumn = 1;
    
    // Try to find the same line content
    for (let i = 0; i < newLines.length; i++) {
      // Check if this line matches our current line
      if (newLines[i].includes(charsBefore) || newLines[i] === currentLine) {
        bestLine = i + 1;
        const charIndex = newLines[i].indexOf(charsBefore);
        if (charIndex >= 0) {
          bestColumn = charIndex + charsBefore.length + 1;
        } else {
          bestColumn = Math.min(position.column, newLines[i].length + 1);
        }
        break;
      }
    }
    
    // If we didn't find a match, try to maintain relative position
    if (bestLine === 1 && bestColumn === 1) {
      bestLine = Math.min(position.lineNumber, newLines.length);
      bestColumn = Math.min(position.column, newLines[bestLine - 1]?.length + 1 || 1);
    }
    
    const newPosition = { lineNumber: bestLine, column: bestColumn };
    this.editor.setPosition(newPosition);
    this.editor.revealPositionInCenter(newPosition);
  }
  
  format() {
    if (this.editor) {
      this.editor.getAction('editor.action.formatDocument').run();
    }
  }
  
  layout() {
    if (this.editor) {
      this.editor.layout();
    }
  }
}
