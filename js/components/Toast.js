/**
 * Toast notification component
 */
export class Toast {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.element = null;
    this.timer = null;
    
    this.setupEventListeners();
  }
  
  mount(selector) {
    const container = document.querySelector(selector);
    this.element = this.render();
    container.appendChild(this.element);
  }
  
  render() {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.id = 'toast';
    return toast;
  }
  
  show(message, type = '') {
    if (!this.element) return;
    
    this.element.textContent = message;
    this.element.className = 'toast' + 
      (type === 'success' ? ' success' : type === 'error' ? ' error-t' : '');
    this.element.classList.add('show');
    
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.element.classList.remove('show');
    }, 2500);
  }
  
  setupEventListeners() {
    this.eventBus.on('toast:show', ({ message, type }) => {
      this.show(message, type);
    });
  }
}
