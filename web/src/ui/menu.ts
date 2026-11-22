export interface MenuOptions {
  onExport: () => void;
  onImport: (file: File) => void;
  onLoadDemo: () => void;
  onClearDemo: () => void;
  onResetView: () => void;
  onClearAll: () => void;
  getDemoCount: () => number;
}

export interface Menu {
  element: HTMLElement;
  setInstallAction: (action: (() => void) | null) => void;
}

export function createMenu(options: MenuOptions): Menu {
  const element = document.createElement('div');
  element.className = 'menu';
  element.innerHTML = `
    <button type="button" class="icon-btn menu-btn" aria-label="Menu" aria-haspopup="true" aria-expanded="false">⋯</button>
    <div class="menu-panel" role="menu">
      <button type="button" role="menuitem" data-action="export">Export JSON backup</button>
      <button type="button" role="menuitem" data-action="import">Import JSON backup</button>
      <div class="menu-sep"></div>
      <button type="button" role="menuitem" data-action="demo">Load demo data</button>
      <button type="button" role="menuitem" data-action="clear-demo">Clear demo data</button>
      <div class="menu-sep"></div>
      <button type="button" role="menuitem" data-action="reset">Reset view</button>
      <button type="button" role="menuitem" data-action="install" hidden>Install app</button>
      <div class="menu-sep"></div>
      <button type="button" role="menuitem" data-action="clear" class="menu-danger">Clear all data</button>
    </div>
    <input type="file" class="menu-file" accept=".json,application/json" hidden />
  `;

  const button = element.querySelector<HTMLButtonElement>('.menu-btn')!;
  const panel = element.querySelector<HTMLElement>('.menu-panel')!;
  const fileInput = element.querySelector<HTMLInputElement>('.menu-file')!;
  const installBtn = element.querySelector<HTMLButtonElement>('[data-action="install"]')!;
  const clearDemoBtn = element.querySelector<HTMLButtonElement>('[data-action="clear-demo"]')!;

  function setOpen(open: boolean): void {
    element.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      clearDemoBtn.disabled = options.getDemoCount() === 0;
    }
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    setOpen(!element.classList.contains('open'));
  });

  panel.addEventListener('click', (event) => {
    const item = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    if (!item) return;
    const action = item.dataset.action;
    setOpen(false);

    switch (action) {
      case 'export':
        options.onExport();
        break;
      case 'import':
        fileInput.click();
        break;
      case 'demo':
        options.onLoadDemo();
        break;
      case 'clear-demo':
        options.onClearDemo();
        break;
      case 'reset':
        options.onResetView();
        break;
      case 'install':
        break;
      case 'clear':
        options.onClearAll();
        break;
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) options.onImport(file);
    fileInput.value = '';
  });

  document.addEventListener('click', (event) => {
    if (!element.contains(event.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });

  let installAction: (() => void) | null = null;
  installBtn.addEventListener('click', () => installAction?.());

  return {
    element,
    setInstallAction(action: (() => void) | null): void {
      installAction = action;
      installBtn.hidden = action === null;
    },
  };
}
