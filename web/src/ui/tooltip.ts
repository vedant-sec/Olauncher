import { Action, Goal } from '../types';
import { formatDate, formatMinutes } from '../core/time';

export interface Tooltip {
  element: HTMLElement;
  show: (action: Action, goal: Goal | undefined, clientX: number, clientY: number) => void;
  hide: () => void;
}

export function createTooltip(): Tooltip {
  const element = document.createElement('div');
  element.className = 'tooltip';
  element.setAttribute('role', 'status');

  let hideTimer = 0;

  element.innerHTML = `
    <div class="tt-text"></div>
    <div class="tt-meta"><span class="tt-dot"></span><span class="tt-goal"></span><span class="tt-date"></span><span class="tt-effort"></span></div>
    <div class="tt-note"></div>
  `;

  const textEl = element.querySelector<HTMLElement>('.tt-text')!;
  const dotEl = element.querySelector<HTMLElement>('.tt-dot')!;
  const goalEl = element.querySelector<HTMLElement>('.tt-goal')!;
  const dateEl = element.querySelector<HTMLElement>('.tt-date')!;
  const effortEl = element.querySelector<HTMLElement>('.tt-effort')!;
  const noteEl = element.querySelector<HTMLElement>('.tt-note')!;

  function position(clientX: number, clientY: number): void {
    const rect = element.getBoundingClientRect();
    const pad = 12;
    let x = clientX + 16;
    let y = clientY - rect.height - 14;
    if (x + rect.width + pad > window.innerWidth) x = clientX - rect.width - 16;
    if (x < pad) x = pad;
    if (y < pad) y = clientY + 20;
    if (y + rect.height + pad > window.innerHeight) y = window.innerHeight - rect.height - pad;
    element.style.left = `${Math.round(x)}px`;
    element.style.top = `${Math.round(y)}px`;
  }

  return {
    element,
    show(action, goal, clientX, clientY): void {
      clearTimeout(hideTimer);
      textEl.textContent = action.text;
      if (goal) {
        dotEl.style.background = `hsl(${goal.color}, 70%, 62%)`;
        goalEl.textContent = goal.name;
        goalEl.style.display = '';
        dotEl.style.display = '';
      } else {
        goalEl.style.display = 'none';
        dotEl.style.display = 'none';
      }
      dateEl.textContent = formatDate(action.timestamp);
      effortEl.textContent = action.isMilestone ? 'Milestone' : formatMinutes(action.minutes);
      noteEl.textContent = action.note ?? '';
      noteEl.style.display = action.note ? '' : 'none';

      element.classList.add('visible');
      position(clientX, clientY);
    },
    hide(): void {
      hideTimer = window.setTimeout(() => element.classList.remove('visible'), 60);
    },
  };
}
