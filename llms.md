# Twind Editor - LLM Context

This document provides comprehensive context about the Twind Editor project for Large Language Models to understand the codebase architecture, patterns, and conventions.

## Project Overview

**Twind Editor** is a browser-based code editor for working with Twind (Tailwind-in-JS). It provides a Monaco-powered editor with live preview, multi-tab support, and a powerful transformation system for programmatic code manipulation.

**Key Characteristics:**
- Zero build step - pure ES modules
- Event-driven architecture with EventBus
- Modular design with clear separation of concerns
- Browser-only (no backend)
- LocalStorage for persistence

## Architecture Patterns

### 1. Event-Driven Communication

The application uses a central EventBus for decoupled module communication:

```javascript
// EventBus pattern
this.eventBus.emit('editor:changed', content);
this.eventBus.on('editor:changed', (content) => { /* handle */ });
```

**Key Events:**
- `editor:changed` - Editor content modified
- `tab:create`, `tab:switch`, `tab:close`, `tab:update`, `tab:rename` - Tab operations
- `tabs:changed`, `tab:switched` - Tab state changes
- `preview:popout-opened`, `preview:popout-closed` - Preview window state
- `preview:get-content` - Request current content for preview
- `transformations:apply` - Apply transformation result to editor
- `transformations:changed` - Transformation list modified
- `toast:show` - Display toast notification

### 2. Module Structure

Each feature is encapsulated in a manager class:

**Core Modules:**
- `App.js` - Main application orchestrator
- `EventBus.js` - Pub/sub event system

**Feature Modules:**
- `EditorManager.js` - Monaco editor lifecycle and operations
- `PreviewManager.js` - Preview iframe management and updates
- `TabManager.js` - Multi-tab state management
- `ExportManager.js` - CSS extraction and HTML export
- `SettingsManager.js` - Settings and storage management
- `TransformationsManager.js` - Code transformation system

**Services:**
- `TwindService.js` - Twind CSS extraction via iframe messaging
- `StorageService.js` - LocalStorage wrapper with JSON serialization
- `ClipboardService.js` - Clipboard API wrapper
- `DownloadService.js` - File download utilities

**Components:**
- `Toast.js` - Toast notification component

### 3. Initialization Flow

```
1. main.js → Create App instance
2. App.mount() → Initialize services, modules, UI
3. Services initialized (storage, clipboard, download, twind)
4. Modules initialized (tabs, editor, preview, export, settings, transformations)
5. UI rendered (header, toolbar, workspace, modals)
6. Monaco editor created
7. Initial tab loaded from storage
8. Preview iframe initialized
9. Event listeners attached
10. Initial preview rendered
```

### 4. Data Flow

**Editor Changes:**
```
User types → Monaco onChange → EventBus 'editor:changed' 
→ TabManager updates tab content → TransformationsManager runs auto transforms
→ PreviewManager updates iframe
```

**Tab Switching:**
```
User clicks tab → EventBus 'tab:switch' → TabManager switches active tab
→ EventBus 'tab:switched' → EditorManager sets new content
→ PreviewManager updates preview
```

**Export:**
```
User clicks Export → App.openExport() → ExportManager.getExportStats()
→ TwindService extracts CSS from preview iframe → Modal displays stats
→ User downloads/copies → DownloadService/ClipboardService
```

## File Organization

### Core Files

**[`index.html`](index.html:1)**
- Single HTML file entry point
- Loads Monaco Editor from CDN
- Loads Emmet Monaco for HTML shortcuts
- Mounts app to `#app` div

**[`js/main.js`](js/main.js:1)**
- Application entry point
- Creates App instance and mounts it
- Error handling for initialization failures

**[`js/config.js`](js/config.js:1)**
- Centralized configuration
- Editor settings (theme, font, minimap, etc.)
- Preview settings (width, delays)
- CDN URLs for dependencies
- Default code template

### Module Details

**[`js/core/App.js`](js/core/App.js:1)** (1159 lines)
- Main application orchestrator
- Manages lifecycle of all modules and services
- Builds UI structure (header, toolbar, workspace, modals)
- Handles all UI interactions and modal logic
- Manages transformation UI (list, inline editors, full-screen editor)
- Coordinates between modules via EventBus

**[`js/core/EventBus.js`](js/core/EventBus.js:1)**
- Simple pub/sub implementation
- `on(event, callback)` - Subscribe to event
- `off(event, callback)` - Unsubscribe
- `emit(event, data)` - Publish event

**[`js/modules/EditorManager.js`](js/modules/EditorManager.js:1)**
- Monaco editor initialization and configuration
- Content get/set operations
- `setValuePreservingCursor()` - Update content without losing cursor position
- Format command
- Layout management for resize

**[`js/modules/PreviewManager.js`](js/modules/PreviewManager.js:1)**
- Manages preview iframe
- Debounced updates (600ms default)
- Injects Twind setup and extraction scripts
- Handles popout window
- Listens for CSS extraction messages from iframe

**[`js/modules/TabManager.js`](js/modules/TabManager.js:1)**
- Tab CRUD operations
- Active tab tracking
- Persistence to LocalStorage
- Generates unique IDs for tabs
- Emits events for tab changes

**[`js/modules/ExportManager.js`](js/modules/ExportManager.js:1)**
- Generates export statistics
- Combines HTML with extracted CSS
- Formats file sizes (bytes → KB/MB)
- Creates standalone HTML files

**[`js/modules/SettingsManager.js`](js/modules/SettingsManager.js:1)**
- Storage size calculations
- Clear data operations (editor, transformations, all)
- Storage usage breakdown

**[`js/modules/TransformationsManager.js`](js/modules/TransformationsManager.js:1)**
- Transformation CRUD operations
- Execute transformations (manual or auto)
- Run transformations in sandboxed context
- Logging system for execution results
- Import/export transformation sets
- Pause/resume functionality
- Target selection (editor vs preview)

**[`js/services/TwindService.js`](js/services/TwindService.js:1)**
- Generates Twind setup script for iframe injection
- Generates CSS extraction script
- Extraction script uses postMessage to send CSS back to parent
- Counts classes in extracted CSS
- Filters out excluded selectors (html, body)

**[`js/services/StorageService.js`](js/services/StorageService.js:1)**
- LocalStorage wrapper with JSON serialization
- `get(key)`, `set(key, value)`, `remove(key)`, `clear()`
- Error handling for quota exceeded

**[`js/services/ClipboardService.js`](js/services/ClipboardService.js:1)**
- Clipboard API wrapper
- Fallback to textarea method for older browsers
- Returns success/failure boolean

**[`js/services/DownloadService.js`](js/services/DownloadService.js:1)**
- Creates blob URLs and triggers downloads
- `downloadHTML(content, filename)` - Download HTML file
- Automatic cleanup of blob URLs

**[`js/components/Toast.js`](js/components/Toast.js:1)**
- Toast notification component
- Listens for `toast:show` events
- Auto-dismiss after 3 seconds
- Types: success, error, info

### Utilities

**[`js/utils/constants.js`](js/utils/constants.js:1)**
- Storage keys for LocalStorage
- Default HTML template
- Twind CDN URLs
- Excluded CSS selectors

**[`js/utils/debounce.js`](js/utils/debounce.js:1)**
- Standard debounce implementation
- Used for preview updates

**[`js/utils/dom.js`](js/utils/dom.js:1)**
- DOM manipulation helpers
- Element creation, class management, etc.

**[`js/utils/string.js`](js/utils/string.js:1)**
- String manipulation utilities
- Formatting, escaping, etc.

## Key Concepts

### Transformations System

The transformation system allows users to write JavaScript functions that transform code:

**Structure:**
```javascript
{
  id: 'unique-id',
  name: 'Transformation Name',
  code: 'return code.toUpperCase();', // JavaScript code
  enabled: true,
  mode: 'manual' | 'auto',
  target: 'editor' | 'preview'
}
```

**Modes:**
- `manual` - User clicks "Run" to execute
- `auto` - Runs automatically on every editor change

**Targets:**
- `editor` - Modifies editor content (saved to tab)
- `preview` - Only affects preview rendering (not saved)

**Execution:**
- Code wrapped in function: `(code) => { ${transformation.code} }`
- Executed in try-catch with error logging
- Auto transformations run in sequence
- Preview transformations run before rendering

**Use Cases:**
- Add wrapper divs automatically
- Inject dark mode classes in preview
- Format/prettify code
- Add boilerplate
- Custom preprocessing

### Storage Schema

**Tabs:**
```javascript
{
  tabs: [
    { id: 'uuid', name: 'Tab 1', content: '<div>...</div>' }
  ],
  activeTabId: 'uuid'
}
```

**Transformations:**
```javascript
[
  {
    id: 'uuid',
    name: 'Transform Name',
    code: 'return code;',
    enabled: true,
    mode: 'manual',
    target: 'editor'
  }
]
```

### CSS Extraction Process

1. User writes HTML with Tailwind classes in editor
2. PreviewManager injects HTML into iframe with Twind setup script
3. Twind processes classes and generates CSS in iframe
4. Extraction script runs after page load
5. Script finds Twind's dynamic stylesheet
6. Filters out excluded selectors (html, body)
7. Posts CSS back to parent via postMessage
8. TwindService stores extracted CSS
9. ExportManager uses CSS for export

### Monaco Editor Integration

**Setup:**
- Loaded from CDN (v0.45.0)
- Configured in [`js/config.js`](js/config.js:16)
- Dark theme, JetBrains Mono font
- Emmet support for HTML
- Auto-formatting, suggestions, completions

**Operations:**
- `getValue()` - Get current content
- `setValue(content)` - Set content (loses cursor position)
- `setValuePreservingCursor(content)` - Set content keeping cursor
- `format()` - Format document
- `layout()` - Recalculate layout after resize

**Multiple Instances:**
- Main editor for active tab
- Inline editors in transformation list (one per transformation)
- Full-screen editor in code editor modal
- All instances disposed properly on cleanup

## Common Patterns

### Adding a New Module

1. Create file in `js/modules/`
2. Export class with constructor taking dependencies
3. Implement public methods for functionality
4. Emit events for state changes
5. Listen to relevant events from other modules
6. Initialize in `App.initializeModules()`
7. Store reference in `this.modules`

### Adding a New Service

1. Create file in `js/services/`
2. Export class with focused responsibility
3. No EventBus dependency (services are stateless utilities)
4. Initialize in `App.initializeServices()`
5. Store reference in `this.services`

### Adding a Modal

1. Add HTML structure in `App.setupModals()`
2. Add event listeners for modal actions
3. Create open/close methods in App
4. Add keyboard shortcut if needed
5. Use `.modal-overlay.open` class to show

### Adding an Event

1. Define event name (use namespace:action pattern)
2. Emit from source module: `this.eventBus.emit('module:action', data)`
3. Listen in target module: `this.eventBus.on('module:action', handler)`
4. Document in this file's event list

## Styling

**CSS Architecture:**
- CSS Custom Properties in [`styles/variables.css`](styles/variables.css:1)
- Component-based styles in [`styles/components.css`](styles/components.css:1)
- Global styles in [`styles/global.css`](styles/global.css:1)
- Animations in [`styles/animations.css`](styles/animations.css:1)
- Reset in [`styles/reset.css`](styles/reset.css:1)

**Design System:**
- Dark theme with purple accent (`--accent`)
- Monospace font: JetBrains Mono
- UI font: Syne
- Consistent spacing scale
- Smooth transitions

## Development Guidelines

### Code Style
- ES6+ features (classes, arrow functions, destructuring)
- Async/await for asynchronous operations
- JSDoc comments for public methods
- Descriptive variable names
- Single responsibility principle

### Error Handling
- Try-catch for async operations
- Toast notifications for user-facing errors
- Console logging for debugging
- Graceful degradation

### Performance
- Debounced preview updates (600ms)
- Lazy initialization of Monaco editors
- Proper cleanup of event listeners and editors
- LocalStorage for persistence (no network calls)

### Browser Compatibility
- ES Modules (no transpilation)
- Modern browser APIs (Clipboard, LocalStorage)
- No polyfills included

## Testing Approach

Currently no automated tests. Manual testing checklist:

- [ ] Editor loads and displays content
- [ ] Preview updates on typing
- [ ] Tabs create, switch, rename, close
- [ ] Export generates correct HTML
- [ ] Transformations execute correctly
- [ ] Storage persists across page reloads
- [ ] Modals open and close
- [ ] Keyboard shortcuts work
- [ ] Resize divider works
- [ ] Popout preview works
- [ ] Import/export transformations

## Common Tasks

### Adding a Toolbar Button

1. Add button HTML in `App.initializeUI()` toolbar section
2. Add `data-action="action-name"` attribute
3. Add click handler in toolbar event listener
4. Implement action method in App or emit event

### Modifying Default Code

Edit `DEFAULT_CODE` in [`js/utils/constants.js`](js/utils/constants.js:11)

### Changing Editor Theme

Edit `editor.theme` in [`js/config.js`](js/config.js:16)

### Adding a New Transformation Example

Create preset transformations in `TransformationsManager` constructor or provide import file

### Debugging

Set `config.debug = true` in [`js/config.js`](js/config.js:8) to expose `window.app` for console inspection

## Dependencies

**Runtime:**
- Monaco Editor 0.45.0 (CDN)
- Emmet Monaco 5.3.0 (CDN)
- Twind Core 1.1.3 (CDN, injected in iframe)
- Twind Preset Autoprefix 1.0.7 (CDN, injected in iframe)
- Twind Preset Tailwind 1.1.4 (CDN, injected in iframe)

**Development:**
- None (no build step)

**Fonts:**
- JetBrains Mono (Google Fonts)
- Syne (Google Fonts)

**Known Limitations:**
- LocalStorage size limits (~5-10MB)
- No server-side rendering
- No collaboration features
- Single user only
- Browser-dependent features

## Troubleshooting

**Editor not loading:**
- Check Monaco CDN availability
- Check browser console for errors
- Verify ES module support

**Preview not updating:**
- Check iframe sandbox permissions
- Verify Twind CDN availability
- Check browser console in iframe

**Storage errors:**
- LocalStorage quota exceeded
- Clear data in Settings modal
- Check browser privacy settings

**Transformations not working:**
- Check JavaScript syntax in transformation code
- View logs in Transformations modal
- Ensure transformation is enabled
- Check mode (manual vs auto)

## Contact & Support

This is a standalone project with no official support channel. For issues or questions:
- Review this documentation
- Check browser console for errors
- Inspect code in browser DevTools
- Modify source code directly (no build step needed)
