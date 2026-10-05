export const themes = {
  light: {
    name: 'Paper',
    background: '#f5f6f8',
    surface: '#ffffff',
    text: '#202b36',
    accent: '#0f766e',
    dark: false,
  },
  dark: {
    name: 'Midnight',
    background: '#141a23',
    surface: '#1d2531',
    text: '#e4e9f1',
    accent: '#5eead4',
    dark: true,
  },
  warm: {
    name: 'Sand',
    background: '#f2efe8',
    surface: '#fffdf7',
    text: '#423b31',
    accent: '#9a5928',
    dark: false,
  },
};

export const defaultColors = { brand: '#0f766e', canvas: '#f4f7f6', ink: '#183b38' };

export const starterHtml = `<main class="min-h-screen bg-canvas px-6 py-16 text-ink">
  <div class="mx-auto max-w-xl">
    <span class="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
      A little space to create
    </span>
    <h1 class="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
      Start with an idea.
      <span class="text-brand">Make it yours.</span>
    </h1>
    <p class="mt-5 text-base leading-7 text-ink/70">
      Edit the HTML, try a new color, and watch it come together.
      When you're ready, take only the styles you need.
    </p>
    <div class="mt-8 flex flex-wrap gap-3">
      <a href="#details" class="rounded-lg bg-brand px-5 py-3 text-sm font-medium text-white hover:opacity-90">
        Explore the details &rarr;
      </a>
      <span class="rounded-lg border border-ink/15 px-5 py-3 text-sm">
        Built with Tailwind utilities
      </span>
    </div>
    <section id="details" class="mt-12 grid gap-4 sm:grid-cols-2">
      <article class="rounded-xl border border-ink/10 bg-white p-5">
        <p class="text-xs font-semibold uppercase tracking-wider text-brand">01 / Create</p>
        <h2 class="mt-3 font-semibold">Less setup. More making.</h2>
        <p class="mt-2 text-sm leading-6 text-ink/70">A simple workspace for your next component or page.</p>
      </article>
      <article class="rounded-xl border border-ink/10 bg-white p-5">
        <p class="text-xs font-semibold uppercase tracking-wider text-brand">02 / Keep</p>
        <h2 class="mt-3 font-semibold">Ready to go anywhere.</h2>
        <p class="mt-2 text-sm leading-6 text-ink/70">Copy your HTML and generated styles together. Ready to paste anywhere.</p>
      </article>
    </section>
  </div>
</main>`;

export function newDocument(name = 'Untitled.html', content = '') {
  return {
    id: crypto.randomUUID(),
    name,
    content,
    colors: { ...defaultColors },
    safelist: '',
    preflight: true,
  };
}

export function newWorkspace() {
  const document = newDocument('Welcome.html', starterHtml);
  return {
    version: 1,
    documents: [document],
    activeId: document.id,
    transformations: [],
    settings: {
      theme: 'light',
      customTheme: { ...themes.light },
      fontSize: 14,
      wordWrap: true,
      sidebarCollapsed: false,
    },
  };
}
