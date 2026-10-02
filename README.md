# Twind Editor

A modern, browser-based code editor for working with [Twind](https://twind.style/) (Tailwind-in-JS). Write HTML with Tailwind classes and see live previews with automatic CSS extraction.

## Features

### 🎨 Live Preview
- Real-time preview of your HTML with Twind styling
- Resizable split-pane interface
- Popout preview window support
- Automatic CSS generation and tree-shaking

### 📝 Monaco Editor
- Full-featured code editor powered by Monaco (VS Code's editor)
- Syntax highlighting for HTML
- Emmet support for rapid HTML development
- Auto-formatting and code completion
- Customizable editor settings

### 📑 Multi-Tab Support
- Work on multiple files simultaneously
- Persistent tabs saved to browser storage
- Rename and reorder tabs
- Auto-save functionality

### 🔄 Transformations System
- Create custom JavaScript transformations
- **Manual mode**: Run transformations on-demand
- **Auto mode**: Apply transformations automatically on code changes
- **Target selection**: Apply to editor content or preview only
- Import/export transformation sets
- Inline Monaco editors for each transformation
- Full-screen code editor for complex transformations
- Execution logs and error tracking

### 📦 Export
- Extract tree-shaken CSS (only used classes)
- Download complete HTML files with inline styles
- Copy to clipboard
- View statistics (class count, CSS size, HTML size)

### ⚙️ Settings
- View storage usage breakdown
- Clear editor data, transformations, or all data
- Auto-save status indicator

## Getting Started

### Installation

No installation required! This is a static web application. Simply:

1. Clone or download this repository
2. Start a web server in the repository's directory
3. Open `index.html` in a modern web browser
4. Start coding!

### Local Development

For local development with a web server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js (http-server)
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## Usage

### Basic Workflow

1. **Write HTML**: Use the Monaco editor to write HTML with Tailwind classes
2. **Preview**: See your changes in real-time in the preview pane
3. **Export**: Click "Export" to get a standalone HTML file with extracted CSS

### Keyboard Shortcuts

- `Ctrl/Cmd + E` - Open export modal
- `Esc` - Close any open modal
- Standard Monaco editor shortcuts apply

### Transformations

Transformations allow you to programmatically modify your code:

1. Click **Transformations** in the toolbar
2. Click **Add Transformation** to create a new one
3. Write JavaScript code that transforms the input string
4. Choose **Manual** (run on-demand) or **Auto** (run on every change)
5. Choose **Editor** (modifies editor content) or **Preview** (only affects preview)

**Example transformation:**
```javascript
// Add a wrapper div
return `<div class="container mx-auto">\n${code}\n</div>`;
```

**Example auto-preview transformation:**
```javascript
// Add dark mode classes automatically in preview
return code.replace(/class="/g, 'class="dark ');
```

## Project Structure

```
tailwind-editor/
├── index.html              # Main HTML entry point
├── js/
│   ├── main.js            # Application entry point
│   ├── config.js          # Configuration settings
│   ├── core/
│   │   ├── App.js         # Main application class
│   │   └── EventBus.js    # Event system
│   ├── modules/
│   │   ├── EditorManager.js           # Monaco editor management
│   │   ├── PreviewManager.js          # Preview iframe management
│   │   ├── TabManager.js              # Tab system
│   │   ├── ExportManager.js           # Export functionality
│   │   ├── SettingsManager.js         # Settings and storage
│   │   └── TransformationsManager.js  # Transformation system
│   ├── services/
│   │   ├── TwindService.js       # Twind CSS extraction
│   │   ├── StorageService.js     # LocalStorage wrapper
│   │   ├── ClipboardService.js   # Clipboard operations
│   │   └── DownloadService.js    # File download utilities
│   ├── components/
│   │   └── Toast.js              # Toast notifications
│   └── utils/
│       ├── constants.js          # Application constants
│       ├── debounce.js          # Debounce utility
│       ├── dom.js               # DOM utilities
│       └── string.js            # String utilities
└── styles/
    ├── variables.css         # CSS custom properties
    ├── reset.css            # CSS reset
    ├── global.css           # Global styles
    ├── components.css       # Component styles
    └── animations.css       # Animation definitions
```

## Architecture

### Core Concepts

- **Event-Driven**: Uses an EventBus for decoupled communication between modules
- **Modular**: Each feature is isolated in its own manager/service
- **Service Layer**: Reusable services for storage, clipboard, downloads, etc.
- **No Build Step**: Pure ES modules, runs directly in the browser

### Key Technologies

- **Monaco Editor** (v0.45.0) - Code editor
- **Twind** (v1.1.3) - Tailwind-in-JS runtime
- **Emmet Monaco** (v5.3.0) - Emmet support
- **ES Modules** - Native JavaScript modules
- **LocalStorage** - Persistent data storage

## Browser Support

Requires a modern browser with support for:
- ES Modules
- Monaco Editor
- LocalStorage
- CSS Custom Properties
- Flexbox/Grid

## Storage

All data is stored locally in your browser using LocalStorage:

- **Editor tabs and content**: Automatically saved on every change
- **Transformations**: Saved when modified
- **Settings**: Persistent across sessions

No data is sent to any server. Everything stays in your browser.

## Customization

### Editor Settings

Edit [`js/config.js`](js/config.js) to customize:
- Editor theme, font size, and font family
- Preview pane default width
- Update delay for live preview
- CDN URLs for dependencies

### Styling

Modify CSS files in the `styles/` directory:
- `variables.css` - Color scheme and design tokens
- `components.css` - UI component styles
- `animations.css` - Animation effects

## Credits

Built with:
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) by Microsoft
- [Twind](https://twind.style/) - Tailwind-in-JS
- [Emmet Monaco](https://github.com/troy351/emmet-monaco-es) by troy351