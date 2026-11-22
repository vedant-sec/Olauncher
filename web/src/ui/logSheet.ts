import { Action, Goal } from '../types';
import { toDateInputValue, dateInputToTimestamp, formatMinutes } from '../core/time';

export interface NewActionDraft {
  goalId: string;
  text: string;
  minutes: number;
  isMilestone: boolean;
  timestamp: number;
  note?: string;
}

export interface LogSheetOptions {
  getGoals: () => Goal[];
  getRecentActions: () => Action[];
  getDefaultGoalId: () => string | null;
  onSave: (draft: NewActionDraft) => void | Promise<void>;
  onEmpty: () => void;
}

export interface LogSheet {
  element: HTMLElement;
  open: () => void;
  close: () => void;
}

const EFFORT_OPTIONS = [15, 30, 45, 60, 90, 120];
const RECENT_LIMIT = 5;

export function createLogSheet(options: LogSheetOptions): LogSheet {
  const element = document.createElement('div');
  element.className = 'log-sheet-root';
  element.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="log-sheet-title">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <h2 id="log-sheet-title">Log an action</h2>
        <button type="button" class="icon-btn sheet-close" aria-label="Close">×</button>
      </div>

      <div class="recent-section field">
        <div class="field-label">Log again</div>
        <div class="recent-chips"></div>
      </div>

      <div class="field">
        <div class="field-label">Goal</div>
        <div class="goal-chips" role="group" aria-label="Choose a goal"></div>
      </div>

      <label class="field">
        <span class="field-label">What did you do?</span>
        <input type="text" class="text-input" placeholder="e.g. 45 min of practice" autocomplete="off" maxlength="140" />
      </label>

      <div class="field">
        <div class="field-label">Effort</div>
        <div class="effort-row">
          <div class="effort-chips" role="group" aria-label="Minutes">${EFFORT_OPTIONS.map(
            (m) => `<button type="button" class="effort" data-minutes="${m}">${m}m</button>`,
          ).join('')}</div>
          <button type="button" class="milestone-toggle" aria-pressed="false"><span class="diamond">◆</span> Milestone</button>
        </div>
      </div>

      <label class="field">
        <span class="field-label">Note <span class="opt">optional</span></span>
        <input type="text" class="note-input" placeholder="Anything worth remembering?" autocomplete="off" maxlength="200" />
      </label>

      <div class="sheet-bottom">
        <label class="date-field">
          <span class="field-label">Date</span>
          <input type="date" class="date-input" />
        </label>
        <button type="button" class="save-btn">Save action</button>
      </div>
    </section>
  `;

  const backdrop = element.querySelector<HTMLElement>('.sheet-backdrop')!;
  const sheet = element.querySelector<HTMLElement>('.sheet')!;
  const goalChips = element.querySelector<HTMLElement>('.goal-chips')!;
  const recentSection = element.querySelector<HTMLElement>('.recent-section')!;
  const recentChips = element.querySelector<HTMLElement>('.recent-chips')!;
  const textInput = element.querySelector<HTMLInputElement>('.text-input')!;
  const noteInput = element.querySelector<HTMLInputElement>('.note-input')!;
  const dateInput = element.querySelector<HTMLInputElement>('.date-input')!;
  const effortChips = [...element.querySelectorAll<HTMLButtonElement>('.effort')];
  const milestoneToggle = element.querySelector<HTMLButtonElement>('.milestone-toggle')!;
  const saveBtn = element.querySelector<HTMLButtonElement>('.save-btn')!;

  let selectedGoalId: string | null = null;
  let selectedMinutes = 30;
  let isMilestone = false;
  let isOpen = false;
  let saving = false;

  element.setAttribute('aria-hidden', 'true');
  sheet.inert = true;

  function renderGoals(): void {
    const goals = options.getGoals();
    goalChips.replaceChildren();
    for (const goal of goals) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'goal-chip';
      btn.dataset.goalId = goal.id;
      btn.style.setProperty('--hue', String(goal.color));
      btn.innerHTML = '<span class="goal-dot"></span><span class="goal-name"></span>';
      btn.querySelector<HTMLElement>('.goal-name')!.textContent = goal.name;
      btn.addEventListener('click', () => {
        selectedGoalId = goal.id;
        syncGoalSelection();
      });
      goalChips.appendChild(btn);
    }
    syncGoalSelection();
  }

  function syncGoalSelection(): void {
    goalChips.querySelectorAll<HTMLElement>('.goal-chip').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.goalId === selectedGoalId);
    });
  }

  function syncEffort(): void {
    effortChips.forEach((btn) => {
      const active = !isMilestone && Number(btn.dataset.minutes) === selectedMinutes;
      btn.classList.toggle('active', active);
      btn.disabled = isMilestone;
    });
    milestoneToggle.classList.toggle('active', isMilestone);
    milestoneToggle.setAttribute('aria-pressed', String(isMilestone));
  }

  function renderRecent(): void {
    const goals = options.getGoals();
    const goalIds = new Set(goals.map((g) => g.id));
    const seen = new Set<string>();
    const groups: Array<{ action: Action; count: number }> = [];

    for (const action of options.getRecentActions()) {
      if (action.isDemo || !goalIds.has(action.goalId)) continue;
      const key = `${action.goalId}|${action.text}|${action.minutes}|${action.isMilestone}`;
      const existing = groups.find((g) => `${g.action.goalId}|${g.action.text}|${g.action.minutes}|${g.action.isMilestone}` === key);
      if (existing) {
        existing.count++;
      } else if (!seen.has(key)) {
        seen.add(key);
        groups.push({ action, count: 1 });
      }
      if (groups.length >= RECENT_LIMIT) break;
    }

    recentChips.replaceChildren();
    recentSection.style.display = groups.length ? '' : 'none';

    for (const { action, count } of groups) {
      const goal = goals.find((g) => g.id === action.goalId);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recent-chip';
      btn.title = `Log again: ${action.text}`;
      if (goal) btn.style.setProperty('--hue', String(goal.color));
      btn.innerHTML = '<span class="goal-dot"></span><span class="recent-text"></span><span class="recent-meta"></span>';
      btn.querySelector<HTMLElement>('.recent-text')!.textContent = action.text;
      btn.querySelector<HTMLElement>('.recent-meta')!.textContent =
        count > 1 ? `${formatMinutes(action.minutes)} · ×${count}` : formatMinutes(action.minutes);
      btn.addEventListener('click', async () => {
        if (saving) return;
        saving = true;
        try {
          await options.onSave({
            goalId: action.goalId,
            text: action.text,
            minutes: action.minutes,
            isMilestone: action.isMilestone,
            timestamp: Date.now(),
          });
          close();
        } finally {
          saving = false;
        }
      });
      recentChips.appendChild(btn);
    }
  }

  function resetForm(): void {
    const goals = options.getGoals();
    const preferred = options.getDefaultGoalId();
    selectedGoalId = preferred && goals.some((g) => g.id === preferred) ? preferred : goals[0]?.id ?? null;
    selectedMinutes = 30;
    isMilestone = false;
    textInput.value = '';
    noteInput.value = '';
    textInput.classList.remove('invalid');
    dateInput.value = toDateInputValue(Date.now());
    dateInput.max = toDateInputValue(Date.now());
    renderGoals();
    renderRecent();
    syncEffort();
  }

  function open(): void {
    if (options.getGoals().length === 0) {
      options.onEmpty();
      return;
    }
    resetForm();
    element.classList.add('open');
    backdrop.classList.add('open');
    sheet.classList.add('open');
    element.removeAttribute('aria-hidden');
    sheet.inert = false;
    isOpen = true;
    window.setTimeout(() => {
      if (window.matchMedia('(pointer: fine)').matches) textInput.focus();
    }, 180);
  }

  function close(): void {
    element.classList.remove('open');
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
    element.setAttribute('aria-hidden', 'true');
    sheet.inert = true;
    isOpen = false;
  }

  async function save(): Promise<void> {
    if (saving || !selectedGoalId) return;
    const text = textInput.value.trim();
    if (!text) {
      textInput.classList.add('invalid');
      textInput.focus();
      return;
    }
    textInput.classList.remove('invalid');
    saving = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await options.onSave({
        goalId: selectedGoalId,
        text,
        minutes: isMilestone ? 0 : selectedMinutes,
        isMilestone,
        timestamp: dateInputToTimestamp(dateInput.value, Date.now()),
        note: noteInput.value.trim() || undefined,
      });
      close();
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save action';
    }
  }

  effortChips.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedMinutes = Number(btn.dataset.minutes);
      isMilestone = false;
      syncEffort();
    });
  });
  milestoneToggle.addEventListener('click', () => {
    isMilestone = !isMilestone;
    syncEffort();
  });
  textInput.addEventListener('input', () => textInput.classList.remove('invalid'));
  textInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void save();
    }
  });
  saveBtn.addEventListener('click', () => void save());
  element.querySelector<HTMLElement>('[data-close]')!.addEventListener('click', close);
  element.querySelector<HTMLElement>('.sheet-close')!.addEventListener('click', close);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) close();
  });

  return { element, open, close };
}
