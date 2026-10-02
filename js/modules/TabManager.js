import { DEFAULT_CODE } from '../utils/constants.js';

export class TabManager {
  constructor(storageService, eventBus, config) {
    this.storage = storageService;
    this.eventBus = eventBus;
    this.config = config;
    this.tabs = [];
    this.activeTabId = null;
    
    this.load();
    this.setupEventListeners();
  }
  
  load() {
    const saved = this.storage.get('tabs');
    const savedActive = this.storage.get('activeTab');
    
    if (saved) {
      this.tabs = saved;
      this.activeTabId = savedActive || (this.tabs.length > 0 ? this.tabs[0].id : null);
    } else {
      this.createDefaultTab();
    }
  }
  
  save() {
    this.storage.set('tabs', this.tabs);
    this.storage.set('activeTab', this.activeTabId);
  }
  
  createDefaultTab() {
    const tab = {
      id: Date.now().toString(),
      name: 'Tab 1',
      content: this.config.defaultCode || DEFAULT_CODE
    };
    this.tabs.push(tab);
    this.activeTabId = tab.id;
    this.save();
  }
  
  createTab() {
    const tab = {
      id: Date.now().toString(),
      name: `Tab ${this.tabs.length + 1}`,
      content: this.config.defaultCode || DEFAULT_CODE
    };
    this.tabs.push(tab);
    this.switchTo(tab.id);
    this.eventBus.emit('tabs:changed', this.tabs);
    return tab;
  }
  
  closeTab(tabId) {
    if (this.tabs.length <= 1) {
      this.eventBus.emit('toast:show', {
        message: 'Cannot close the last tab',
        type: 'error'
      });
      return;
    }
    
    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;
    
    this.tabs.splice(index, 1);
    
    if (tabId === this.activeTabId) {
      const newIndex = Math.min(index, this.tabs.length - 1);
      this.activeTabId = this.tabs[newIndex].id;
    }
    
    this.save();
    this.eventBus.emit('tabs:changed', this.tabs);
    this.eventBus.emit('tab:switched', this.getActiveTab());
  }
  
  switchTo(tabId) {
    if (this.activeTabId === tabId) return;
    
    this.activeTabId = tabId;
    this.save();
    this.eventBus.emit('tab:switched', this.getActiveTab());
  }
  
  renameTab(tabId, newName) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    tab.name = newName.trim();
    this.save();
    this.eventBus.emit('tabs:changed', this.tabs);
  }
  
  updateContent(tabId, content) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    tab.content = content;
    this.save();
  }
  
  getActiveTab() {
    return this.tabs.find(t => t.id === this.activeTabId);
  }
  
  getAllTabs() {
    return this.tabs;
  }
  
  setupEventListeners() {
    this.eventBus.on('tab:create', () => this.createTab());
    this.eventBus.on('tab:close', (tabId) => this.closeTab(tabId));
    this.eventBus.on('tab:switch', (tabId) => this.switchTo(tabId));
    this.eventBus.on('tab:rename', ({ tabId, name }) => this.renameTab(tabId, name));
    this.eventBus.on('tab:update', ({ tabId, content }) => this.updateContent(tabId, content));
  }
}
