export interface ShellOptions {
  launcher?: boolean;
}

export interface Shell {
  canvas: HTMLCanvasElement;
  menuSlot: HTMLElement;
  statsSlot: HTMLElement;
  tooltipSlot: HTMLElement;
  dockSlot: HTMLElement;
  sheetSlot: HTMLElement;
  fab: HTMLButtonElement;
  hint: HTMLElement;
}

export function createShell(root: HTMLElement, options: ShellOptions = {}): Shell {
  const launcher = !!options.launcher;

  root.innerHTML = `
    <canvas class="stage" aria-label="Your progress map. Drag to pan, pinch or scroll to zoom."></canvas>
    <div class="ui-layer">
      <header class="topbar">
        <div class="brand"><span class="brand-mark"></span><span class="brand-name">Progress Mirror</span></div>
        <div class="menu-slot"></div>
      </header>
      <div class="stats-slot"></div>
      <div class="tooltip-slot"></div>
      <div class="empty-hint" hidden>No actions yet — tap <b>+</b> to log your first one.</div>
      <div class="dock-slot"></div>
      <button type="button" class="fab" aria-label="Log an action"><span>+</span></button>
      ${launcher
        ? `<div class="launcher-strip"><div class="launcher-handle" aria-hidden="true"></div></div>`
        : ``}
      <div class="sheet-slot"></div>
    </div>
  `;

  return {
    canvas: root.querySelector<HTMLCanvasElement>('.stage')!,
    menuSlot: root.querySelector<HTMLElement>('.menu-slot')!,
    statsSlot: root.querySelector<HTMLElement>('.stats-slot')!,
    tooltipSlot: root.querySelector<HTMLElement>('.tooltip-slot')!,
    dockSlot: root.querySelector<HTMLElement>('.dock-slot')!,
    sheetSlot: root.querySelector<HTMLElement>('.sheet-slot')!,
    fab: root.querySelector<HTMLButtonElement>('.fab')!,
    hint: root.querySelector<HTMLElement>('.empty-hint')!,
  };
}
