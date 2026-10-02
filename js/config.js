/**
 * Application configuration
 */

import { DEFAULT_CODE, STORAGE_KEYS } from './utils/constants.js';

export const config = {
  debug: false,
  
  storage: {
    tabsKey: STORAGE_KEYS.TABS,
    activeTabKey: STORAGE_KEYS.ACTIVE_TAB
  },
  
  editor: {
    theme: 'vs-dark',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 22,
    minimap: { enabled: false },
    wordWrap: 'on',
    tabSize: 2,
    insertSpaces: true,
    formatOnPaste: true,
    formatOnType: true,
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoIndent: 'full',
    scrollBeyondLastLine: false,
    quickSuggestions: {
      other: true,
      comments: false,
      strings: true
    },
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    tabCompletion: 'on',
    snippetSuggestions: 'inline',
    suggest: {
      snippetsPreventQuickSuggestions: false
    }
  },
  
  preview: {
    defaultWidth: '45%',
    minWidth: 15,
    maxWidth: 80,
    updateDelay: 600
  },
  
  cdn: {
    monaco: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs',
    twind: 'https://cdn.jsdelivr.net/npm/@twind/core@1.1.3/+esm',
    twindAutoprefix: 'https://cdn.jsdelivr.net/npm/@twind/preset-autoprefix@1.0.7/+esm',
    twindTailwind: 'https://cdn.jsdelivr.net/npm/@twind/preset-tailwind@1.1.4/+esm'
  },
  
  defaultCode: DEFAULT_CODE
};
