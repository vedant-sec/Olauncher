import { Action, AppData, Goal, Layout, Viewport } from './types';
import { buildLayout } from './layout/geometry';
import { createRenderer, Renderer } from './canvas/renderer';
import { attachInteraction } from './canvas/interaction';
import { db } from './storage/db';
import { uid } from './core/meta';
import { DAY, presetThenDate } from './core/time';
import { startStatusBar, stopStatusBar } from './statusBar';

const PALETTE = [210, 350, 140, 45, 280, 180, 90, 320, 20, 240];
const GOAL_PLACEHOLDER = 'Add a goal';
const ACTION_PLACEHOLDER = 'What did you do?';
const EFFORT_OPTIONS = [15, 30, 45, 60, 90, 120];

function computeDataStart(data: AppData, fallbackNow: number): number {
  const times = [...data.actions.map((a) => a.timestamp), ...data.goals.map((g) => g.createdAt)];
  return times.length ? Math.min(...times) - 1 : fallbackNow - 30 * DAY;
}

function nextSlotIndex(goals: Goal[]): number {
  return goals.reduce((max, g) => Math.max(max, g.slotIndex), -1) + 1;
}

function isBottomDeadZone(_clientY: number): boolean {
  return false;
}

export function startLauncher(root: HTMLElement): void {
  root.replaceChildren();
  document.documentElement.classList.add('launcher');

  const params = new URLSearchParams(location.search);
  const debug = params.get('debug') === '1';

  let data: AppData = { goals: [], actions: [] };
  let currentScreen: 'home' | 'mirror' | null = null;
  let homeEl: HTMLElement | null = null;
  let mirrorEl: HTMLElement | null = null;
  let renderer: Renderer | null = null;
  let detachInteraction: (() => void) | null = null;
  let viewport: Viewport = { x: 0, y: 0, zoom: 1 };
  let layout: Layout = buildLayout(data);
  let placeholderTimer = 0;
  let enteredMirrorFromHome = false;
  let sleepTapTimer = 0;
  let lastTapAt = 0;

  function setScreenToSleep(): boolean {
    const bridge = (window as unknown as { SleepBridge?: { onSleep: () => void } }).SleepBridge;
    console.log('SleepBridge available:', !!bridge);
    if (!bridge) return false;
    try {
      bridge.onSleep();
      console.log('SleepBridge.onSleep() called');
      return true;
    } catch (err) {
      console.error('SleepBridge error:', err);
      return false;
    }
  }

  function handleDoubleTapSleep(e: PointerEvent): boolean {
    if (e.pointerType !== 'touch') return false;
    const now = performance.now();
    const isDouble = lastTapAt > 0 && now - lastTapAt < 350 && lastTapAt > 0;
    window.clearTimeout(sleepTapTimer);
    if (isDouble) {
      console.log('Double tap detected');
      const result = setScreenToSleep();
      console.log('setScreenToSleep result:', result);
      if (result) {
        lastTapAt = 0;
        return true;
      }
    }
    lastTapAt = now;
    sleepTapTimer = window.setTimeout(() => {
      lastTapAt = 0;
    }, 350);
    return false;
  }

  // --- shared data ---

  async function reloadData(): Promise<void> {
    data = await db.loadData();
    layout = buildLayout(data);
  }

  function fitView(canvasW: number, canvasH: number): Viewport {
    const b = layout.bounds;
    const bw = Math.max(1, b.maxX - b.minX);
    const bh = Math.max(1, b.maxY - b.minY);
    const padX = Math.min(56, canvasW * 0.07);
    const padTop = Math.min(120, canvasH * 0.12);
    const padBottom = Math.min(80, canvasH * 0.1);
    const availW = Math.max(120, canvasW - padX * 2);
    const availH = Math.max(120, canvasH - padTop - padBottom);
    const zoom = Math.max(0.24, Math.min(1.45, Math.min(availW / bw, availH / bh)));
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    return {
      x: canvasW / 2 - cx * zoom,
      y: padTop + availH / 2 - cy * zoom,
      zoom,
    };
  }

  // --- routing ---

  function normalizeHash(hash: string): '#/' | '#/mirror' {
    return hash === '#/mirror' ? '#/mirror' : '#/';
  }

  function navigate(hash: '#/' | '#/mirror'): void {
    if (normalizeHash(location.hash) === hash) {
      void showScreen(hash === '#/mirror' ? 'mirror' : 'home');
      return;
    }
    location.hash = hash;
  }

  function onHashChange(): void {
    const next = normalizeHash(location.hash);
    void showScreen(next === '#/mirror' ? 'mirror' : 'home');
  }

  // --- Home ---

  function mountHome(): void {
    homeEl = document.createElement('div');
    homeEl.className = 'launcher-home';
    homeEl.innerHTML = `
      <div class="launcher-home-stack">
        <div class="launcher-home-input-wrap">
          <input
            class="launcher-home-input"
            type="text"
            inputmode="text"
            enterkeyhint="done"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="sentences"
            spellcheck="false"
            maxlength="60"
            placeholder="${GOAL_PLACEHOLDER}"
            aria-label="Add a goal"
          />
        </div>

        <div class="launcher-home-mode" role="group" aria-label="Home mode">
          <button type="button" class="launcher-mode-btn active" data-mode="goal">Goal</button>
          <button type="button" class="launcher-mode-btn" data-mode="action">Action</button>
        </div>

        <div class="launcher-action-panel" hidden>
          <div class="launcher-goal-chips" role="group" aria-label="Choose a goal"></div>
          <div class="launcher-effort-row">
            <div class="launcher-effort-chips" role="group" aria-label="Effort">
              ${EFFORT_OPTIONS.map((m) => `<button type="button" class="launcher-effort" data-minutes="${m}">${m}m</button>`).join('')}
            </div>
            <button type="button" class="launcher-milestone" aria-pressed="false">◆</button>
          </div>
        </div>
      </div>
    `;
    root.appendChild(homeEl);

    const input = homeEl.querySelector<HTMLInputElement>('.launcher-home-input')!;
    const modeButtons = [...homeEl.querySelectorAll<HTMLButtonElement>('.launcher-mode-btn')];
    const actionPanel = homeEl.querySelector<HTMLElement>('.launcher-action-panel')!;
    const goalChips = homeEl.querySelector<HTMLElement>('.launcher-goal-chips')!;
    const effortChips = [...homeEl.querySelectorAll<HTMLButtonElement>('.launcher-effort')];
    const milestoneBtn = homeEl.querySelector<HTMLButtonElement>('.launcher-milestone')!;

    let mode: 'goal' | 'action' = 'goal';
    let selectedGoalId: string | null = null;
    let selectedMinutes = 30;
    let isMilestone = false;
    let pointerStart: { x: number; y: number; id: number } | null = null;

    function syncMode(): void {
      const actionMode = mode === 'action';
      actionPanel.hidden = !actionMode;
      input.placeholder = actionMode ? ACTION_PLACEHOLDER : GOAL_PLACEHOLDER;
      input.setAttribute('aria-label', actionMode ? 'Log an action' : 'Add a goal');
      input.maxLength = actionMode ? 140 : 60;
      modeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
      if (actionMode) renderGoalChips();
    }

    function syncEffort(): void {
      effortChips.forEach((btn) => {
        const minutes = Number(btn.dataset.minutes);
        btn.classList.toggle('active', !isMilestone && minutes === selectedMinutes);
        btn.disabled = isMilestone;
      });
      milestoneBtn.classList.toggle('active', isMilestone);
      milestoneBtn.setAttribute('aria-pressed', String(isMilestone));
    }

    function renderGoalChips(): void {
      goalChips.replaceChildren();
      const goals = data.goals;
      if (goals.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'launcher-goal-empty';
        empty.textContent = 'Add a goal first';
        goalChips.appendChild(empty);
        selectedGoalId = null;
        return;
      }
      if (!selectedGoalId || !goals.some((g) => g.id === selectedGoalId)) {
        selectedGoalId = goals[goals.length - 1].id;
      }
      for (const goal of goals) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'launcher-goal-chip';
        btn.dataset.goalId = goal.id;
        btn.style.setProperty('--hue', String(goal.color));
        btn.textContent = goal.name;
        btn.classList.toggle('active', goal.id === selectedGoalId);
        btn.addEventListener('click', () => {
          selectedGoalId = goal.id;
          goalChips.querySelectorAll<HTMLElement>('.launcher-goal-chip').forEach((el) => {
            el.classList.toggle('active', el.dataset.goalId === selectedGoalId);
          });
          input.focus();
        });
        goalChips.appendChild(btn);
      }
    }

    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = (btn.dataset.mode as 'goal' | 'action') || 'goal';
        syncMode();
        input.value = '';
        input.focus();
      });
    });

    effortChips.forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedMinutes = Number(btn.dataset.minutes);
        isMilestone = false;
        syncEffort();
      });
    });

    milestoneBtn.addEventListener('click', () => {
      isMilestone = !isMilestone;
      syncEffort();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (mode === 'goal') void submitGoal(input);
      else void submitAction(input, () => selectedGoalId, () => selectedMinutes, () => isMilestone);
    });

    // Swipe left to open mirror.
    homeEl.addEventListener('pointerdown', (e) => {
      if (isBottomDeadZone(e.clientY)) return;
      const target = e.target as HTMLElement;
      if (target.closest('.launcher-home-input, .launcher-mode-btn, .launcher-goal-chip, .launcher-effort, .launcher-milestone')) return;
      pointerStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    homeEl.addEventListener('pointerup', (e) => {
      if (!pointerStart || pointerStart.id !== e.pointerId) return;
      const dx = e.clientX - pointerStart.x;
      const dy = e.clientY - pointerStart.y;
      pointerStart = null;
      if (dx <= -80 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        navigate('#/mirror');
      }
    });
    homeEl.addEventListener('pointercancel', () => {
      pointerStart = null;
    });

    syncEffort();
    syncMode();
    startStatusBar();

    homeEl.addEventListener('pointerup', (e) => {
      if (handleDoubleTapSleep(e)) e.preventDefault();
    });
  }

  function unmountHome(): void {
    window.clearTimeout(placeholderTimer);
    placeholderTimer = 0;
    homeEl?.remove();
    homeEl = null;
    stopStatusBar();
  }

  async function submitGoal(input: HTMLInputElement): Promise<void> {
    const raw = input.value.trim().slice(0, 60);
    if (!raw) return;

    const current = await db.loadData();
    const duplicate = current.goals.some((g) => g.name.toLowerCase() === raw.toLowerCase());
    if (duplicate) {
      flashPlaceholder(input, 'Already added', GOAL_PLACEHOLDER);
      input.value = '';
      return;
    }

    const slotIndex = nextSlotIndex(current.goals);
    const goal: Goal = {
      id: uid('goal'),
      name: raw,
      color: PALETTE[slotIndex % PALETTE.length],
      createdAt: Date.now(),
      slotIndex,
    };

    await db.saveGoal(goal);
    data = { ...current, goals: [...current.goals, goal] };
    layout = buildLayout(data);
    input.value = '';
    flashPlaceholder(input, 'Added', GOAL_PLACEHOLDER);
  }

  async function submitAction(
    input: HTMLInputElement,
    getGoalId: () => string | null,
    getMinutes: () => number,
    getMilestone: () => boolean,
  ): Promise<void> {
    const raw = input.value.trim().slice(0, 140);
    if (!raw) return;

    const current = await db.loadData();
    const goalId = getGoalId();
    if (!goalId || !current.goals.some((g) => g.id === goalId)) {
      flashPlaceholder(input, 'Pick a goal', ACTION_PLACEHOLDER);
      return;
    }

    const action: Action = {
      id: uid('action'),
      goalId,
      text: raw,
      minutes: getMilestone() ? 0 : getMinutes(),
      isMilestone: getMilestone(),
      timestamp: Date.now(),
    };

    await db.saveAction(action);
    data = { ...current, actions: [...current.actions, action] };
    layout = buildLayout(data);
    input.value = '';
    flashPlaceholder(input, 'Logged', ACTION_PLACEHOLDER);
  }

  function flashPlaceholder(input: HTMLInputElement, text: string, restore: string): void {
    window.clearTimeout(placeholderTimer);
    input.placeholder = text;
    placeholderTimer = window.setTimeout(() => {
      input.placeholder = restore;
      placeholderTimer = 0;
    }, 1200);
  }

  // --- Mirror ---

  function mountMirror(): void {
    startStatusBar();
    mirrorEl = document.createElement('div');
    mirrorEl.className = 'launcher-mirror';
    mirrorEl.innerHTML = `
      <canvas class="stage launcher-mirror-canvas" aria-label="Progress map"></canvas>
      <div class="launcher-action-detail" hidden></div>
    `;
    root.appendChild(mirrorEl);

    const canvas = mirrorEl.querySelector<HTMLCanvasElement>('.launcher-mirror-canvas')!;
    const actionDetail = mirrorEl.querySelector<HTMLElement>('.launcher-action-detail')!;
    let swipeStart: { x: number; y: number; t: number; id: number } | null = null;
    let actionDetailTimer = 0;

    function hideActionDetail(): void {
      actionDetail.hidden = true;
      window.clearTimeout(actionDetailTimer);
      actionDetailTimer = 0;
    }

    function showActionDetail(entry: Layout['actions'][number], clientX: number, clientY: number): void {
      const goal = layout.goalById.get(entry.action.goalId)?.goal;
      actionDetail.innerHTML = `
        <div class="lad-goal">${goal?.name ?? 'Goal'}</div>
        <div class="lad-text">${entry.action.text || 'Action'}</div>
        <div class="lad-meta">
          ${entry.action.isMilestone ? 'Milestone' : 'Effort'} · ${entry.action.minutes} min · ${new Date(entry.action.timestamp).toLocaleDateString()}</div>
        </div>
      `;
      actionDetail.hidden = false;
      actionDetail.style.left = `${Math.min(Math.max(clientX, 130), window.innerWidth - 130)}px`;
      actionDetail.style.top = `${Math.max(clientY - 160, 10)}px`;
      window.clearTimeout(actionDetailTimer);
      actionDetailTimer = window.setTimeout(() => {
        actionDetail.hidden = true;
        actionDetailTimer = 0;
      }, 4000);
    }

    // Allow all swipes across the full canvas.
    canvas.addEventListener('pointerdown', (e) => {
      if (isBottomDeadZone(e.clientY)) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
      swipeStart = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    }, { capture: true });

    canvas.addEventListener('pointerup', (e) => {
      if (!swipeStart || swipeStart.id !== e.pointerId) return;
      const dx = e.clientX - swipeStart.x;
      const dy = e.clientY - swipeStart.y;
      const dt = performance.now() - swipeStart.t;
      swipeStart = null;
      // Swipe right to go back (quick, mostly horizontal). Navigating unmounts
      // the mirror immediately, so any pan during the gesture is irrelevant.
      if (dx >= 120 && Math.abs(dx) > Math.abs(dy) * 1.2 && dt < 500) {
        if (enteredMirrorFromHome) history.back();
        else location.hash = '#/';
      }
    }, { capture: true });

    canvas.addEventListener('pointercancel', () => {
      swipeStart = null;
    }, { capture: true });

    const now = Date.now();
    const dataStart = computeDataStart(data, now);
    const thenDate = Math.max(dataStart, presetThenDate('1m', dataStart, now));

    renderer = createRenderer(canvas, {
      debug,
      maxDpr: 2,
      staticCache: true,
    });

    viewport = { x: 0, y: 0, zoom: 1 };
    renderer.update({
      layout,
      thenDate,
      nowCutoff: null,
      addedByGoal: new Map(),
      hoveredActionId: null,
      viewport,
    });

    // Initial fit after layout/size is known.
    requestAnimationFrame(() => {
      if (!renderer) return;
      const size = renderer.getSize();
      viewport = fitView(size.width, size.height);
      renderer.update({ viewport });
      renderer.invalidate();
    });

    function hitTestGoal(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
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

    function hitTestAction(clientX: number, clientY: number): Layout['actions'][number] | null {
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      let best: Layout['actions'][number] | null = null;
      let bestDist = Infinity;
      for (const entry of layout.actions) {
        const px = viewport.x + entry.x * viewport.zoom;
        const py = viewport.y + entry.y * viewport.zoom;
        const r = Math.max(11, (entry.action.isMilestone ? 4.6 : Math.max(2, 1.2 + Math.sqrt(Math.max(0, entry.action.minutes)) * 0.28)) * viewport.zoom + 8);
        const dist = Math.hypot(sx - px, sy - py);
        if (dist < r && dist < bestDist) {
          best = entry;
          bestDist = dist;
        }
      }
      return best;
    }

    detachInteraction = attachInteraction({
      canvas,
      getViewport: () => viewport,
      setViewport: (next) => {
        viewport = next;
        renderer?.update({ viewport });
      },
      onHover: () => {},
      onTap: (clientX, clientY) => {
        const entry = hitTestAction(clientX, clientY);
        if (entry) showActionDetail(entry, clientX, clientY);
        else hideActionDetail();
      },
      onLeave: () => {},
      onGestureStart: () => { hideActionDetail(); },
      onResetView: () => {
        if (!renderer) return;
        const size = renderer.getSize();
        viewport = fitView(size.width, size.height);
        renderer.update({ viewport });
      },
      onInteractionChange: (active) => renderer?.setInteracting(active),
      onLongPress: (clientX, clientY) => {
        const goal = hitTestGoal(clientX, clientY);
        if (!goal) return;
        const name = goal.goal.name;
        if (!confirm(`Remove goal "${name}" and its actions?`)) return;
        void (async () => {
          await db.deleteGoal(goal.goal.id);
          await reloadData();
          refreshMirror();
        })();
      },
    });
  }

  function unmountMirror(): void {
    detachInteraction?.();
    detachInteraction = null;
    renderer?.destroy();
    renderer = null;
    mirrorEl?.remove();
    mirrorEl = null;
    stopStatusBar();
  }

  // --- screen switching ---

  async function showScreen(screen: 'home' | 'mirror'): Promise<void> {
    if (currentScreen === screen) {
      if (screen === 'mirror') {
        await reloadData();
        refreshMirror();
      }
      return;
    }

    const from = currentScreen;
    if (screen === 'mirror') enteredMirrorFromHome = from === 'home' || (from === null && enteredMirrorFromHome);
    if (screen === 'home') enteredMirrorFromHome = false;

    if (from === 'mirror') unmountMirror();
    if (from === 'home') unmountHome();

    await reloadData();
    currentScreen = screen;
    if (screen === 'home') mountHome();
    else mountMirror();
  }

  function refreshMirror(): void {
    if (!renderer) return;
    const now = Date.now();
    const dataStart = computeDataStart(data, now);
    const thenDate = Math.max(dataStart, presetThenDate('1m', dataStart, now));
    renderer.update({
      layout,
      thenDate,
      nowCutoff: null,
      addedByGoal: new Map(),
      hoveredActionId: null,
    });
  }

  // --- boot ---

  window.addEventListener('hashchange', onHashChange);

  const initial = normalizeHash(location.hash);
  if (initial === '#/mirror') {
    // Ensure Android Back returns to Home even when Mirror is opened directly.
    enteredMirrorFromHome = true;
    history.replaceState(null, '', '#/');
    location.hash = '#/mirror';
  } else if (location.hash !== initial) {
    location.replace(initial);
  } else {
    void showScreen('home');
  }
}
