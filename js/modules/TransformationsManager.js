/**
 * TransformationsManager - Manages JavaScript transformations on editor content
 */
import { debounce } from '../utils/debounce.js';

export class TransformationsManager {
  constructor(storageService, eventBus) {
    this.storage = storageService;
    this.eventBus = eventBus;
    this.transformations = [];
    this.logs = [];
    this.maxLogs = 100;
    this.paused = false;
    this.isApplyingTransformations = false;
    this.autoTransformDelay = 1500; // ms delay before applying auto transforms
    
    // Create debounced function as instance property
    this.debouncedAutoTransform = debounce((content) => {
      this.runAutoTransformations(content);
    }, this.autoTransformDelay);
    
    this.load();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen for editor changes to run auto transformations
    this.eventBus.on('editor:changed', (content) => {
      this.debouncedAutoTransform(content);
    });
  }

  /**
   * Load transformations from storage
   */
  load() {
    const stored = this.storage.get('twind-editor-transformations');
    
    // If no stored transformations, create sample ones
    if (!stored || stored.length === 0) {
      this.transformations = this.createSampleTransformations();
      this.save();
    } else {
      this.transformations = stored;
    }
  }
  
  /**
   * Create sample transformations to demonstrate features
   */
  createSampleTransformations() {
    return [
      {
        id: "1790882998125",
        name: "Add frontmatter",
        code: "const parser = new DOMParser();\nconst doc = parser.parseFromString(code, 'text/html');\n\nconst existingFrontmatter = doc.getElementById(\"frontmatter\");\n\nif(!existingFrontmatter){\n  const sampleData = {\n    title: \"Document Title\",\n    description: \"Document Description\",\n    baseURL: \"\"\n  };\n\n  let frontmatterScript = doc.createElement(\"script\");\n  frontmatterScript.setAttribute(\"type\", \"application/json\");\n  frontmatterScript.setAttribute(\"id\", \"frontmatter\");\n  frontmatterScript.toggleAttribute(\"editor-meta\", true);\n  frontmatterScript.textContent = \"\\n\" + JSON.stringify(sampleData, null, 2) + \"\\n\";\n  \n  doc.body.prepend(frontmatterScript);\n  \n  return doc.head.innerHTML.trim() + \"\\n\" + doc.body.innerHTML.trim();\n} \n// IMPORTANT: Return original code unchanged to prevent triggering another cycle\nreturn code;\n",
        enabled: true,
        mode: "auto",
        target: "editor",
        order: 0
      },
      {
        id: "1790885059542",
        name: "Replace Apple Smart Quotes",
        code: "// Transform code here\nlet cleaned = code\n  .replaceAll('\u201C','\"')\n  .replaceAll('\u201D','\"')\n  .replaceAll('\u2018',\"'\")\n  .replaceAll('\u2019',\"'\");\nreturn cleaned;",
        enabled: true,
        mode: "auto",
        target: "editor",
        order: 1
      },
      {
        id: "1790886495514",
        name: "Open in new tab on external links",
        code: "const parser = new DOMParser();\nconst doc = parser.parseFromString(code, \"text/html\");\n\nlet fm = doc.getElementById(\"frontmatter\");\n\nif (!fm) return code;\n\ntry {\n  fm = JSON.parse(fm.textContent);\n} \ncatch {\n  return code;\n}\n\nif (!fm || typeof fm !== \"object\" || typeof fm.baseURL !== \"string\" || !fm.baseURL) {\n  return code;\n}\n\n// Validate baseURL\nlet baseURL;\ntry {\n  baseURL = new URL(fm.baseURL);\n} catch {\n  return code;\n}\n\n// Only allow HTTP(S) base URLs\nif (baseURL.protocol !== \"http:\" && baseURL.protocol !== \"https:\") {\n  return code;\n}\n\n// Find all links without target attributes\nconst allLinks = Array.from(doc.querySelectorAll(\"a:not([target])\"));\n\nallLinks.forEach((link) => {\n  // Skip links with no href\n  const href = link.getAttribute(\"href\");\n  if (!href) return;\n\n  // Skip relative URLs\n  let linkURL;\n  try {\n    linkURL = new URL(href);\n  } catch {\n    return;\n  }\n\n  // Same origin\n  const sameOrigin = linkURL.origin === baseURL.origin;\n\n  if (!sameOrigin) {\n    link.setAttribute(\"target\", \"_blank\");\n  }\n});\n\nreturn doc.head.innerHTML.trim() + \"\\n\" + doc.body.innerHTML.trim();",
        enabled: true,
        mode: "auto",
        target: "editor",
        order: 2
      },
      {
        id: "1790893342907",
        name: "Replace HTML Entities in Editor",
        code: "// Transform code here\nconst parser = new DOMParser();\nconst doc = parser.parseFromString(\"<body></body>\", \"text/html\");\nlet textArea = doc.createElement('textarea');\ntextArea.innerHTML = code;\nreturn textArea.value;",
        enabled: true,
        mode: "auto",
        target: "editor",
        order: 3
      },
      {
        id: "1790885769674",
        name: "Replace absolute URLs",
        code: "const parser = new DOMParser();\nconst doc = parser.parseFromString(code, \"text/html\");\n\nlet fm = doc.getElementById(\"frontmatter\");\n\nif (!fm) return code;\n\ntry {\n  fm = JSON.parse(fm.textContent);\n} catch {\n  return code;\n}\n\nif (\n  !fm ||\n  typeof fm !== \"object\" ||\n  typeof fm.baseURL !== \"string\" ||\n  !fm.baseURL\n) {\n  return code;\n}\n\n// Validate baseURL\nlet baseURL;\ntry {\n  baseURL = new URL(fm.baseURL);\n} catch {\n  return code;\n}\n\n// Only allow HTTP(S) base URLs\nif (baseURL.protocol !== \"http:\" && baseURL.protocol !== \"https:\") {\n  return code;\n}\n\n// Find all links without target attributes\nconst allLinks = Array.from(doc.querySelectorAll(\"a:not([target])\"));\n\nallLinks.forEach((link) => {\n  const href = link.getAttribute(\"href\");\n\n  // Skip links with no href\n  if (!href) return;\n\n  let linkURL;\n\n  try {\n    // Resolve relative URLs against baseURL\n    linkURL = new URL(href, baseURL);\n  } catch {\n    return;\n  }\n\n  // Same origin\n  if (linkURL.origin === baseURL.origin) {\n    // Convert to a relative URL.\n    // Keep pathname, query string, and hash.\n    const relative =\n      linkURL.pathname +\n      linkURL.search +\n      linkURL.hash;\n\n    link.setAttribute(\"href\", relative || \"./\");\n  } else {\n    link.setAttribute(\"target\", \"_blank\");\n  }\n});\n\nreturn doc.head.innerHTML.trim() + \"\\n\" + doc.body.innerHTML.trim();",
        enabled: true,
        mode: "auto",
        target: "preview",
        order: 4
      },
      {
        id: "1790885643570",
        name: "Remove Meta Editor Content before export",
        code: "const parser = new DOMParser();\nconst doc = parser.parseFromString(code, 'text/html');\nconst internalMetaContent = Array.from(doc.querySelectorAll(\"[editor-meta]\"));\n\ninternalMetaContent.forEach((element) => {element.remove()});\n\nreturn doc.head.innerHTML.trim() + \"\\n\" + doc.body.innerHTML.trim();\n",
        enabled: true,
        mode: "auto",
        target: "preview",
        order: 5
      },
      {
        id: "1790897554363",
        name: "Replace HTML Entities in Output",
        code: "// Transform code here\nconst parser = new DOMParser();\nconst doc = parser.parseFromString(\"<body></body>\", \"text/html\");\nlet textArea = doc.createElement('textarea');\ntextArea.innerHTML = code;\nreturn textArea.value;",
        enabled: true,
        mode: "auto",
        target: "preview",
        order: 6
      }
    ];
  }

  /**
   * Save transformations to storage
   */
  save() {
    this.storage.set('twind-editor-transformations', this.transformations);
  }

  /**
   * Create a new transformation
   */
  createTransformation(name, code) {
    const transformation = {
      id: Date.now().toString(),
      name: name || 'Untitled',
      code: code || '// Transform code here\nreturn code;',
      enabled: true,
      mode: 'manual', // 'manual' or 'auto'
      target: 'editor', // 'editor' or 'preview' (preview affects preview/export only)
      order: this.transformations.length
    };
    
    this.transformations.push(transformation);
    this.save();
    this.eventBus.emit('transformations:changed', this.transformations);
    
    return transformation;
  }

  /**
   * Update a transformation
   */
  updateTransformation(id, updates) {
    const index = this.transformations.findIndex(t => t.id === id);
    if (index === -1) return false;
    
    this.transformations[index] = { ...this.transformations[index], ...updates };
    this.save();
    
    // Only emit change event if it's not just a code update
    // Code updates happen frequently during editing and don't need UI refresh
    if (!updates.code || Object.keys(updates).length > 1) {
      this.eventBus.emit('transformations:changed', this.transformations);
    }
    
    return true;
  }

  /**
   * Delete a transformation
   */
  deleteTransformation(id) {
    const index = this.transformations.findIndex(t => t.id === id);
    if (index === -1) return false;
    
    this.transformations.splice(index, 1);
    this.reorderTransformations();
    this.save();
    this.eventBus.emit('transformations:changed', this.transformations);
    
    return true;
  }

  /**
   * Toggle transformation enabled state
   */
  toggleTransformation(id) {
    const transformation = this.transformations.find(t => t.id === id);
    if (!transformation) return false;
    
    transformation.enabled = !transformation.enabled;
    this.save();
    this.eventBus.emit('transformations:changed', this.transformations);
    
    return transformation.enabled;
  }

  /**
   * Set transformation mode
   */
  setMode(id, mode) {
    const transformation = this.transformations.find(t => t.id === id);
    if (!transformation) return false;
    
    transformation.mode = mode;
    this.save();
    this.eventBus.emit('transformations:changed', this.transformations);
    
    return true;
  }

  /**
   * Reorder transformations
   */
  reorderTransformations(newOrder) {
    if (newOrder) {
      this.transformations = newOrder.map((id, index) => {
        const t = this.transformations.find(t => t.id === id);
        return { ...t, order: index };
      });
    } else {
      this.transformations.forEach((t, index) => {
        t.order = index;
      });
    }
    
    this.save();
    this.eventBus.emit('transformations:changed', this.transformations);
  }

  /**
   * Move transformation up or down
   */
  moveTransformation(id, direction) {
    const index = this.transformations.findIndex(t => t.id === id);
    if (index === -1) return false;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= this.transformations.length) return false;
    
    const temp = this.transformations[index];
    this.transformations[index] = this.transformations[newIndex];
    this.transformations[newIndex] = temp;
    
    this.reorderTransformations();
    
    return true;
  }

  /**
   * Run a single transformation
   */
  runTransformation(id, code) {
    const transformation = this.transformations.find(t => t.id === id);
    if (!transformation) {
      this.log('error', `Transformation ${id} not found`);
      return { success: false, error: 'Transformation not found' };
    }

    try {
      // Create log function for transformation to use
      const logFn = (message) => {
        this.log('success', `[${transformation.name}] ${message}`);
      };
      
      // Create self object with transformation metadata
      const self = {
        id: transformation.id,
        name: transformation.name,
        enabled: transformation.enabled,
        mode: transformation.mode,
        target: transformation.target,
        order: transformation.order
      };
      
      // Create function from transformation code with code, log, and self parameters
      const fn = new Function('code', 'log', 'self', transformation.code);
      const result = fn(code, logFn, self);
      
      return { success: true, result };
    } catch (error) {
      this.log('error', `Transformation "${transformation.name}" failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run all enabled transformations in order
   */
  runAllTransformations(code) {
    const enabled = this.transformations
      .filter(t => t.enabled)
      .sort((a, b) => a.order - b.order);

    let result = code;
    const errors = [];

    for (const transformation of enabled) {
      const output = this.runTransformation(transformation.id, result);
      if (output.success) {
        result = output.result;
      } else {
        errors.push({ name: transformation.name, error: output.error });
      }
    }

    if (errors.length > 0) {
      this.log('warning', `${errors.length} transformation(s) failed`);
    }

    return { success: errors.length === 0, result, errors };
  }

  /**
   * Run auto transformations (only on valid HTML, only editor-targeted)
   */
  runAutoTransformations(code) {
    // Skip if paused or already applying transformations
    if (this.paused || this.isApplyingTransformations) return;
    
    // Check if code is valid HTML
    if (!this.isValidHTML(code)) {
      return;
    }

    const autoTransformations = this.transformations
      .filter(t => t.enabled && t.mode === 'auto' && t.target === 'editor')
      .sort((a, b) => a.order - b.order);

    if (autoTransformations.length === 0) return;

    // Set flag to prevent re-entry and cancel any pending debounced calls
    this.isApplyingTransformations = true;
    this.debouncedAutoTransform.cancel();

    let result = code;
    for (const transformation of autoTransformations) {
      const output = this.runTransformation(transformation.id, result);
      if (output.success) {
        result = output.result;
      }
    }

    // Update editor if transformations changed the code
    if (result !== code) {
      this.eventBus.emit('transformations:apply', result);
    }

    // Clear flag after a delay to ensure editor has settled
    setTimeout(() => {
      this.isApplyingTransformations = false;
    }, 200);
  }
  
  /**
   * Run preview transformations (for preview/export only)
   */
  runPreviewTransformations(code) {
    // Skip if paused
    if (this.paused) return code;
    
    const previewTransformations = this.transformations
      .filter(t => t.enabled && t.target === 'preview')
      .sort((a, b) => a.order - b.order);

    if (previewTransformations.length === 0) return code;

    let result = code;
    for (const transformation of previewTransformations) {
      const output = this.runTransformation(transformation.id, result);
      if (output.success) {
        result = output.result;
      }
    }

    return result;
  }
  
  /**
   * Pause all transformations
   */
  pause() {
    this.paused = true;
    this.eventBus.emit('transformations:paused', true);
  }
  
  /**
   * Resume all transformations
   */
  resume() {
    this.paused = false;
    this.eventBus.emit('transformations:paused', false);
  }
  
  /**
   * Toggle pause state
   */
  togglePause() {
    this.paused = !this.paused;
    this.eventBus.emit('transformations:paused', this.paused);
    return this.paused;
  }
  
  /**
   * Check if transformations are paused
   */
  isPaused() {
    return this.paused;
  }

  /**
   * Check if code is valid HTML
   */
  isValidHTML(code) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(code, 'text/html');
      const errors = doc.querySelectorAll('parsererror');
      return errors.length === 0;
    } catch {
      return false;
    }
  }

  /**
   * Add log entry
   */
  log(type, message) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      message
    };
    
    this.logs.push(entry);
    
    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    this.eventBus.emit('transformations:log', entry);
  }

  /**
   * Clear logs
   */
  clearLogs() {
    this.logs = [];
    this.eventBus.emit('transformations:logs-cleared');
  }

  /**
   * Get all transformations
   */
  getTransformations() {
    return [...this.transformations].sort((a, b) => a.order - b.order);
  }

  /**
   * Get all logs
   */
  getLogs() {
    return [...this.logs];
  }
  
  /**
   * Import transformations from array
   */
  importTransformations(transformations) {
    if (!Array.isArray(transformations)) return false;
    
    // Generate new IDs and orders for imported transformations
    const maxOrder = this.transformations.length > 0
      ? Math.max(...this.transformations.map(t => t.order))
      : -1;
    
    transformations.forEach((t, index) => {
      const newTransformation = {
        ...t,
        id: Date.now().toString() + '-' + index,
        order: maxOrder + index + 1
      };
      this.transformations.push(newTransformation);
    });
    
    this.save();
    this.eventBus.emit('transformations:changed', this.transformations);
    
    return true;
  }
}
