import { formatBytes } from '../utils/string.js';

export class SettingsManager {
  constructor(storageService, eventBus) {
    this.storage = storageService;
    this.eventBus = eventBus;
  }
  
  getStorageSize() {
    const tabs = this.storage.get('twind-editor-tabs');
    const activeTab = this.storage.get('twind-editor-active-tab');
    const transformations = this.storage.get('twind-editor-transformations');
    
    const tabsSize = tabs ? JSON.stringify(tabs).length : 0;
    const activeTabSize = activeTab ? JSON.stringify(activeTab).length : 0;
    const transformationsSize = transformations ? JSON.stringify(transformations).length : 0;
    
    const editorSize = tabsSize + activeTabSize;
    const totalSize = editorSize + transformationsSize;
    
    return {
      total: formatBytes(totalSize),
      editor: formatBytes(editorSize),
      transformations: formatBytes(transformationsSize)
    };
  }
  
  clearEditorData() {
    this.storage.remove('twind-editor-tabs');
    this.storage.remove('twind-editor-active-tab');
    this.eventBus.emit('settings:editor-cleared');
  }
  
  clearTransformationsData() {
    this.storage.remove('twind-editor-transformations');
    this.eventBus.emit('settings:transformations-cleared');
  }
  
  clearAllData() {
    this.clearEditorData();
    this.clearTransformationsData();
    this.eventBus.emit('settings:cleared');
  }
}
