import { EventBus } from './EventBus.js';
import { StorageService } from '../services/StorageService.js';
import { ClipboardService } from '../services/ClipboardService.js';
import { DownloadService } from '../services/DownloadService.js';
import { TwindService } from '../services/TwindService.js';
import { TabManager } from '../modules/TabManager.js';
import { EditorManager } from '../modules/EditorManager.js';
import { PreviewManager } from '../modules/PreviewManager.js';
import { ExportManager } from '../modules/ExportManager.js';
import { SettingsManager } from '../modules/SettingsManager.js';
import { TransformationsManager } from '../modules/TransformationsManager.js';
import { Toast } from '../components/Toast.js';

export class App {
  constructor(config) {
    this.config = config;
    this.eventBus = new EventBus();
    this.services = {};
    this.modules = {};
    this.components = {};
    this.previewVisible = true;
    this.lastPreviewWidth = config.preview.defaultWidth;
  }
  
  async mount(selector) {
    const container = document.querySelector(selector);
    if (!container) {
      throw new Error(`Container ${selector} not found`);
    }
    
    this.container = container;
    this.initializeServices();
    this.initializeModules();
    await this.initializeUI();
    this.attachGlobalListeners();
    
    // Expose for debugging
    if (this.config.debug) {
      window.app = this;
    }
  }
  
  initializeServices() {
    this.services.storage = new StorageService(this.config.storage);
    this.services.clipboard = new ClipboardService();
    this.services.download = new DownloadService();
    this.services.twind = new TwindService();
  }
  
  initializeModules() {
    this.modules.tabs = new TabManager(this.services.storage, this.eventBus, this.config);
    this.modules.editor = new EditorManager(this.config, this.eventBus);
    this.modules.preview = new PreviewManager(this.config, this.eventBus, this.services.twind);
    this.modules.export = new ExportManager(this.eventBus, this.services.twind);
    this.modules.settings = new SettingsManager(this.services.storage, this.eventBus);
    this.modules.transformations = new TransformationsManager(this.services.storage, this.eventBus);
  }
  
  async initializeUI() {
    // Build basic structure
    this.container.innerHTML = `
      <header id="header">
        <div class="logo"><span>Twind Editor</span></div>
        <div class="spacer"></div>
        <button class="btn btn-ghost" data-action="settings">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1v2M8 13v2M15 8h-2M3 8H1M13.5 13.5l-1.4-1.4M3.9 3.9L2.5 2.5M13.5 2.5l-1.4 1.4M3.9 12.1l-1.4 1.4" />
          </svg>
          Settings
        </button>
        <button class="btn btn-ghost" data-action="toggle-preview">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="1" y="3" width="14" height="10" rx="1.5" />
            <path d="M6 3v10" />
          </svg>
          Preview
        </button>
        <button class="btn btn-ghost" data-action="popout">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
            <path d="M9 2v3h3M12 5l-3-3" />
          </svg>
          Popout
        </button>
        <button class="btn btn-accent" data-action="export">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M8 2v8M5 7l3 3 3-3M3 12h10" />
          </svg>
          Export
        </button>
      </header>
      
      <div class="toolbar">
        <div id="tabs-container" style="display: flex; gap: 6px; align-items: center;"></div>
        <button class="btn btn-ghost" data-action="add-tab" style="font-size:11px;padding:4px 10px;">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
        <div class="spacer"></div>
        <button class="btn btn-ghost" data-action="transformations" style="font-size:11px;padding:4px 10px;">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 8h12M8 2v12" />
            <circle cx="8" cy="8" r="2" />
          </svg>
          Transformations
        </button>
        <button class="btn btn-ghost" data-action="format" style="font-size:11px;padding:4px 10px;">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 4h12M2 8h8M2 12h10" />
          </svg>
          Format
        </button>
        <button class="btn btn-ghost" data-action="clear" style="font-size:11px;padding:4px 10px;">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
          Clear
        </button>
      </div>
      
      <div class="workspace" id="workspace">
        <div class="editor-pane">
          <div id="editor-container"></div>
        </div>
        <div class="divider" id="divider"></div>
        <div class="preview-pane" id="previewPane" style="width: 45%;">
          <div class="preview-header">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="1" y="3" width="14" height="10" rx="1.5" />
              <path d="M5 8h6M5 10.5h4" />
            </svg>
            <span class="preview-title">Preview</span>
            <div class="spacer"></div>
            <button class="btn btn-ghost" style="font-size:10px;padding:3px 8px;" data-action="refresh">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="11" height="11">
                <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" />
                <path d="M10 2.5h3.5V6" />
              </svg>
              Refresh
            </button>
          </div>
          <iframe id="previewFrame" class="preview-frame" sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups"></iframe>
        </div>
      </div>
      
      <button class="collapse-btn" id="collapseBtn" data-action="toggle-preview">
        <svg id="collapseIcon" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 2l4 4-4 4" />
        </svg>
      </button>
      
      <div id="modals"></div>
      <div id="toast"></div>
    `;
    
    // Initialize toast
    this.components.toast = new Toast(this.eventBus);
    this.components.toast.mount('#toast');
    
    // Initialize editor
    const editorContainer = document.getElementById('editor-container');
    await this.modules.editor.initialize(editorContainer);
    
    // Load initial tab
    const activeTab = this.modules.tabs.getActiveTab();
    if (activeTab) {
      this.modules.editor.setValue(activeTab.content);
    }
    
    // Initialize preview
    const iframe = document.getElementById('previewFrame');
    this.modules.preview.setIframe(iframe);
    
    // Render tabs
    this.renderTabs();
    
    // Initial preview
    setTimeout(() => {
      this.modules.preview.update(this.modules.editor.getValue());
    }, 200);
    
    // Setup UI event listeners
    this.setupUIListeners();
    this.setupDividerResize();
    this.setupModals();
  }
  
  renderTabs() {
    const container = document.getElementById('tabs-container');
    const tabs = this.modules.tabs.getAllTabs();
    const activeTab = this.modules.tabs.getActiveTab();
    
    container.innerHTML = '';
    
    tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = 'tab' + (tab.id === activeTab?.id ? ' active' : '');
      tabEl.style.cssText = 'display: flex; align-items: center; gap: 6px; position: relative; padding-right: 8px;';
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = tab.name;
      nameSpan.style.cursor = 'pointer';
      nameSpan.onclick = () => this.eventBus.emit('tab:switch', tab.id);
      
      tabEl.appendChild(nameSpan);
      
      if (tabs.length > 1) {
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = 'background: none; border: none; color: inherit; cursor: pointer; font-size: 16px; padding: 0; margin-left: 4px; opacity: 0.6; line-height: 1;';
        closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
        closeBtn.onmouseout = () => closeBtn.style.opacity = '0.6';
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          this.eventBus.emit('tab:close', tab.id);
        };
        tabEl.appendChild(closeBtn);
      }
      
      nameSpan.ondblclick = (e) => {
        e.stopPropagation();
        const newName = prompt('Enter new tab name:', tab.name);
        if (newName && newName.trim()) {
          this.eventBus.emit('tab:rename', { tabId: tab.id, name: newName.trim() });
        }
      };
      
      container.appendChild(tabEl);
    });
  }
  
  setupUIListeners() {
    // Header actions
    document.getElementById('header').addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;
      
      const action = button.dataset.action;
      if (action === 'settings') this.openSettings();
      if (action === 'toggle-preview') this.togglePreview();
      if (action === 'popout') this.modules.preview.openPopout();
      if (action === 'export') this.openExport();
    });
    
    // Toolbar actions
    document.querySelector('.toolbar').addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;
      
      const action = button.dataset.action;
      if (action === 'add-tab') this.eventBus.emit('tab:create');
      if (action === 'transformations') this.openTransformations();
      if (action === 'format') this.modules.editor.format();
      if (action === 'clear') {
        if (confirm('Clear all code?')) {
          this.modules.editor.setValue('');
        }
      }
      if (action === 'refresh') {
        const code = this.modules.editor.getValue();
        const transformed = this.modules.transformations.runPreviewTransformations(code);
        this.modules.preview.update(transformed);
      }
    });
    
    // Collapse button (outside header/toolbar)
    document.getElementById('collapseBtn').addEventListener('click', () => {
      this.togglePreview();
    });
    
    // Event bus listeners
    this.eventBus.on('editor:changed', (content) => {
      // Skip if we're applying a transformation to prevent infinite loops
      if (this.applyingTransformation) return;
      
      const activeTab = this.modules.tabs.getActiveTab();
      if (activeTab) {
        this.eventBus.emit('tab:update', { tabId: activeTab.id, content });
      }
      const transformed = this.modules.transformations.runPreviewTransformations(content);
      this.modules.preview.update(transformed);
    });
    
    this.eventBus.on('tab:switched', (tab) => {
      if (tab) {
        this.modules.editor.setValue(tab.content);
        this.renderTabs();
        const transformed = this.modules.transformations.runPreviewTransformations(tab.content);
        this.modules.preview.update(transformed);
      }
    });
    
    this.eventBus.on('tabs:changed', () => {
      this.renderTabs();
    });
    
    this.eventBus.on('preview:popout-opened', () => {
      if (this.previewVisible) {
        this.togglePreview();
      }
    });
    
    this.eventBus.on('preview:popout-closed', () => {
      if (!this.previewVisible) {
        this.togglePreview();
      }
    });
    
    this.eventBus.on('preview:get-content', () => {
      // Send current content to popout window
      const content = this.modules.editor.getValue();
      const transformed = this.modules.transformations.runPreviewTransformations(content);
      this.modules.preview.update(transformed);
    });
    
    this.eventBus.on('transformations:apply', (content) => {
      // Apply transformed content to editor while preserving cursor position
      this.applyingTransformation = true;
      this.modules.editor.setValuePreservingCursor(content);
      // Reset flag after a short delay to allow editor to settle
      setTimeout(() => {
        this.applyingTransformation = false;
      }, 100);
    });
    
    this.eventBus.on('transformations:changed', () => {
      // Re-render transformations list if modal is open
      if (this.transformationsModalOpen) {
        this.renderTransformations();
      }
    });
  }
  
  setupDividerResize() {
    const divider = document.getElementById('divider');
    const previewPane = document.getElementById('previewPane');
    const workspace = document.getElementById('workspace');
    let isDragging = false;
    
    divider.addEventListener('mousedown', () => {
      isDragging = true;
      divider.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging || !this.previewVisible) return;
      const rect = workspace.getBoundingClientRect();
      const total = rect.width;
      const mouseX = e.clientX - rect.left;
      const previewWidth = total - mouseX - 4;
      const previewPct = (previewWidth / total) * 100;
      
      if (previewPct > this.config.preview.minWidth && previewPct < this.config.preview.maxWidth) {
        previewPane.style.width = previewPct + '%';
        this.lastPreviewWidth = previewPct + '%';
      }
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        divider.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setTimeout(() => this.modules.editor.layout(), 50);
      }
    });
  }
  
  setupModals() {
    // Export modal
    const modalsContainer = document.getElementById('modals');
    modalsContainer.innerHTML += `
      <div class="modal-overlay" id="exportModal">
        <div class="modal">
          <div class="modal-header">
            <div>
              <div class="modal-title">Export Code</div>
              <div class="modal-subtitle">Twind classes are tree-shaken to only what's used</div>
            </div>
            <button class="modal-close" data-action="close-export">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" width="12" height="12">
                <path d="M1 1l10 10M11 1L1 11" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="export-info">
              <div class="export-stat">
                <div class="export-stat-num" id="statClasses">0</div>
                <div class="export-stat-lbl">Twind Classes</div>
              </div>
              <div class="export-stat">
                <div class="export-stat-num" id="statCssSize">0B</div>
                <div class="export-stat-lbl">CSS Size</div>
              </div>
              <div class="export-stat">
                <div class="export-stat-num" id="statHtmlSize">0B</div>
                <div class="export-stat-lbl">HTML Size</div>
              </div>
            </div>
            <div class="export-section">
              <div class="export-label">Extracted CSS Preview</div>
              <div class="export-preview" id="cssPreview">Analysing...</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" data-action="copy-export">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="5" y="5" width="9" height="9" rx="1.5" />
                <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
              </svg>
              Copy to Clipboard
            </button>
            <button class="btn btn-accent" data-action="download-export">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M8 2v8M5 7l3 3 3-3M3 12h10" />
              </svg>
              Download .html
            </button>
          </div>
        </div>
      </div>
      
      <div class="modal-overlay" id="settingsModal">
        <div class="modal">
          <div class="modal-header">
            <div>
              <div class="modal-title">Settings</div>
              <div class="modal-subtitle">Manage your editor preferences</div>
            </div>
            <button class="modal-close" data-action="close-settings">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" width="12" height="12">
                <path d="M1 1l10 10M11 1L1 11" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="export-section">
              <div class="export-label">Auto-Save</div>
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                <div style="flex: 1; font-size: 12px; color: var(--muted);">
                  Your code is automatically saved to browser storage
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <div class="status-dot" style="box-shadow: none;"></div>
                  <span style="font-size: 11px; color: var(--green); font-weight: 600;">Active</span>
                </div>
              </div>
            </div>
            <div class="export-section">
              <div class="export-label">Storage Usage</div>
              <div style="font-size: 12px; color: var(--muted); margin-bottom: 16px;">
                <div style="margin-bottom: 8px;">
                  <strong>Total:</strong> <span id="savedTotalSize">0B</span>
                </div>
                <div style="margin-bottom: 8px;">
                  <strong>Editor Code:</strong> <span id="savedEditorSize">0B</span>
                </div>
                <div>
                  <strong>Transformations:</strong> <span id="savedTransformationsSize">0B</span>
                </div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-ghost" data-action="clear-editor-storage" style="flex: 1;">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M3 3l10 10M13 3L3 13" />
                  </svg>
                  Clear Editor
                </button>
                <button class="btn btn-ghost" data-action="clear-transformations-storage" style="flex: 1;">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M3 3l10 10M13 3L3 13" />
                  </svg>
                  Clear Transforms
                </button>
              </div>
              <button class="btn btn-ghost" data-action="clear-all-storage" style="width: 100%; margin-top: 8px;">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
                Clear All Data
              </button>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-accent" data-action="close-settings">Done</button>
          </div>
        </div>
      </div>
      
      <div class="modal-overlay" id="transformationsModal">
        <div class="modal modal-large">
          <div class="modal-header">
            <div>
              <div class="modal-title">Transformations</div>
              <div class="modal-subtitle">Run JavaScript transformations on your code</div>
            </div>
            <button class="modal-close" data-action="close-transformations">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" width="12" height="12">
                <path d="M1 1l10 10M11 1L1 11" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="transformations-header">
              <button class="btn btn-accent" data-action="add-transformation">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M8 3v10M3 8h10" />
                </svg>
                Add Transformation
              </button>
              <button class="btn btn-ghost" data-action="run-all-transformations">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M4 3l8 5-8 5z" />
                </svg>
                Run All
              </button>
              <button class="btn btn-ghost" data-action="export-transformations">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M8 2v8M5 7l3 3 3-3M3 12h10" />
                </svg>
                Export
              </button>
              <button class="btn btn-ghost" data-action="import-transformations">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M8 10V2M5 5l3-3 3 3M3 12h10" />
                </svg>
                Import
              </button>
              <input type="file" id="transformationsFileInput" accept=".json" style="display: none;" />
              <div class="spacer"></div>
              <button class="btn btn-ghost" id="pauseTransformationsBtn" data-action="toggle-pause-transformations">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="5" y="3" width="2" height="10" rx="0.5" />
                  <rect x="9" y="3" width="2" height="10" rx="0.5" />
                </svg>
                <span id="pauseTransformationsText">Pause All</span>
              </button>
            </div>
            <div class="transformations-content">
              <div class="transformations-list-container">
                <div id="transformations-list" class="transformations-list"></div>
              </div>
              <div class="transformations-logs">
                <div class="export-label" style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                  <span>Logs</span>
                  <button class="btn btn-ghost" data-action="clear-logs" style="font-size:10px;padding:3px 8px;">Clear</button>
                </div>
                <div id="transformations-log" class="transformations-log"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="modal-overlay" id="codeEditorModal">
        <div class="modal modal-fullscreen">
          <div class="modal-header">
            <div>
              <div class="modal-title">Edit Transformation Code</div>
              <div class="modal-subtitle" id="codeEditorSubtitle">JavaScript transformation function</div>
            </div>
            <button class="modal-close" data-action="close-code-editor">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" width="12" height="12">
                <path d="M1 1l10 10M11 1L1 11" />
              </svg>
            </button>
          </div>
          <div class="modal-body" style="padding: 0; flex: 1; display: flex; flex-direction: column;">
            <div id="codeEditorContainer" style="flex: 1; min-height: 400px;"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" data-action="close-code-editor">Cancel</button>
            <button class="btn btn-accent" data-action="save-code-editor">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M13 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" />
                <path d="M5 2v4h6V2M9 14v-4H7v4" />
              </svg>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    `;
    
    // Modal event listeners
    document.getElementById('exportModal').addEventListener('click', (e) => {
      if (e.target.id === 'exportModal') this.closeExport();
      const button = e.target.closest('[data-action]');
      if (!button) return;
      
      if (button.dataset.action === 'close-export') this.closeExport();
      if (button.dataset.action === 'copy-export') this.copyExport();
      if (button.dataset.action === 'download-export') this.downloadExport();
    });
    
    document.getElementById('settingsModal').addEventListener('click', (e) => {
      if (e.target.id === 'settingsModal') this.closeSettings();
      const button = e.target.closest('[data-action]');
      if (!button) return;
      
      if (button.dataset.action === 'close-settings') this.closeSettings();
      if (button.dataset.action === 'clear-editor-storage') this.clearEditorStorage();
      if (button.dataset.action === 'clear-transformations-storage') this.clearTransformationsStorage();
      if (button.dataset.action === 'clear-all-storage') this.clearAllStorage();
    });
    
    document.getElementById('transformationsModal').addEventListener('click', (e) => {
      if (e.target.id === 'transformationsModal') this.closeTransformations();
      const button = e.target.closest('[data-action]');
      if (!button) return;
      
      const action = button.dataset.action;
      if (action === 'close-transformations') this.closeTransformations();
      if (action === 'add-transformation') this.addTransformation();
      if (action === 'run-all-transformations') this.runAllTransformations();
      if (action === 'export-transformations') this.exportTransformations();
      if (action === 'import-transformations') this.importTransformations();
      if (action === 'toggle-pause-transformations') this.togglePauseTransformations();
      if (action === 'clear-logs') this.clearTransformationLogs();
      if (action === 'delete-transformation') this.deleteTransformation(button.dataset.id);
      if (action === 'toggle-transformation') this.toggleTransformation(button.dataset.id);
      if (action === 'run-transformation') this.runTransformation(button.dataset.id);
      if (action === 'move-up') this.moveTransformation(button.dataset.id, 'up');
      if (action === 'move-down') this.moveTransformation(button.dataset.id, 'down');
      if (action === 'edit-transformation') this.editTransformation(button.dataset.id);
      if (action === 'expand-code') this.expandCodeEditor(button.dataset.id);
    });
    
    // File input for importing transformations
    document.getElementById('transformationsFileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const transformations = JSON.parse(event.target.result);
            this.importTransformationsData(transformations);
          } catch (error) {
            this.eventBus.emit('toast:show', { message: 'Invalid JSON file', type: 'error' });
          }
        };
        reader.readAsText(file);
      }
      // Reset input so same file can be selected again
      e.target.value = '';
    });
    
    document.getElementById('codeEditorModal').addEventListener('click', (e) => {
      if (e.target.id === 'codeEditorModal') this.closeCodeEditor();
      const button = e.target.closest('[data-action]');
      if (!button) return;
      
      if (button.dataset.action === 'close-code-editor') this.closeCodeEditor();
      if (button.dataset.action === 'save-code-editor') this.saveCodeEditor();
    });
  }
  
  togglePreview() {
    const pane = document.getElementById('previewPane');
    const icon = document.getElementById('collapseIcon');
    const divider = document.getElementById('divider');
    
    // Check current state before toggling
    const isCurrentlyVisible = !pane.classList.contains('collapsed');
    this.previewVisible = !isCurrentlyVisible;
    
    if (this.previewVisible) {
      pane.style.width = this.lastPreviewWidth || this.config.preview.defaultWidth;
      pane.classList.remove('collapsed');
      divider.style.display = '';
      icon.innerHTML = '<path d="M4 2l4 4-4 4"/>';
    } else {
      this.lastPreviewWidth = pane.style.width || this.config.preview.defaultWidth;
      pane.classList.add('collapsed');
      pane.style.width = '0';
      divider.style.display = 'none';
      icon.innerHTML = '<path d="M8 2L4 6l4 4"/>';
    }
    
    setTimeout(() => this.modules.editor.layout(), 300);
  }
  
  openExport() {
    const code = this.modules.editor.getValue();
    const transformed = this.modules.transformations.runPreviewTransformations(code);
    const stats = this.modules.export.getExportStats(transformed);
    
    document.getElementById('statClasses').textContent = stats.classes;
    document.getElementById('statCssSize').textContent = stats.cssSize;
    document.getElementById('statHtmlSize').textContent = stats.htmlSize;
    
    const preview = stats.css
      ? stats.css.substring(0, 800) + (stats.css.length > 800 ? '\n…' : '')
      : '/* No Twind styles detected */';
    
    document.getElementById('cssPreview').textContent = preview;
    document.getElementById('exportModal').classList.add('open');
    
    this.exportData = stats;
  }
  
  closeExport() {
    document.getElementById('exportModal').classList.remove('open');
  }
  
  async copyExport() {
    if (!this.exportData) return;
    const success = await this.services.clipboard.copy(this.exportData.html);
    if (success) {
      this.closeExport();
      this.eventBus.emit('toast:show', { message: 'Copied to clipboard!', type: 'success' });
    }
  }
  
  downloadExport() {
    if (!this.exportData) return;
    this.services.download.downloadHTML(this.exportData.html);
    this.closeExport();
    this.eventBus.emit('toast:show', { message: 'Downloaded exported.html', type: 'success' });
  }
  
  openSettings() {
    const sizes = this.modules.settings.getStorageSize();
    document.getElementById('savedTotalSize').textContent = sizes.total;
    document.getElementById('savedEditorSize').textContent = sizes.editor;
    document.getElementById('savedTransformationsSize').textContent = sizes.transformations;
    document.getElementById('settingsModal').classList.add('open');
  }
  
  closeSettings() {
    document.getElementById('settingsModal').classList.remove('open');
  }
  
  clearEditorStorage() {
    if (confirm('Clear all editor tabs and code? This cannot be undone.')) {
      this.modules.settings.clearEditorData();
      location.reload();
    }
  }
  
  clearTransformationsStorage() {
    if (confirm('Clear all transformations? This cannot be undone.')) {
      this.modules.settings.clearTransformationsData();
      location.reload();
    }
  }
  
  clearAllStorage() {
    if (confirm('Clear ALL saved data (editor code and transformations)? This cannot be undone.')) {
      this.modules.settings.clearAllData();
      location.reload();
    }
  }
  
  attachGlobalListeners() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        this.openExport();
      }
      if (e.key === 'Escape') {
        this.closeExport();
        this.closeSettings();
        this.closeTransformations();
        this.closeCodeEditor();
      }
    });
    
    window.addEventListener('resize', () => {
      this.modules.editor.layout();
    });
  }
  
  openTransformations() {
    this.transformationsModalOpen = true;
    this.renderTransformations();
    this.renderTransformationLogs();
    this.updatePauseButton();
    document.getElementById('transformationsModal').classList.add('open');
  }
  
  closeTransformations() {
    this.transformationsModalOpen = false;
    
    // Clean up Monaco editors
    if (this.transformationEditors) {
      Object.values(this.transformationEditors).forEach(editor => editor.dispose());
      this.transformationEditors = {};
    }
    
    document.getElementById('transformationsModal').classList.remove('open');
  }
  
  renderTransformations() {
    const container = document.getElementById('transformations-list');
    const transformations = this.modules.transformations.getTransformations();
    
    // Save current editor values before rebuilding
    const editorValues = {};
    if (this.transformationEditors) {
      Object.keys(this.transformationEditors).forEach(id => {
        editorValues[id] = this.transformationEditors[id].getValue();
      });
    }
    
    // Dispose all existing editors since we're rebuilding the HTML
    if (this.transformationEditors) {
      Object.values(this.transformationEditors).forEach(editor => editor.dispose());
    }
    this.transformationEditors = {};
    
    if (transformations.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--muted); font-size: 13px;">No transformations yet. Click "Add Transformation" to create one.</div>';
      return;
    }
    
    container.innerHTML = transformations.map((t, index) => `
      <div class="transformation-item ${t.enabled ? '' : 'disabled'}">
        <div class="transformation-header">
          <div class="transformation-controls">
            <button class="btn btn-ghost btn-icon" data-action="move-up" data-id="${t.id}" ${index === 0 ? 'disabled' : ''}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M8 12V4M4 8l4-4 4 4" />
              </svg>
            </button>
            <button class="btn btn-ghost btn-icon" data-action="move-down" data-id="${t.id}" ${index === transformations.length - 1 ? 'disabled' : ''}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M8 4v8M4 8l4 4 4-4" />
              </svg>
            </button>
          </div>
          <div class="transformation-info">
            <input type="text" class="transformation-name" value="${t.name}" data-id="${t.id}" />
            <div class="transformation-mode">
              <label class="mode-toggle">
                <input type="radio" name="mode-${t.id}" value="manual" ${t.mode === 'manual' ? 'checked' : ''} data-id="${t.id}" />
                <span>Manual</span>
              </label>
              <label class="mode-toggle">
                <input type="radio" name="mode-${t.id}" value="auto" ${t.mode === 'auto' ? 'checked' : ''} data-id="${t.id}" />
                <span>Auto</span>
              </label>
              <span style="color: var(--muted); margin: 0 8px;">|</span>
              <label class="mode-toggle">
                <input type="radio" name="target-${t.id}" value="editor" ${(t.target || 'editor') === 'editor' ? 'checked' : ''} data-id="${t.id}" data-type="target" />
                <span>Editor</span>
              </label>
              <label class="mode-toggle">
                <input type="radio" name="target-${t.id}" value="preview" ${t.target === 'preview' ? 'checked' : ''} data-id="${t.id}" data-type="target" />
                <span>Preview</span>
              </label>
            </div>
          </div>
          <div class="transformation-actions">
            <button class="btn btn-ghost btn-icon" data-action="expand-code" data-id="${t.id}" title="Expand editor">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M2 6v-4h4m4 0h4v4m0 4v4h-4m-4 0h-4v-4" />
              </svg>
            </button>
            <label class="toggle-switch">
              <input type="checkbox" ${t.enabled ? 'checked' : ''} data-action="toggle-transformation" data-id="${t.id}" />
              <span class="toggle-slider"></span>
            </label>
            ${t.mode === 'manual' ? `
              <button class="btn btn-ghost btn-sm" data-action="run-transformation" data-id="${t.id}">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M4 3l8 5-8 5z" />
                </svg>
                Run
              </button>
            ` : ''}
            <button class="btn btn-ghost btn-icon" data-action="delete-transformation" data-id="${t.id}">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>
        </div>
        <div class="transformation-code-container" id="editor-${t.id}" data-id="${t.id}"></div>
      </div>
    `).join('');
    
    // Add event listeners for name changes
    container.querySelectorAll('.transformation-name').forEach(input => {
      input.addEventListener('change', (e) => {
        this.modules.transformations.updateTransformation(e.target.dataset.id, { name: e.target.value });
      });
    });
    
    // Add event listeners for mode and target changes
    container.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          if (e.target.dataset.type === 'target') {
            this.modules.transformations.updateTransformation(e.target.dataset.id, { target: e.target.value });
          } else {
            this.modules.transformations.setMode(e.target.dataset.id, e.target.value);
          }
        }
      });
    });
    
    // Initialize Monaco editors for each transformation
    transformations.forEach(t => {
      const editorContainer = document.getElementById(`editor-${t.id}`);
      if (editorContainer) {
        // Use saved editor value if available, otherwise use transformation code
        const editorValue = editorValues[t.id] || t.code;
        
        const editor = monaco.editor.create(editorContainer, {
          value: editorValue,
          language: 'javascript',
          theme: 'vs-dark',
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          folding: true,
          lineDecorationsWidth: 5,
          lineNumbersMinChars: 3,
          renderLineHighlight: 'line',
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10
          }
        });
        
        // Save changes on blur
        editor.onDidBlurEditorText(() => {
          const code = editor.getValue();
          this.modules.transformations.updateTransformation(t.id, { code });
        });
        
        this.transformationEditors[t.id] = editor;
      }
    });
  }
  
  renderTransformationLogs() {
    const container = document.getElementById('transformations-log');
    const logs = this.modules.transformations.getLogs();
    
    if (logs.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--muted); font-size: 12px;">No logs yet</div>';
      return;
    }
    
    container.innerHTML = logs.map(log => {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const typeClass = log.type === 'error' ? 'log-error' : log.type === 'warning' ? 'log-warning' : 'log-success';
      return `<div class="log-entry ${typeClass}"><span class="log-time">${time}</span> ${log.message}</div>`;
    }).join('');
  }
  
  addTransformation() {
    const name = prompt('Transformation name:', 'New Transformation');
    if (!name) return;
    
    this.modules.transformations.createTransformation(name);
    this.renderTransformations();
  }
  
  deleteTransformation(id) {
    if (confirm('Delete this transformation?')) {
      this.modules.transformations.deleteTransformation(id);
      this.renderTransformations();
    }
  }
  
  toggleTransformation(id) {
    this.modules.transformations.toggleTransformation(id);
  }
  
  runTransformation(id) {
    const code = this.modules.editor.getValue();
    const result = this.modules.transformations.runTransformation(id, code);
    
    if (result.success) {
      this.modules.editor.setValue(result.result);
      this.eventBus.emit('toast:show', { message: 'Transformation applied!', type: 'success' });
    } else {
      this.eventBus.emit('toast:show', { message: 'Transformation failed: ' + result.error, type: 'error' });
    }
    
    this.renderTransformationLogs();
  }
  
  runAllTransformations() {
    const code = this.modules.editor.getValue();
    const result = this.modules.transformations.runAllTransformations(code);
    
    if (result.success) {
      this.modules.editor.setValue(result.result);
      this.eventBus.emit('toast:show', { message: 'All transformations applied!', type: 'success' });
    } else {
      this.eventBus.emit('toast:show', { message: `${result.errors.length} transformation(s) failed`, type: 'error' });
    }
    
    this.renderTransformationLogs();
  }
  
  moveTransformation(id, direction) {
    this.modules.transformations.moveTransformation(id, direction);
    this.renderTransformations();
  }
  
  clearTransformationLogs() {
    this.modules.transformations.clearLogs();
    this.renderTransformationLogs();
  }
  
  expandCodeEditor(id) {
    const transformation = this.modules.transformations.getTransformations().find(t => t.id === id);
    if (!transformation) return;
    
    this.currentEditingTransformationId = id;
    document.getElementById('codeEditorSubtitle').textContent = transformation.name;
    
    // Create Monaco editor in modal
    const container = document.getElementById('codeEditorContainer');
    container.innerHTML = '';
    
    this.codeEditor = monaco.editor.create(container, {
      value: transformation.code,
      language: 'javascript',
      theme: 'vs-dark',
      fontSize: 14,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: 'on',
      minimap: { enabled: true },
      folding: true,
      renderLineHighlight: 'all',
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto'
      }
    });
    
    document.getElementById('codeEditorModal').classList.add('open');
    
    // Focus editor after modal opens
    setTimeout(() => {
      this.codeEditor.focus();
    }, 100);
  }
  
  closeCodeEditor() {
    if (this.codeEditor) {
      this.codeEditor.dispose();
      this.codeEditor = null;
    }
    this.currentEditingTransformationId = null;
    document.getElementById('codeEditorModal').classList.remove('open');
  }
  
  saveCodeEditor() {
    if (!this.codeEditor || !this.currentEditingTransformationId) return;
    
    const code = this.codeEditor.getValue();
    this.modules.transformations.updateTransformation(this.currentEditingTransformationId, { code });
    
    // Update the inline editor
    if (this.transformationEditors[this.currentEditingTransformationId]) {
      this.transformationEditors[this.currentEditingTransformationId].setValue(code);
    }
    
    this.closeCodeEditor();
    this.eventBus.emit('toast:show', { message: 'Code saved!', type: 'success' });
  }
  
  togglePauseTransformations() {
    const isPaused = this.modules.transformations.togglePause();
    this.updatePauseButton();
    
    const message = isPaused ? 'All transformations paused' : 'All transformations resumed';
    this.eventBus.emit('toast:show', { message, type: 'success' });
  }
  
  exportTransformations() {
    const transformations = this.modules.transformations.getTransformations();
    if (transformations.length === 0) {
      this.eventBus.emit('toast:show', { message: 'No transformations to export', type: 'error' });
      return;
    }
    
    const data = JSON.stringify(transformations, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transformations-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.eventBus.emit('toast:show', { message: 'Transformations exported!', type: 'success' });
  }
  
  importTransformations() {
    document.getElementById('transformationsFileInput').click();
  }
  
  importTransformationsData(transformations) {
    if (!Array.isArray(transformations)) {
      this.eventBus.emit('toast:show', { message: 'Invalid transformations format', type: 'error' });
      return;
    }
    
    const message = `Import ${transformations.length} transformation(s)? This will add to your existing transformations.`;
    if (confirm(message)) {
      this.modules.transformations.importTransformations(transformations);
      this.renderTransformations();
      this.eventBus.emit('toast:show', { message: `Imported ${transformations.length} transformation(s)!`, type: 'success' });
    }
  }
  
  updatePauseButton() {
    const isPaused = this.modules.transformations.isPaused();
    const btn = document.getElementById('pauseTransformationsBtn');
    const text = document.getElementById('pauseTransformationsText');
    
    if (!btn || !text) return;
    
    if (isPaused) {
      btn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 3l8 5-8 5z" />
        </svg>
        <span id="pauseTransformationsText">Resume All</span>
      `;
      btn.classList.remove('btn-ghost');
      btn.classList.add('btn-accent');
    } else {
      btn.innerHTML = `
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="5" y="3" width="2" height="10" rx="0.5" />
          <rect x="9" y="3" width="2" height="10" rx="0.5" />
        </svg>
        <span id="pauseTransformationsText">Pause All</span>
      `;
      btn.classList.remove('btn-accent');
      btn.classList.add('btn-ghost');
    }
  }
}
