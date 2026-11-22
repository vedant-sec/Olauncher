import { Action, AppData, Layout, PresetId, Viewport } from './types';
import { buildLayout } from './layout/geometry';
import { createRenderer } from './canvas/renderer';
import { attachInteraction } from './canvas/interaction';
import { createShell } from './ui/shell';
import { createStatsCard } from './ui/statsCard';
import { createControls } from './ui/controls';
import { createTooltip } from './ui/tooltip';
import { createLogSheet, NewActionDraft } from './ui/logSheet';
import { createMenu } from './ui/menu';
import { computeStats } from './core/stats';
import { DAY, presetThenDate } from './core/time';
import { getLastGoalId, setLastGoalId, uid, clearOnboarded } from './core/meta';
import { db } from './storage/db';
import { exportDataToJSON, parseJSONFile } from './storage/io';
import { generateDemoData } from './data/demo';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function computeDataStart(data: AppData, fallbackNow: number): number {
  const times = [...data.actions.map((a) => a.timestamp), ...data.goals.map((g) => g.createdAt)];
  return times.length ? Math.min(...times) - 1 : fallbackNow - 30 * DAY;
}

function dotRadius(action: Action): number {
  return action.isMilestone ? 4.6 : Math.max(2, 1.2 + Math.sqrt(Math.max(0, action.minutes)) * 0.28);
}

export function startApp(root: HTMLElement, initialData: AppData, launcher = false): void {
  root.replaceChildren();
  document.documentElement.classList.toggle('launcher', launcher);
  const shell = createShell(root, { launcher });
  const renderer = createRenderer(shell.canvas);

  let data = initialData;
  let layout: Layout = buildLayout(data);
  const initialNow = Date.now();
  let dataStart = computeDataStart(data, initialNow);
  let thenDate = Math.max(dataStart, presetThenDate('1m', dataStart, initialNow));
  let preset: PresetId | null = '1m';
  let cutoff: number | null = null;
  let viewport: Viewport = { x: 0, y: 0, zoom: 1 };
  let hoveredActionId: string | null = null;
  let replayActive = false;
  let replayRaf = 0;
  let replayPrevThen = thenDate;
  let replayPrevPreset: PresetId | null = preset;
  let lastHoverAt = 0;

  const statsCard = createStatsCard();
  shell.statsSlot.appendChild(statsCard.element);

  const tooltip = createTooltip();
  shell.tooltipSlot.appendChild(tooltip.element);

  const controls = createControls({
    onPreset: (next) => applyPreset(next),
    onSlider: (ts) => applySlider(ts),
    onPlay: () => toggleReplay(),
  });
  shell.dockSlot.appendChild(controls.element);

  const logSheet = createLogSheet({
    getGoals: () => data.goals,
    getRecentActions: () => [...data.actions].sort((a, b) => b.timestamp - a.timestamp).slice(0, 80),
    getDefaultGoalId: () => {
      const remembered = getLastGoalId();
      return data.goals.some((g) => g.id === remembered) ? remembered : data.goals[0]?.id ?? null;
    },
    onSave: (draft) => addAction(draft),
    onEmpty: () => window.location.reload(),
  });
  shell.sheetSlot.appendChild(logSheet.element);

  const menu = createMenu({
    onExport: () => exportDataToJSON(data),
    onImport: (file) => void importBackup(file),
    onLoadDemo: () => void loadDemo(),
    onClearDemo: () => void clearDemo(),
    onResetView: () => fitView(),
    onClearAll: () => void clearAll(),
    getDemoCount: () => data.actions.filter((a) => a.isDemo).length,
  });
  shell.menuSlot.appendChild(menu.element);

  shell.fab.addEventListener('click', () => logSheet.open());

  if (launcher) {
    document.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  // ---------- viewport ----------

  function applyViewport(next: Viewport): void {
    viewport = next;
    renderer.update({ viewport });
    renderer.invalidate();
  }

  function fitView(): void {
    const { width, height } = renderer.getSize();
    if (!width || !height) return;
    const b = layout.bounds;
    const bw = Math.max(1, b.maxX - b.minX);
    const bh = Math.max(1, b.maxY - b.minY);
    const padX = Math.min(56, width * 0.07);
    const padTop = Math.min(120, height * 0.15);
    const padBottom = Math.min(190, height * 0.24);
    const availW = Math.max(120, width - padX * 2);
    const availH = Math.max(120, height - padTop - padBottom);
    const zoom = Math.max(0.24, Math.min(1.45, Math.min(availW / bw, availH / bh)));
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    applyViewport({
      x: width / 2 - cx * zoom,
      y: padTop + availH / 2 - cy * zoom,
      zoom,
    });
  }

  // ---------- hover / tap ----------

  function hideTooltip(): void {
    tooltip.hide();
    if (hoveredActionId !== null) {
      hoveredActionId = null;
      renderer.update({ hoveredActionId: null });
      renderer.invalidate();
    }
  }

  function hitTest(clientX: number, clientY: number): { entry: Layout['actions'][number]; reach: number } | null {
    const rect = shell.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    let best: Layout['actions'][number] | null = null;
    let bestDist = Infinity;
    let bestReach = 0;

    for (const entry of layout.actions) {
      if (cutoff !== null && entry.action.timestamp > cutoff) continue;
      const px = viewport.x + entry.x * viewport.zoom;
      const py = viewport.y + entry.y * viewport.zoom;
      if (px < -20 || py < -20 || px > rect.width + 20 || py > rect.height + 20) continue;
      const dist = Math.hypot(sx - px, sy - py);
      const reach = Math.max(11, dotRadius(entry.action) * viewport.zoom + 8);
      if (dist < reach && dist < bestDist) {
        best = entry;
        bestDist = dist;
        bestReach = reach;
      }
    }
    return best ? { entry: best, reach: bestReach } : null;
  }

  function hitTestGoal(clientX: number, clientY: number): Layout['goals'][number] | null {
    const rect = shell.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    let best: Layout['goals'][number] | null = null;
    let bestDist = Infinity;
    for (const goal of layout.goals) {
      const gx = viewport.x + goal.x * viewport.zoom;
      const gy = viewport.y + goal.y * viewport.zoom;
      const r = Math.max(18, goal.radius * viewport.zoom + 10);
      const dist = Math.hypot(sx - gx, sy - gy);
      if (dist <= r && dist < bestDist) {
        best = goal;
        bestDist = dist;
      }
    }
    return best;
  }

  function showActionTooltip(entry: Layout['actions'][number], clientX: number, clientY: number): void {
    const goal = layout.goalById.get(entry.action.goalId)?.goal;
    tooltip.show(entry.action, goal, clientX, clientY);
    if (hoveredActionId !== entry.action.id) {
      hoveredActionId = entry.action.id;
      renderer.update({ hoveredActionId });
      renderer.invalidate();
    }
  }

  attachInteraction({
    canvas: shell.canvas,
    getViewport: () => viewport,
    setViewport: applyViewport,
    onHover: (x, y) => {
      if (replayActive) return;
      const now = performance.now();
      if (now - lastHoverAt < 28) return;
      lastHoverAt = now;
      const hit = hitTest(x, y);
      if (hit) showActionTooltip(hit.entry, x, y);
      else hideTooltip();
    },
    onTap: (x, y) => {
      if (replayActive) return;
      const hit = hitTest(x, y);
      if (hit) showActionTooltip(hit.entry, x, y);
      else hideTooltip();
    },
    onLeave: () => hideTooltip(),
    onGestureStart: () => hideTooltip(),
    onResetView: () => fitView(),
    onInteractionChange: (active) => renderer.setInteracting(active),
    onLongPress: (clientX, clientY) => {
      if (replayActive) return;
      const goal = hitTestGoal(clientX, clientY);
      if (!goal) return;
      if (!confirm(`Remove goal "${goal.goal.name}" and its actions?`)) return;
      void (async () => {
        await db.deleteGoal(goal.goal.id);
        data = await db.loadData();
        const now = Date.now();
        dataStart = computeDataStart(data, now);
        layout = buildLayout(data);
        controls.setRange(dataStart, now);
        if (preset === 'all') thenDate = dataStart;
        sync(true);
      })();
    },
  });

  // ---------- sync / state ----------

  function sync(instant = false): void {
    const effectiveNow = cutoff ?? Date.now();
    const stats = computeStats(data, thenDate, effectiveNow);

    if (hoveredActionId && !layout.actions.some((entry) => entry.action.id === hoveredActionId)) {
      hoveredActionId = null;
    }

    renderer.update({
      layout,
      viewport,
      thenDate,
      nowCutoff: cutoff,
      addedByGoal: stats.addedByGoal,
      hoveredActionId,
    });
    renderer.invalidate();
    statsCard.update(stats, thenDate, instant);
    controls.setThenDate(thenDate, preset);
    shell.hint.hidden = data.actions.length > 0;
  }

  function applyPreset(next: PresetId): void {
    if (replayActive) stopReplay(false);
    preset = next;
    thenDate = Math.max(dataStart, presetThenDate(next, dataStart, Date.now()));
    cutoff = null;
    sync();
  }

  function applySlider(timestamp: number): void {
    if (replayActive) stopReplay(false);
    preset = null;
    thenDate = Math.max(dataStart, Math.min(timestamp, Date.now()));
    cutoff = null;
    sync();
  }

  // ---------- replay ----------

  function toggleReplay(): void {
    if (replayActive) stopReplay(true);
    else startReplay();
  }

  function startReplay(): void {
    hideTooltip();
    replayPrevThen = thenDate;
    replayPrevPreset = preset;
    replayActive = true;
    controls.setReplayActive(true);
    preset = null;

    const startTime = dataStart;
    const endTime = Date.now();
    const duration = 9000;
    const t0 = performance.now();

    const step = (): void => {
      const p = Math.min(1, (performance.now() - t0) / duration);
      const replayNow = startTime + (endTime - startTime) * easeInOutCubic(p);
      cutoff = replayNow;
      thenDate = Math.max(dataStart, replayNow - 30 * DAY);
      sync(true);
      if (p < 1) replayRaf = requestAnimationFrame(step);
      else finishReplay();
    };
    replayRaf = requestAnimationFrame(step);
  }

  function finishReplay(): void {
    cancelAnimationFrame(replayRaf);
    replayActive = false;
    controls.setReplayActive(false);
    cutoff = null;
    thenDate = replayPrevThen;
    preset = replayPrevPreset;
    sync(true);
  }

  function stopReplay(restore: boolean): void {
    cancelAnimationFrame(replayRaf);
    replayActive = false;
    controls.setReplayActive(false);
    cutoff = null;
    if (restore) {
      thenDate = replayPrevThen;
      preset = replayPrevPreset;
      sync(true);
    }
  }

  // ---------- actions ----------

  async function addAction(draft: NewActionDraft): Promise<void> {
    if (replayActive) stopReplay(false);
    const action: Action = { id: uid('action'), ...draft };
    data = { goals: data.goals, actions: [...data.actions, action] };
    await db.saveAction(action);
    setLastGoalId(action.goalId);

    const now = Date.now();
    dataStart = computeDataStart(data, now);
    layout = buildLayout(data);
    controls.setRange(dataStart, now);
    if (preset === 'all') thenDate = dataStart;

    const entry = layout.actions.find((item) => item.action.id === action.id);
    const goalLayout = layout.goalById.get(action.goalId);
    if (entry && goalLayout) {
      renderer.addEffect({
        kind: 'pulse',
        start: performance.now(),
        duration: 1150,
        x0: entry.x,
        y0: entry.y,
        cx: entry.ctrlX,
        cy: entry.ctrlY,
        x1: goalLayout.x,
        y1: goalLayout.y,
        hue: goalLayout.goal.color,
      });
      if (action.isMilestone) {
        renderer.addEffect({
          kind: 'ring',
          start: performance.now() + 160,
          duration: 950,
          x: entry.x,
          y: entry.y,
          hue: goalLayout.goal.color,
        });
      }
    }
    sync();
  }

  // ---------- data operations ----------

  async function importBackup(file: File): Promise<void> {
    try {
      const imported = await parseJSONFile(file);
      if (!confirm('Importing a backup replaces all current data. Continue?')) return;
      await db.importData(imported);
      window.location.reload();
    } catch (error) {
      alert(`Import failed: ${(error as Error).message}`);
    }
  }

  async function loadDemo(): Promise<void> {
    if (data.actions.some((a) => a.isDemo)) {
      alert('Demo data is already loaded. Remove it first if you want to reload it.');
      return;
    }
    const demo = generateDemoData();
    const nextSlot = data.goals.reduce((max, goal) => Math.max(max, goal.slotIndex), -1) + 1;
    demo.goals.forEach((goal, i) => {
      goal.slotIndex = nextSlot + i;
    });
    await db.mergeData(demo);
    data = await db.loadData();
    dataStart = computeDataStart(data, Date.now());
    layout = buildLayout(data);
    controls.setRange(dataStart, Date.now());
    fitView();
    sync(true);
  }

  async function clearDemo(): Promise<void> {
    if (!confirm('Remove all demo data? Your own goals and actions stay.')) return;
    await db.clearDemoData();
    window.location.reload();
  }

  async function clearAll(): Promise<void> {
    if (!confirm('Delete every goal and action? This cannot be undone.')) return;
    await db.clearAll();
    clearOnboarded();
    window.location.reload();
  }

  // ---------- PWA install ----------

  let deferredPrompt: InstallPromptEvent | null = null;
  if (!launcher) {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event as InstallPromptEvent;
      menu.setInstallAction(async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        menu.setInstallAction(null);
      });
    });
    window.addEventListener('appinstalled', () => menu.setInstallAction(null));
  }

  // ---------- boot ----------

  controls.setRange(dataStart, Date.now());
  sync(true);
  requestAnimationFrame(() => fitView());
}
