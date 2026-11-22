import { WindowStats } from '../core/stats';
import { formatDate, formatHours } from '../core/time';

type Key =
  | 'newActions'
  | 'minutes'
  | 'milestones'
  | 'goalsStarted'
  | 'allActions'
  | 'allMinutes'
  | 'allMilestones'
  | 'allGoals';

interface Tween {
  from: number;
  to: number;
  start: number;
  duration: number;
}

const VALUE_FORMATTERS: Record<Key, (n: number) => string> = {
  newActions: (n) => String(Math.round(n)),
  minutes: (n) => formatHours(n),
  milestones: (n) => String(Math.round(n)),
  goalsStarted: (n) => String(Math.round(n)),
  allActions: (n) => String(Math.round(n)),
  allMinutes: (n) => formatHours(n),
  allMilestones: (n) => String(Math.round(n)),
  allGoals: (n) => String(Math.round(n)),
};

export interface StatsCard {
  element: HTMLElement;
  update: (stats: WindowStats, thenDate: number, instant?: boolean) => void;
}

export function createStatsCard(): StatsCard {
  const element = document.createElement('section');
  element.className = 'stats-card';
  element.setAttribute('aria-live', 'polite');
  element.innerHTML = `
    <div class="stats-head">
      <span class="stats-eyebrow">Then <span class="arrow">→</span> Now</span>
      <span class="stats-range"></span>
    </div>
    <div class="stats-row">
      <div class="stat"><span class="stat-value" data-k="newActions">0</span><span class="stat-label">actions</span></div>
      <div class="stat"><span class="stat-value" data-k="minutes">0 h</span><span class="stat-label">effort</span></div>
      <div class="stat"><span class="stat-value" data-k="milestones">0</span><span class="stat-label">milestones</span></div>
      <div class="stat"><span class="stat-value" data-k="goalsStarted">0</span><span class="stat-label">goals</span></div>
    </div>
    <div class="alltime">
      <span class="alltime-label">All time</span>
      <span><b data-k="allActions">0</b> actions</span>
      <span class="sep">·</span>
      <span><b data-k="allMinutes">0 h</b></span>
      <span class="sep">·</span>
      <span><b data-k="allMilestones">0</b> milestones</span>
      <span class="sep">·</span>
      <span><b data-k="allGoals">0</b> goals</span>
    </div>
  `;

  const rangeEl = element.querySelector<HTMLElement>('.stats-range')!;
  const valueEls = new Map<Key, HTMLElement>();
  element.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => {
    valueEls.set(el.dataset.k as Key, el);
  });

  const tweens = new Map<Key, Tween>();
  const displayed = new Map<Key, number>();
  let raf = 0;

  function setValue(key: Key, value: number): void {
    displayed.set(key, value);
    const el = valueEls.get(key);
    if (el) el.textContent = VALUE_FORMATTERS[key](value);
  }

  function tick(): void {
    const now = performance.now();
    let active = false;
    tweens.forEach((tween, key) => {
      const p = Math.min(1, (now - tween.start) / tween.duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(key, tween.from + (tween.to - tween.from) * eased);
      if (p >= 1) tweens.delete(key);
      else active = true;
    });
    raf = active ? requestAnimationFrame(tick) : 0;
  }

  function animateTo(key: Key, target: number, instant: boolean): void {
    const current = displayed.get(key) ?? 0;
    if (Math.abs(current - target) < 0.01) {
      setValue(key, target);
      return;
    }
    if (instant) {
      tweens.delete(key);
      setValue(key, target);
      return;
    }
    tweens.set(key, { from: current, to: target, start: performance.now(), duration: 650 });
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function update(stats: WindowStats, thenDate: number, instant = false): void {
    rangeEl.textContent = `since ${formatDate(thenDate)}`;
    const targets: Record<Key, number> = {
      newActions: stats.newActions,
      minutes: stats.minutes,
      milestones: stats.milestones,
      goalsStarted: stats.goalsStarted,
      allActions: stats.allActions,
      allMinutes: stats.allMinutes,
      allMilestones: stats.allMilestones,
      allGoals: stats.allGoals,
    };
    (Object.keys(targets) as Key[]).forEach((key) => animateTo(key, targets[key], instant));
  }

  return { element, update };
}
