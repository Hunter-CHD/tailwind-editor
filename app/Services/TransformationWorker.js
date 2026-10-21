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
      if (transform.kind === 'dom' || transform.kind === 'comment') {
        if (!document) {
          fullDocument = /<!doctype\s|<html[\s>]/i.test(code);
          document = fullDocument
            ? new DOMParser().parseFromString(code, 'text/html')
            : parseHTML('<!doctype html><html><head></head><body></body></html>').document;
          if (!fullDocument) document.body.innerHTML = code;
        }
        if (transform.kind === 'comment') {
          const command = (transform.command || '').trim();
          if (!/^[a-zA-Z_][\w-]*$/.test(command))
            throw new Error('Comment commands need a prefix using letters, numbers, underscores, or hyphens, starting with a letter or underscore');
          const execute = new AsyncFunction(
            'args', 'elements', 'document', 'context', 'comment', 'nodes',
            `"use strict";\n${transform.code}`,
          );
          // Collect before mutating: moving siblings must not disrupt comment traversal.
          const walker = document.createTreeWalker(document, 128);
          const commands = [];
          while (walker.nextNode()) {
            const comment = walker.currentNode;
            const match = comment.textContent.match(/^\s*([a-zA-Z_][\w-]*)\s*:([^;]*);\s*$/);
            if (match?.[1] === command) commands.push({ comment, args: match[2].trim() });
          }
          for (const { comment, args } of commands) {
            if (!document.contains(comment) || !comment.parentElement) continue;
            const nodes = [];
            for (let node = comment.nextSibling; node; node = node.nextSibling) nodes.push(node);
            const elements = nodes.filter((node) => node.nodeType === 1);
            const returned = await execute(args, elements, document, transformContext, comment, nodes);
            if (returned !== undefined)
              throw new Error('Comment commands edit elements directly and must not return a value');
            comment.remove();
          }
        } else {
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
        }
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
