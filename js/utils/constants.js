/**
 * Application constants
 */

export const STORAGE_KEYS = {
  TABS: 'twind-editor-tabs',
  ACTIVE_TAB: 'twind-editor-active-tab',
  TRANSFORMATIONS: 'twind-editor-transformations'
};

export const DEFAULT_CODE = `<pre style="display:none"><style>
.chd-main{
  width:100%;
  margin:0 auto;
}
</style></pre>
<div class="chd-main">
  <div class="max-w-screen-xl w-full mx-auto">

  </div>
</div>`;

export const TWIND_CDN = {
  CORE: 'https://cdn.jsdelivr.net/npm/@twind/core@1.1.3/+esm',
  AUTOPREFIX: 'https://cdn.jsdelivr.net/npm/@twind/preset-autoprefix@1.0.7/+esm',
  TAILWIND: 'https://cdn.jsdelivr.net/npm/@twind/preset-tailwind@1.1.4/+esm'
};

export const EXCLUDED_SELECTORS = ['html', 'body'];
