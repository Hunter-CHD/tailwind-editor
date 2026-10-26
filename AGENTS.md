# Project guidance

Read `README.md` before making project changes. It is the main reference for user-visible behavior, architecture, storage, exports, transformations, and development commands. Check the relevant reference pages under `reference/` when changing the transformation API or settings documentation.

## Project shape

- This is a static browser application using native ES modules. There is no build step, backend, framework, or application event bus. Serve it over HTTP; module loading, workers, and the view loader do not work reliably from `file://`.
- `index.html` is the entry point. `resources/js/app.js` loads `resources/views/workspace.html` and starts `app/Controllers/EditorController.js`.
- Keep the existing organization: `app/Controllers/` coordinates UI actions, `app/Models/Workspace.js` owns IndexedDB persistence and validation, `app/Services/` contains reusable behavior, and `config/editor.js` holds defaults and starter data.
- `resources/views/workspace.html` defines the interface structure; `resources/css/app.css` styles it. `preview.html` and `resources/js/preview.js` provide the isolated popout preview.
- The `reference/` directory is a separate, read-only reference app. Do not change it unless the task explicitly concerns that reference.

## Implementation guidance

- Preserve the browser-only design and relative URLs so the app works both at the site root and under a repository subpath on GitHub Pages.
- Runtime dependencies are pinned in the import map in `index.html` and load from CDNs. Do not add a build system or runtime package dependency without a clear need.
- Treat HTML as user-authored source. Preserve it during compilation and export according to the README; do not execute authored scripts in the editor origin.
- Keep preview rendering isolated in sandboxed iframes. Transformation workers isolate work from the UI thread, but transformation JavaScript is not a security boundary and must not be treated as safe for untrusted code.
- Persist workspace changes through the existing IndexedDB model. Preserve migration and backup compatibility when changing the stored workspace shape or schema.
- Prefer focused changes within the responsible controller, model, service, view, or stylesheet. Keep controller-to-service dependencies explicit with ES module imports.
- Update the README or `reference/` documentation when a change alters user-visible behavior or a documented API.

## Development checks

- `npm test` runs the Playwright browser suite. Tests use a Python static server and Microsoft Edge by default; `PLAYWRIGHT_CHANNEL=chrome` selects Chrome.
- Run focused Playwright tests for the behavior changed, then the full suite when practical. Browser-based features commonly involve IndexedDB, workers, iframes, or responsive layouts, so verify the relevant browser behavior rather than relying only on static inspection.
- `npm run format:check` checks formatting. `npm run format` applies js-beautify formatting to supported JavaScript, CSS, and HTML files; JSON and Markdown are not processed.
- Do not commit `node_modules/`, `test-results/`, or generated Playwright reports.
