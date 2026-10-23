// This code runs inside the sandboxed preview, which has an opaque origin.
function trackScroll({ token, position }) {
  let interacted = false;
  const selectors = new Set(position.elements.map((element) => element.selector));
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    window.addEventListener(type, () => { interacted = true; }, { passive: true });
  }
  function report(event) {
    const target = event?.target;
    if (target instanceof Element && target !== document.scrollingElement) {
      // Prefer IDs; otherwise locate the same container by its structural path.
      let selector = '';
      for (let element = target; element; element = element.parentElement) {
        if (element.id && document.getElementById(element.id) === element) {
          selector = `#${CSS.escape(element.id)}${selector ? ` > ${selector}` : ''}`;
          break;
        }
        const siblings = element.parentElement?.children;
        const index = siblings ? [...siblings].indexOf(element) + 1 : 1;
        const part = `${CSS.escape(element.localName)}:nth-child(${index})`;
        selector = part + (selector ? ` > ${selector}` : '');
      }
      selectors.add(selector);
    }
    // Keep the saved offset while unfinished assets temporarily limit scrolling.
    if (!interacted && document.readyState !== 'complete') return;
    const elements = [...selectors].flatMap((selector) => {
      const element = document.querySelector(selector);
      return element ? [{ selector, x: element.scrollLeft, y: element.scrollTop }] : [];
    });
    parent.postMessage({ type: 'preview-scroll', token, x: scrollX, y: scrollY, elements }, '*');
  }
  function restore() {
    if (interacted) return;
    window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
    for (const { selector, x, y } of position.elements) {
      document.querySelector(selector)?.scrollTo({ left: x, top: y, behavior: 'instant' });
    }
    report();
  }
  document.addEventListener('scroll', report, { passive: true, capture: true });
  document.addEventListener('DOMContentLoaded', restore, { once: true });
  // Images and stylesheets may increase the scrollable height after parsing.
  window.addEventListener('load', restore, { once: true });
}

export function createPreviewRenderer(frame) {
  const positions = new Map();
  let current;
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== frame.contentWindow || !current || !frame.getClientRects().length ||
      data?.type !== 'preview-scroll' || data.token !== current.token ||
      !Number.isFinite(data.x) || !Number.isFinite(data.y) || !Array.isArray(data.elements) ||
      data.elements.some((element) => !element || typeof element.selector !== 'string' ||
        !Number.isFinite(element.x) || !Number.isFinite(element.y))) return;
    positions.set(current.documentId, { x: data.x, y: data.y, elements: data.elements });
  });
  return {
    render(html, documentId, { force = false } = {}) {
      // Hidden inline frames have no usable layout while the popout is active.
      if (!frame.getClientRects().length) return;
      if (!force && current?.html === html && current.documentId === documentId) return;
      const token = crypto.randomUUID();
      const position = positions.get(documentId) || { x: 0, y: 0, elements: [] };
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const script = parsed.createElement('script');
      script.dataset.preview = 'scroll-restoration';
      const state = JSON.stringify({ token, position }).replace(/</g, '\\u003c');
      script.textContent = `(${trackScroll.toString()})(${state});`;
      parsed.head.prepend(script);
      current = { html, documentId, token };
      frame.srcdoc = '<!doctype html>\n' + parsed.documentElement.outerHTML;
    },
  };
}
