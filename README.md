# Tailwind Editor

A static HTML workspace with live preview, generated CSS, custom themes, and IndexedDB persistence. No build step, backend, framework, or application event bus. The original app in `../tailwind-editor-ref` is unchanged.

## Run

From this folder:

```sh
php -S localhost:8000
# or
python -m http.server 8000
```

Open `http://localhost:8000`. Use HTTP rather than opening `index.html` directly: ES modules, workers, and the view loader need it. Runtime dependencies load from pinned CDN URLs, so an internet connection is required. Node and npm are only for development checks.

## GitHub Pages

Publish this folder's contents as your site's root, including `app`, `config`, `resources`, `index.html`, `preview.html`, and `.nojekyll`. Choose that branch and root folder in GitHub Pages settings. No build command is needed.

Alternatively, publish the parent repository from its root and visit `/tailwind-editor/`. All application paths are relative, so repository subpaths work. Do not publish `node_modules` or test results. Exported HTML contains its generated CSS and needs no Twind/CDN styling runtime; any external assets or scripts you put in your HTML still need their own URLs.

## Structure

The names follow Laravel conventions, without reproducing a backend framework in JavaScript:

```text
app/
  Controllers/
    EditorController.js          Workspace interactions and direct orchestration
    TransformationController.js Transformation form and actions
  Models/
    Workspace.js                 IndexedDB, migration, backup validation
  Services/
    Compiler.js                  Preview document and CSS + HTML fragment export
    Editor.js                    Monaco and Prettier integration
    Html.js                      HTML readiness and active editing region checks
    HtmlWorker.js                HTML parsing away from the editor thread
    Transformations.js           Worker lifecycle and timeout
    TransformationWorker.js      Shared DOM/string pipeline
config/
  editor.js                      Defaults, starter document, theme presets
resources/
  css/app.css                    Interface styles
  js/app.js                      Bootstrap
  views/workspace.html           Readable HTML view
tests/
  editor.spec.js                 Browser regression checks
index.html                       Entry point and pinned import map
preview.html                     Dedicated popout page with a minimal CSS reset
```

The controller owns one plain workspace object. User actions change it, save it, and request a preview. The model splits each saved snapshot into HTML files, document metadata linked by ID, individual transformations, and workspace metadata, then commits only changed records through native IndexedDB transactions. There is no service container, routing layer, generated source, or custom event system. Native dialogs, downloads, clipboard, and pointer events cover the small browser interactions.

## Editing and export

- Create, rename, duplicate, delete, and import HTML documents.
- Use the sidebar toggle beside the document name to hide or show Documents and give the editor workspace more room. This preference is saved with the workspace and also works on mobile.
- Edit with Monaco syntax highlighting, completion, and undo; format with Prettier. HTML Emmet abbreviations appear in completion suggestions: type `ul.list>li.item$*3` and press `Tab` to expand it. Use `Tab` / `Shift + Tab` to move between snippet placeholders, or `Ctrl + Space` to request suggestions.
- Resize the split with the mouse or focused separator's arrow keys. Preview responsive, tablet, or mobile widths; open a synchronized live preview in another tab. Opening the popout hides the inline preview and expands the editor. **Focus preview** returns to the popout. Closing it or navigating away restores the inline preview and your previous split width automatically.
- Copy and download include your HTML and generated CSS, formatted with Prettier, in a `<style>` block. Export never adds document boilerplate. Full documents keep their authored markup, with generated styles inserted into the head when present. Fragment exports put the style block in a hidden `<pre>` and scope the CSS to an existing wrapper without inserting wrappers or attributes. Detection chooses the top-level element with the most direct element children, ignoring `pre`, `style`, `script`, and metadata elements when choosing and counting; ties use the first element. Its existing ID is preferred, otherwise its tag and classes form an escaped selector. With no eligible element, generated CSS matches nothing. The export dialog freezes the formatted snapshot, so copying and downloading use the same output and do not rerun transformations.

Fragment scoping requires a browser with CSS `@scope` support. Generated utilities and preflight styles apply to descendants of the selected wrapper; style the wrapper itself with custom CSS. Generated `html` and `body` preflight rules are omitted from preview and export CSS unless the detected wrapper is an authored `html` or `body` element (or a full document). Siblings outside the scope are excluded. Authored styles and external stylesheets are unchanged. An existing unique wrapper ID gives the strongest isolation: a tag/class selector also matches other host elements with the same tag/classes. Scoping does not block inherited host styles or make global names such as animation keyframes private.

- `Ctrl/Cmd + E` opens export, `Ctrl/Cmd + S` saves, and `Alt + Shift + F` formats.

Compilation uses a fresh [Twind virtual sheet and HTML consumer](https://twind.style/packages/@twind/core) each time. Removed utilities do not accumulate between renders. Responsive variants, hover states, arbitrary values, and custom colors are generated by Twind, without reading styles back out of an iframe.

This intentionally retains the reference app's Twind 1 / Tailwind 3-style utility support; it is not a Tailwind 4 compiler. Open **Document settings** using the gear in the document toolbar to switch base styles (Preflight) off or list classes only created at runtime by scripts under **Additional classes**. These settings apply to the current document. User-authored styles are preserved. The compiler does not execute scripts to discover classes. The header's **Settings** menu contains workspace-wide editor preferences and backups.

The live preview and popout run in sandboxed iframes without access to the editor's origin. Scripts in authored HTML may run in that preview, but cannot read the workspace's IndexedDB. Links, images, and other remote assets may still make requests. The popout opens `preview.html`, with explicit sizing and reset styles for its outer page, instead of `about:blank`. It has no editor styles or UI. A session-specific BroadcastChannel sends the same rendered output, including edits, document switches, document colors, and preview transformations. Reloading the popout requests the latest preview again. Export-only transformations stay out of both previews. If rendering fails, both keep the last successful preview. Reloading or closing the editor ends that popout connection; open a new popout from the new editor session. The outer reset does not change your fragment's styles; Tailwind Preflight remains controlled by document settings.

Preview documents apply a separate `html, body { margin: 0; padding: 0; }` baseline in both the inline preview and popout iframe. Authored styles and utilities can override it. This preview reset is excluded from generated CSS and exported HTML.

## Color themes

Use **Themes** for editor appearance and **Document settings** for the current document's palette:

- **Editor appearance:** Paper, Midnight, Sand, or a saved custom background, surface, text, and accent. The selected colors also apply to Monaco.
- **Document colors:** a JSON map of lowercase names to six-digit hex colors in **Document settings**, opened with the toolbar gear. Each document has its own map, used by preview and export. **Save settings** applies colors, Preflight, and additional classes together.

```json
{
  "brand": "#0f766e",
  "canvas": "#f4f7f6",
  "ink": "#183b38"
}
```

Use these as `bg-brand`, `hover:bg-brand/80`, `text-ink`, and `border-brand`. The default Tailwind palette remains available.

## Transformations

Each transformation has a name, input type, stage, enabled flag, and automatic/manual trigger. Reorder within the list using the arrow buttons. Stages always run editor → preview → export; order within each stage follows the list.

| Stage            | When it runs                                                                   | What it changes      |
| ---------------- | ------------------------------------------------------------------------------ | -------------------- |
| Editor           | After a safe line change or editor blur, or Run once                           | Saved source         |
| Preview + export | On preview and export if automatic; Run once for a temporary preview if manual | Output only          |
| Export only      | Enabled transforms run when Export opens, regardless of trigger                | Export snapshot only |

New transforms start disabled. Imported transformations also start disabled, including those in a restored workspace, so importing JavaScript does not execute it immediately. Enabling an automatic editor transform affects the next source edit; Run once applies it immediately.

The source toolbar reports **HTML ready**, **HTML incomplete**, or **HTML syntax error**. Hover over the status for the reason and line number. Unfinished quotes, attributes, comments, and required closing tags pause all transformations and keep the last successful preview. Your unfinished source still saves to IndexedDB. The check accepts HTML fragments, void elements, optional end tags, custom elements and attributes, and SVG; it checks editing readiness rather than complete HTML conformance or accessibility.

Automatic preview transformations resume as soon as the source is ready. Automatic editor transformations wait for a cursor line change or editor blur while focused. Before applying, they protect every selected line and the entire opening tag around a selection, including attributes on other lines. Changes that overlap those regions wait for another boundary or blur. A conservative change range may also defer several distant edits until blur. If the source changes during an asynchronous run, its result is discarded. Invalid transformation output cannot replace the source or preview.

Automatic editor transformations preserve scroll position and track selections through edits before the cursor, including inserted or removed lines. Manual transformations and formatting restore the same line and column (character offsets in the plain-text fallback), clamped when content becomes shorter. **Run once** and export require ready HTML too.

### Shared DOM input (recommended)

Edit `document` directly, with no return value:

```js
document.querySelectorAll('[editor-meta]').forEach((element) => element.remove());

document.querySelectorAll('a[target="_blank"]').forEach((link) => {
  link.relList.add('noopener', 'noreferrer');
});
```

Consecutive DOM transforms receive the **same document object**. The pipeline parses lazily on the first DOM transform and serializes at the end. For export, automatic preview and export-only transforms share one pipeline, so they also share the DOM. A serialized checkpoint before the export-only stage refreshes the live preview without reparsing or rerunning transforms. Fragment input remains a fragment; complete documents retain their document structure.

### String input

Legacy transforms still receive `code` and must return a string:

```js
return code.replaceAll('“', '"').replaceAll('”', '"');
```

When mixing types, serialization/parsing happens only at a DOM ↔ string boundary. For maximum efficiency, group DOM transforms together. Convert old code by removing the `DOMParser` setup and final serialization, then using the supplied `document` variable. The legacy global `DOMParser` remains available.

Both inputs receive a read-only `context` with `name` and `stage` (`editor`, `preview`, or `export`). Both support `await`; the execution timeout still applies.

Workers use [LinkeDOM](https://github.com/WebReflection/linkedom), giving transforms DOM queries and mutations without blocking typing. It is a DOM implementation, not a rendered browser: layout measurements, browser globals, and some native DOM behavior are unavailable. String-only transforms can run without using a DOM. A pipeline has a three-second execution limit after dependencies load, and rejects the entire result if any transform fails. Slow/infinite loops are terminated along with their worker. No partial result from that pipeline is applied. Workers isolate execution from the UI thread; they are not a security boundary for untrusted JavaScript. Run only code you trust.

An example export-only cleanup is provided when adding a transform. It removes `[editor-meta]` elements before CSS generation, so utilities used only by removed elements also disappear from the export.

## Storage and migration

The `tailwind-editor` IndexedDB database uses schema version 3 with four object stores:

| Store              | Key               | Contents                                                                         |
| ------------------ | ----------------- | -------------------------------------------------------------------------------- |
| `documentFiles`    | Document ID       | An HTML `File` and a content hash used to detect changes                         |
| `documentMetadata` | Same document ID  | Name, colors, Preflight, and additional classes                                  |
| `transformations`  | Transformation ID | Name, code, input type, stage, trigger, and enabled state                        |
| `workspaces`       | `workspace`       | Ordered document and transformation IDs, active document ID, and editor settings |

Each document's file and metadata are linked by ID. Editing HTML writes only that document's file; changing its settings writes only its metadata. Renaming updates the file's name and metadata together. Deleted documents have both records removed. Each transformation has its own ID-keyed record; editing its code or options updates only that record, while reordering changes the ordered IDs in workspace metadata. Removing a transformation deletes its record. Short debounced saves are serialized, update only changed records, and commit across all four stores in one transaction. The app acknowledges a save only after the transaction succeeds and reports errors if storage is unavailable or full. Files remain in browser storage; they are not files on your computer's filesystem.

Existing single-record IndexedDB workspaces and schema 2 workspaces with inline transformations migrate automatically, preserving IDs, order, settings, and enabled transformations. The old workspace record is replaced only when all new records commit successfully. **Settings → Download backup** still produces a portable JSON workspace, and existing JSON backups remain compatible. Browser storage can be cleared or evicted; it is not a substitute for a backup.

If saved data cannot be loaded or migrated, the temporary workspace stays unsaved so editing it cannot overwrite the stored originals. Reload after resolving the storage error, or explicitly restore a backup from Settings.

All persistence uses IndexedDB. A new installation starts with the default workspace. Use a JSON workspace backup to transfer saved data to another origin or hosting location.

## Dependencies and development

Runtime libraries are pinned: Monaco 0.45.0, [emmet-monaco-es 5.7.0](https://github.com/troy351/emmet-monaco-es), Twind core 1.1.3, Tailwind preset 1.1.4, Autoprefix preset 1.0.7, [Prettier 3.5.3](https://prettier.io/docs/browser), LinkeDOM 0.18.9, and [parse5 8.0.1](https://github.com/inikulin/parse5). HTML readiness checks run in a reusable worker; if the check cannot load, transformations pause while source saving continues. Storage uses the browser's native IndexedDB API. Monaco and the worker/formatter load only when needed; an editor-load failure leaves a plain textarea available when the rest of the app can initialize. An Emmet-load failure leaves Monaco available with its standard completions. Emmet supports HTML abbreviations; embedded CSS abbreviations inside `<style>` blocks are not supported by this integration.

```sh
npm ci
npm test
```

Tests use Playwright and installed Microsoft Edge by default. For Chrome set `PLAYWRIGHT_CHANNEL=chrome`; other operating systems can install a matching supported browser. Python is used to serve the test app. Tests exercise IndexedDB reloads and migration, CSS pruning, variants and custom colors, shared DOM identity, mixed transform types, worker timeouts, export-only behavior, document switching, formatting, and desktop/mobile layouts.

```sh
npm run format
npm run format:check
```

Development packages and lockfiles have no role in hosting the static app.
