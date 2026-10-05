let worker;
let nextId = 0;
const pending = new Map();

function stop(error) {
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(error);
  }
  pending.clear();
}

// Keep parsing off the editor thread and reuse the parser between source edits.
export function inspectHtml(source) {
  return new Promise((resolve, reject) => {
    if (!worker) {
      worker = new Worker(new URL('./HtmlWorker.js', import.meta.url), { type: 'module' });
      worker.onerror = () =>
        stop(new Error('HTML syntax check could not load. Check your connection.'));
      worker.onmessage = ({ data }) => {
        const request = pending.get(data.id);
        if (!request) return;
        if (data.error) {
          stop(new Error(`HTML syntax check failed: ${data.error}`));
          return;
        }
        pending.delete(data.id);
        clearTimeout(request.timer);
        request.resolve(data.result);
      };
    }
    const id = ++nextId;
    const timer = setTimeout(
      () => stop(new Error('HTML syntax check timed out. No transformations were applied.')),
      15000,
    );
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, source });
  });
}

// A conservative contiguous edit: if several distant changes span the active
// region, wait for blur rather than guessing which characters are safe.
export function textChange(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = before.length;
  let nextEnd = after.length;
  while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) {
    end--;
    nextEnd--;
  }
  return { start, end, text: after.slice(start, nextEnd) };
}

export function affectsEditingRegion(source, result, selections, openingTags) {
  if (source === result) return false;
  const change = textChange(source, result);
  const intersects = (start, end) => change.start <= end && change.end >= start;
  return selections.some(({ start, end }) => {
    const lineStart = start === 0 ? 0 : source.lastIndexOf('\n', start - 1) + 1;
    const nextLine = source.indexOf('\n', end);
    const lineEnd = nextLine === -1 ? source.length : nextLine;
    if (intersects(lineStart, lineEnd)) return true;
    return openingTags.some(
      (tag) => start <= tag.end && end >= tag.start && intersects(tag.start, tag.end),
    );
  });
}
