/**
 * LocalStorage service
 */
export class StorageService {
  constructor(config) {
    this.config = config;
  }
  
  /**
   * Get item from localStorage
   * @param {string} key - Storage key
   * @returns {*} Parsed value or null
   */
  get(key) {
    try {
      const fullKey = this.config[key + 'Key'] || key;
      const item = localStorage.getItem(fullKey);
      return item ? JSON.parse(item) : null;
    } catch (e) {
      console.warn('Could not get from localStorage:', e);
      return null;
    }
  }
  
  /**
   * Set item in localStorage
   * @param {string} key - Storage key
   * @param {*} value - Value to store
   */
  set(key, value) {
    try {
      const fullKey = this.config[key + 'Key'] || key;
      localStorage.setItem(fullKey, JSON.stringify(value));
    } catch (e) {
      console.warn('Could not save to localStorage:', e);
    }
  }
  
  /**
   * Remove item from localStorage
   * @param {string} key - Storage key
   */
  remove(key) {
    try {
      const fullKey = this.config[key + 'Key'] || key;
      localStorage.removeItem(fullKey);
    } catch (e) {
      console.warn('Could not remove from localStorage:', e);
    }
  }
  
  /**
   * Clear all storage
   */
  clear() {
    try {
      localStorage.clear();
    } catch (e) {
      console.warn('Could not clear localStorage:', e);
    }
  }
  
  /**
   * Get storage size
   * @returns {number} Size in bytes
   */
  getSize() {
    try {
      let total = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          total += localStorage[key].length + key.length;
        }
      }
      return total;
    } catch (e) {
      return 0;
    }
  }
}
