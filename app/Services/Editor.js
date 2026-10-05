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
    editor.onDidChangeModelContent(() => {
      if (!replacing) onChange(editor.getValue());
    });
    return {
      getValue: () => editor.getValue(),
      setValue(value) {
        if (value === editor.getValue()) return;
        replacing = true;
        editor.setValue(value);
        replacing = false;
      },
      replace(value) {
        editor.pushUndoStop();
        editor.executeEdits('replace', [
          { range: editor.getModel().getFullModelRange(), text: value },
        ]);
        editor.pushUndoStop();
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
    return {
      fallback: true,
      getValue: () => input.value,
      setValue: (value) => {
        input.value = value;
      },
      replace: (value) => {
        input.value = value;
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
