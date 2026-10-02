/**
 * DOM utility functions
 */

/**
 * Create a DOM element with attributes
 * @param {string} tag - HTML tag name
 * @param {Object} attributes - Element attributes
 * @param {Array} children - Child elements or text
 * @returns {HTMLElement}
 */
export function createElement(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'class') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('data-')) {
      element.dataset[key.slice(5)] = value;
    } else {
      element.setAttribute(key, value);
    }
  });
  
  children.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  });
  
  return element;
}

/**
 * Query selector helper
 * @param {string} selector - CSS selector
 * @param {Element} context - Context element
 * @returns {Element|null}
 */
export function $(selector, context = document) {
  return context.querySelector(selector);
}

/**
 * Query selector all helper
 * @param {string} selector - CSS selector
 * @param {Element} context - Context element
 * @returns {Array<Element>}
 */
export function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

/**
 * Add event listener with cleanup
 * @param {Element} element - Target element
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @param {Object} options - Event options
 * @returns {Function} Cleanup function
 */
export function on(element, event, handler, options) {
  element.addEventListener(event, handler, options);
  return () => element.removeEventListener(event, handler, options);
}

/**
 * Toggle class on element
 * @param {Element} element - Target element
 * @param {string} className - Class name
 * @param {boolean} force - Force add/remove
 * @returns {boolean}
 */
export function toggleClass(element, className, force) {
  return element.classList.toggle(className, force);
}

/**
 * Add multiple classes
 * @param {Element} element - Target element
 * @param {...string} classNames - Class names to add
 */
export function addClass(element, ...classNames) {
  element.classList.add(...classNames);
}

/**
 * Remove multiple classes
 * @param {Element} element - Target element
 * @param {...string} classNames - Class names to remove
 */
export function removeClass(element, ...classNames) {
  element.classList.remove(...classNames);
}
