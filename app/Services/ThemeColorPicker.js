export function bindThemeColorPicker(form, popup) {
  const fields = [...form.querySelectorAll('input[name]')];
  const buttons = [...form.querySelectorAll('[data-theme-color]')];
  const controls = popup.querySelector('.theme-picker-controls');
  let activeInput;
  let activeButton;
  let picker;
  let loading;
  let syncing = false;

  function position() {
    if (!popup.matches(':popover-open')) return;
    const anchor = activeButton.getBoundingClientRect();
    const { width, height } = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(16, Math.min(anchor.left, innerWidth - width - 16))}px`;
    const top =
      anchor.bottom + height + 8 <= innerHeight - 16 ? anchor.bottom + 8 : anchor.top - height - 8;
    popup.style.top = `${Math.max(16, Math.min(top, innerHeight - height - 16))}px`;
  }

  async function load() {
    loading ??= import(
      'https://cdn.jsdelivr.net/npm/@yaireo/color-picker@0.15.1/dist/color-picker.es.js'
    )
      .then(({ default: ColorPicker, any_to_hex }) => {
        // Theme colors and picker state belong to the workspace; the library's
        // optional shared swatches must not introduce localStorage persistence.
        class ThemePicker extends ColorPicker {
          getSetGlobalSwatches() {
            return [];
          }

          setColor(color) {
            if (!color) return;
            super.setColor({ ...this.getHSLA(color), a: 100 });
            // Removing the alpha slider also stops the library updating this
            // CSS variable. Keep the displayed color opaque on every assignment.
            if (this.DOM.scope) this.updateCSSVar('alpha', 100);
          }
        }
        syncing = true;
        try {
          picker = new ThemePicker({
            color: '#ffffff',
            defaultFormat: 'hex',
            swatches: false,
            swatchesLocalStorage: false,
            onInput(color) {
              if (syncing || !activeInput) return;
              activeInput.value = any_to_hex(color).slice(0, 7).toLowerCase();
              activeInput.dispatchEvent(new Event('input', { bubbles: true }));
            },
          });
        } finally {
          syncing = false;
        }
        picker.DOM.scope.querySelector('.color-picker__alpha').remove();
        for (const button of picker.DOM.scope.querySelectorAll('button')) {
          button.type = 'button';
          button.setAttribute('aria-label', button.title);
        }
        picker.DOM.value.autocomplete = 'off';
        picker.DOM.value.inputMode = 'text';
        picker.DOM.value.spellcheck = false;
        picker.DOM.value.addEventListener(
          'change',
          (event) => {
            const valid = CSS.supports('color', event.target.value);
            event.target.setCustomValidity(valid ? '' : 'Enter a valid CSS color.');
            if (!valid) {
              event.stopImmediatePropagation();
              event.target.reportValidity();
            }
          },
          true,
        );
        controls.replaceChildren(picker.DOM.scope);
      })
      .catch((error) => {
        loading = null;
        throw error;
      });
    await loading;
  }

  function sync() {
    for (const input of fields) {
      if (input.checkValidity())
        form
          .querySelector(`[data-theme-color="${input.name}"]`)
          .style.setProperty('--theme-color', input.value);
    }
  }

  function close() {
    if (popup.matches(':popover-open')) popup.hidePopover();
  }

  for (const button of buttons) {
    button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', async () => {
      if (activeButton === button && popup.matches(':popover-open')) {
        close();
        return;
      }
      activeButton = button;
      activeInput = form.elements.namedItem(button.dataset.themeColor);
      const name = activeInput.labels[0].textContent.trim();
      popup.querySelector('h3').textContent = `${name} color`;
      for (const item of buttons) item.setAttribute('aria-expanded', String(item === button));
      if (!popup.matches(':popover-open')) popup.showPopover();
      position();
      try {
        await load();
        if (!popup.matches(':popover-open')) return;
        syncing = true;
        try {
          picker.setColor(activeInput.checkValidity() ? activeInput.value : '#ffffff');
        } finally {
          syncing = false;
        }
        const label = activeInput.labels[0].textContent.trim();
        for (const input of picker.DOM.scope.querySelectorAll('input'))
          input.setAttribute(
            'aria-label',
            `${label} ${input.name === 'value' ? 'color value' : input.name}`,
          );
        position();
        picker.DOM.value.focus();
      } catch {
        controls.textContent =
          'Color picker could not load. You can still enter hex colors in the theme fields.';
        position();
      }
    });
  }
  form.addEventListener('input', sync);
  popup.addEventListener('toggle', (event) => {
    if (event.newState === 'closed')
      for (const button of buttons) button.setAttribute('aria-expanded', 'false');
  });
  popup.querySelector('[data-close-picker]').addEventListener('click', () => {
    close();
    activeButton.focus();
  });
  popup.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      activeButton.focus();
    }
  });
  window.addEventListener('resize', position);
  popup.closest('dialog').addEventListener('scroll', position);
  popup.closest('dialog').addEventListener('close', close);
  return { sync, close };
}
