import { textChange } from './Html.js';

const monacoRoot = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs';

export async function createEditor(container, settings, onChange) {
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${monacoRoot}/loader.js`;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Monaco could not load.'));
      document.head.append(script);
    });
    window.MonacoEnvironment = {
      getWorkerUrl() {
        const source = `self.MonacoEnvironment = { baseUrl: '${monacoRoot}/../' }; importScripts('${monacoRoot}/base/worker/workerMain.js');`;
        return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
      },
    };
    window.require.config({ paths: { vs: monacoRoot } });
    await new Promise((resolve, reject) =>
      window.require(['vs/editor/editor.main'], resolve, reject),
    );
    try {
      const { emmetHTML } = await import('https://cdn.jsdelivr.net/npm/emmet-monaco-es@5.7.0/+esm');
      emmetHTML(window.monaco);
    } catch (error) {
      console.warn('Emmet could not load.', error);
    }
    const editor = window.monaco.editor.create(container, {
      value: '',
      language: 'html',
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
      fontSize: settings.fontSize,
      lineHeight: 23,
      padding: { top: 20, bottom: 20 },
      wordWrap: settings.wordWrap ? 'on' : 'off',
      tabSize: 2,
      tabCompletion: 'on',
      scrollBeyondLastLine: false,
      renderLineHighlight: 'none',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      lineNumbersMinChars: 3,
      folding: true,
      ariaLabel: 'HTML source',
    });
    let replacing = false;
    let composing = false;
    let boundary = () => {};
    let lines = '';
    editor.onDidBlurEditorText(() => {
      if (!replacing) boundary();
    });
    editor.onDidChangeCursorSelection(() => {
      const next = editor
        .getSelections()
        .map((item) => item.positionLineNumber)
        .join(',');
      if (!replacing && lines && next !== lines) boundary();
      lines = next;
    });
    editor.onDidCompositionStart(() => {
      composing = true;
    });
    editor.onDidCompositionEnd(() => {
      composing = false;
      boundary('compositionend');
    });
    editor.onDidChangeModelContent(() => {
      if (!replacing) onChange(editor.getValue());
    });
    function preserveView(update) {
      const viewState = editor.saveViewState();
      try {
        update();
      } finally {
        editor.restoreViewState(viewState);
      }
    }
    return {
      getValue: () => editor.getValue(),
      onEditingBoundary: (callback) => {
        boundary = callback;
      },
      getEditingState: () => ({
        focused: editor.hasTextFocus(),
        composing,
        selections: editor.getSelections().map((item) => ({
          start: editor.getModel().getOffsetAt(item.getStartPosition()),
          end: editor.getModel().getOffsetAt(item.getEndPosition()),
        })),
      }),
      applyTransformation(value) {
        const model = editor.getModel();
        const change = textChange(model.getValue(), value);
        if (change.start === change.end && !change.text) return;
        const scroll = { scrollTop: editor.getScrollTop(), scrollLeft: editor.getScrollLeft() };
        replacing = true;
        try {
          editor.pushUndoStop();
          editor.executeEdits('automatic-transformation', [
            {
              range: window.monaco.Range.fromPositions(
                model.getPositionAt(change.start),
                model.getPositionAt(change.end),
              ),
              text: change.text,
              forceMoveMarkers: true,
            },
          ]);
          editor.pushUndoStop();
          editor.setScrollPosition(scroll);
        } finally {
          replacing = false;
        }
      },
      setValue(value, { preserveView: keepView = false } = {}) {
        if (value === editor.getValue()) return;
        replacing = true;
        try {
          if (keepView) preserveView(() => editor.setValue(value));
          else editor.setValue(value);
        } finally {
          replacing = false;
        }
      },
      replace(value) {
        if (value === editor.getValue()) return;
        preserveView(() => {
          editor.pushUndoStop();
          editor.executeEdits(
            'replace',
            [{ range: editor.getModel().getFullModelRange(), text: value }],
            editor.getSelections(),
          );
          editor.pushUndoStop();
        });
      },
      configure(theme, options) {
        window.monaco.editor.defineTheme('workspace', {
          base: theme.dark ? 'vs-dark' : 'vs',
          inherit: true,
          rules: [],
          colors: {
            'editor.background': theme.surface,
            'editor.foreground': theme.text,
            'editorLineNumber.foreground': theme.dark ? '#8593a5' : '#929da6',
          },
        });
        window.monaco.editor.setTheme('workspace');
        editor.updateOptions({
          fontSize: options.fontSize,
          wordWrap: options.wordWrap ? 'on' : 'off',
        });
      },
      focus: () => editor.focus(),
    };
  } catch (error) {
    console.warn(error);
    const input = document.createElement('textarea');
    input.className = 'source-fallback';
    input.setAttribute('aria-label', 'HTML source');
    input.spellcheck = false;
    container.replaceChildren(input);
    input.addEventListener('input', () => onChange(input.value));
    let boundary = () => {};
    let composing = false;
    let line = 1;
    let replacing = false;
    const checkLine = () => {
      const next = input.value
        .slice(
          0,
          input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd,
        )
        .split('\n').length;
      if (!replacing && next !== line) boundary();
      line = next;
    };
    input.addEventListener('blur', () => boundary());
    input.addEventListener('select', checkLine);
    input.addEventListener('keyup', checkLine);
    input.addEventListener('click', checkLine);
    input.addEventListener('compositionstart', () => {
      composing = true;
    });
    input.addEventListener('compositionend', () => {
      composing = false;
      boundary('compositionend');
    });
    function setValue(value, { preserveView = false } = {}) {
      if (value === input.value) return;
      const { selectionStart, selectionEnd, selectionDirection, scrollTop, scrollLeft } = input;
      input.value = value;
      if (preserveView) {
        input.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
        input.scrollTop = scrollTop;
        input.scrollLeft = scrollLeft;
      }
    }
    return {
      fallback: true,
      getValue: () => input.value,
      onEditingBoundary: (callback) => {
        boundary = callback;
      },
      getEditingState: () => ({
        focused: document.activeElement === input,
        composing,
        selections: [{ start: input.selectionStart, end: input.selectionEnd }],
      }),
      applyTransformation(value) {
        const change = textChange(input.value, value);
        const map = (offset) =>
          offset <= change.start
            ? offset
            : offset >= change.end
              ? offset + change.text.length - (change.end - change.start)
              : change.start + change.text.length;
        const { selectionStart, selectionEnd, selectionDirection, scrollTop, scrollLeft } = input;
        replacing = true;
        input.value = value;
        input.setSelectionRange(map(selectionStart), map(selectionEnd), selectionDirection);
        input.scrollTop = scrollTop;
        input.scrollLeft = scrollLeft;
        line = input.value.slice(0, input.selectionEnd).split('\n').length;
        replacing = false;
      },
      setValue,
      replace: (value) => {
        setValue(value, { preserveView: true });
        onChange(value);
      },
      configure: (_theme, options) => {
        input.style.fontSize = `${options.fontSize}px`;
        input.wrap = options.wordWrap ? 'soft' : 'off';
      },
      focus: () => input.focus(),
    };
  }
}

export async function formatCss(source) {
  const [prettier, postcss] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/prettier@3.5.3/standalone.mjs'),
    import('https://cdn.jsdelivr.net/npm/prettier@3.5.3/plugins/postcss.mjs'),
  ]);
  return prettier.format(source, {
    parser: 'css',
    plugins: [postcss],
    tabWidth: 2,
    printWidth: 100,
  });
}

export async function formatHtml(source) {
  const [prettier, html, postcss, babel, estree] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/prettier@3.5.3/standalone.mjs'),
    import('https://cdn.jsdelivr.net/npm/prettier@3.5.3/plugins/html.mjs'),
    import('https://cdn.jsdelivr.net/npm/prettier@3.5.3/plugins/postcss.mjs'),
    import('https://cdn.jsdelivr.net/npm/prettier@3.5.3/plugins/babel.mjs'),
    import('https://cdn.jsdelivr.net/npm/prettier@3.5.3/plugins/estree.mjs'),
  ]);
  return prettier.format(source, {
    parser: 'html',
    plugins: [html, postcss, babel, estree],
    tabWidth: 2,
  });
}
