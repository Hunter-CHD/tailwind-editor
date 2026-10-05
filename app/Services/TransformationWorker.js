import { DOMParser, parseHTML } from 'https://cdn.jsdelivr.net/npm/linkedom@0.18.9/worker.js';

globalThis.DOMParser = DOMParser;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

self.onmessage = async ({ data: { code, transformations, context, checkpointAfter } }) => {
  let document = null;
  let fullDocument = false;
  let currentName = '';
  const logs = [];
  let checkpoint = checkpointAfter === 0 ? code : undefined;
  const serialize = () =>
    fullDocument ? document.toString() : document.head.innerHTML + document.body.innerHTML;

  try {
    for (const transform of transformations) {
      currentName = transform.name;
      const started = performance.now();
      const transformContext = Object.freeze({
        ...context,
        stage: transform.target || context.stage,
      });
      if (transform.kind === 'dom') {
        if (!document) {
          fullDocument = /<!doctype\s|<html[\s>]/i.test(code);
          document = fullDocument
            ? new DOMParser().parseFromString(code, 'text/html')
            : parseHTML('<!doctype html><html><head></head><body></body></html>').document;
          if (!fullDocument) document.body.innerHTML = code;
        }
        const execute = new AsyncFunction(
          'document',
          'context',
          `"use strict";\n${transform.code}`,
        );
        const returned = await execute(document, transformContext);
        if (returned !== undefined)
          throw new Error(
            'DOM transforms edit document directly and must not return a value. Use String mode to return HTML.',
          );
      } else {
        if (document) {
          code = serialize();
          document = null;
        }
        const execute = new AsyncFunction('code', 'context', `"use strict";\n${transform.code}`);
        const result = await execute(code, transformContext);
        if (typeof result !== 'string') throw new Error('String transforms must return a string.');
        code = result;
      }
      logs.push(`${transform.name}: ${Math.round(performance.now() - started)} ms`);
      if (logs.length === checkpointAfter) checkpoint = document ? serialize() : code;
    }
    self.postMessage({ code: document ? serialize() : code, logs, checkpoint });
  } catch (error) {
    self.postMessage({ error: `${currentName}: ${error.message}. No changes were applied.` });
  }
};
self.postMessage({ ready: true });
