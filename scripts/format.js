import {
  readdir,
  readFile,
  stat,
  writeFile
} from 'node:fs/promises';
import {
  extname,
  join
} from 'node:path';
import beautify from 'js-beautify';
import {
  Parser
} from 'parse5';
import {
  beautifyHtml,
  cssFormatOptions
} from '../app/Services/Formatting.js';

const check = process.argv.includes('--check');
const targets = process.argv.slice(2).filter((argument) => argument !== '--check');
const skipped = new Set(['node_modules', 'test-results', 'playwright-report']);
async function visit(path) {
  if ((await stat(path)).isDirectory()) {
    for (const entry of await readdir(path, {
        withFileTypes: true
      })) {
      if (entry.name.startsWith('.') || skipped.has(entry.name) || entry.isSymbolicLink())
        continue;
      await visit(join(path, entry.name));
    }
  } else {
    const extension = extname(path);
    if (!['.js', '.mjs', '.css', '.html'].includes(extension)) return;
    const source = await readFile(path, 'utf8');
    const formatted = extension === '.html' ?
      beautifyHtml(source, beautify, Parser) :
      extension === '.css' ?
      beautify.css(source, cssFormatOptions) :
      beautify.js(source, {
        indent_size: 2,
        wrap_line_length: 0,
        end_with_newline: true
      });
    if (source === formatted) return;
    console.log(path);
    if (check) process.exitCode = 1;
    else await writeFile(path, formatted);
  }
}
for (const target of targets.length ? targets : ['.']) await visit(target);
