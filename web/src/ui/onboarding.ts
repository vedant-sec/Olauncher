import { Action, AppData, Goal } from '../types';
import { generateDemoData } from '../data/demo';
import { db } from '../storage/db';
import { setOnboarded, uid } from '../core/meta';
import {
  formatMinutes,
  monthInputToTimestamp,
  toMonthInputValue,
} from '../core/time';

const PALETTE = [210, 350, 140, 45, 280, 180, 90, 320, 20, 240];
const EFFORT_OPTIONS = [15, 30, 45, 60, 90, 120];

export function showOnboarding(root: HTMLElement, onComplete: (data: AppData) => void): void {
  const element = document.createElement('div');
  element.className = 'onboarding';
  element.innerHTML = `
    <div class="onboard-panel">
      <header class="onboard-head">
        <div class="onboard-brand"><span class="brand-mark small"></span> Progress Mirror</div>
        <h1>Add what you have already done.</h1>
        <p>Start with the work that exists. Approximate dates are fine — month precision is enough. You should see distance travelled on day one.</p>
      </header>

      <section class="onboard-card">
        <h2><span class="step">1</span> Goals</h2>
        <p class="hint">What have you been working on?</p>
        <form class="goal-form">
          <input type="text" class="goal-input" placeholder="Goal name" autocomplete="off" maxlength="48" />
          <button type="submit" class="add-goal">Add goal</button>
        </form>
        <div class="onboard-goals"></div>
      </section>

      <section class="onboard-card">
        <h2><span class="step">2</span> Past actions</h2>
        <p class="hint">Add a few things you have already done. Milestones count too.</p>

        <div class="backfill-goals" role="group" aria-label="Choose a goal"></div>

        <form class="action-form">
          <input type="text" class="action-text" placeholder="What did you do?" autocomplete="off" maxlength="140" />
          <div class="action-row">
            <div class="effort-chips" role="group" aria-label="Minutes">
              ${EFFORT_OPTIONS.map((m) => `<button type="button" class="effort" data-minutes="${m}">${m}m</button>`).join('')}
            </div>
            <button type="button" class="milestone-toggle" aria-pressed="false"><span class="diamond">◆</span> Milestone</button>
          </div>
          <div class="action-row bottom-row">
            <label class="month-field"><span>When</span><input type="month" class="month-input" /></label>
            <button type="submit" class="add-action">Add past action</button>
          </div>
        </form>

        <div class="entry-summary"></div>
        <div class="entry-list"></div>
      </section>

      <div class="onboard-footer">
        <button type="button" class="finish-btn primary">See my progress</button>
        <div class="onboard-error" role="alert"></div>
        <button type="button" class="demo-btn">Load demo data instead</button>
        <p class="demo-note">Demo adds 7 sample goals and ~900 actions over a year. It is clearly marked as demo and removable at any time.</p>
      </div>
    </div>
  `;

  const goalForm = element.querySelector<HTMLFormElement>('.goal-form')!;
  const goalInput = element.querySelector<HTMLInputElement>('.goal-input')!;
  const goalsEl = element.querySelector<HTMLElement>('.onboard-goals')!;
  const backfillGoals = element.querySelector<HTMLElement>('.backfill-goals')!;
  const actionForm = element.querySelector<HTMLFormElement>('.action-form')!;
  const actionText = element.querySelector<HTMLInputElement>('.action-text')!;
  const monthInput = element.querySelector<HTMLInputElement>('.month-input')!;
  const effortChips = [...element.querySelectorAll<HTMLButtonElement>('.effort')];
  const milestoneToggle = element.querySelector<HTMLButtonElement>('.milestone-toggle')!;
  const summaryEl = element.querySelector<HTMLElement>('.entry-summary')!;
  const entryList = element.querySelector<HTMLElement>('.entry-list')!;
  const finishBtn = element.querySelector<HTMLButtonElement>('.finish-btn')!;
  const errorEl = element.querySelector<HTMLElement>('.onboard-error')!;
  const demoBtn = element.querySelector<HTMLButtonElement>('.demo-btn')!;

  let goals: Goal[] = [];
  let actions: Action[] = [];
  let selectedGoalId: string | null = null;
  let selectedMinutes = 30;
  let isMilestone = false;

  const now = Date.now();
  monthInput.value = toMonthInputValue(now);
  monthInput.max = toMonthInputValue(now);

  function error(message: string): void {
    errorEl.textContent = message;
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

  function renderGoals(): void {
    goalsEl.replaceChildren();
    if (goals.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-note';
      empty.textContent = 'No goals yet. Add at least one to continue.';
      goalsEl.appendChild(empty);
    }
    for (const goal of goals) {
      const chip = document.createElement('div');
      chip.className = 'onboard-goal';
      chip.style.setProperty('--hue', String(goal.color));
      chip.innerHTML = '<span class="goal-dot"></span><span class="onboard-goal-name"></span><button type="button" class="remove-goal" aria-label="Remove goal">×</button>';
      chip.querySelector<HTMLElement>('.onboard-goal-name')!.textContent = goal.name;
      chip.querySelector<HTMLButtonElement>('.remove-goal')!.addEventListener('click', () => {
        goals = goals.filter((g) => g.id !== goal.id);
        actions = actions.filter((a) => a.goalId !== goal.id);
        if (selectedGoalId === goal.id) selectedGoalId = goals[0]?.id ?? null;
        renderGoals();
        renderBackfillGoals();
        renderEntries();
      });
      goalsEl.appendChild(chip);
    }
  }

  function renderBackfillGoals(): void {
    backfillGoals.replaceChildren();
    if (goals.length === 0) {
      const note = document.createElement('span');
      note.className = 'empty-note';
      note.textContent = 'Add a goal first.';
      backfillGoals.appendChild(note);
      return;
    }
    if (!selectedGoalId || !goals.some((g) => g.id === selectedGoalId)) {
      selectedGoalId = goals[0].id;
    }
    for (const goal of goals) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'goal-chip';
      btn.dataset.goalId = goal.id;
      btn.style.setProperty('--hue', String(goal.color));
      btn.classList.toggle('active', goal.id === selectedGoalId);
      btn.innerHTML = '<span class="goal-dot"></span><span class="goal-name"></span>';
      btn.querySelector<HTMLElement>('.goal-name')!.textContent = goal.name;
      btn.addEventListener('click', () => {
        selectedGoalId = goal.id;
        renderBackfillGoals();
      });
      backfillGoals.appendChild(btn);
    }
  }

  function renderEntries(): void {
    entryList.replaceChildren();
    if (actions.length === 0) {
      summaryEl.textContent = 'No past actions yet.';
      return;
    }
    const minutes = actions.reduce((sum, a) => sum + a.minutes, 0);
    summaryEl.textContent = `${actions.length} past ${actions.length === 1 ? 'action' : 'actions'} · ${formatMinutes(minutes)}${actions.some((a) => a.isMilestone) ? ' · includes milestones' : ''}`;

    [...actions]
      .sort((a, b) => b.timestamp - a.timestamp)
      .forEach((action) => {
        const row = document.createElement('div');
        row.className = 'entry-row';
        const goal = goals.find((g) => g.id === action.goalId);
        row.style.setProperty('--hue', String(goal?.color ?? 210));
        const label = document.createElement('span');
        label.className = 'entry-label';
        label.textContent = `${action.text} · ${action.isMilestone ? 'Milestone' : formatMinutes(action.minutes)} · ${new Date(action.timestamp).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'entry-remove';
        remove.setAttribute('aria-label', 'Remove entry');
        remove.textContent = '×';
        remove.addEventListener('click', () => {
          actions = actions.filter((a) => a.id !== action.id);
          renderEntries();
        });
        row.append(label, remove);
        entryList.appendChild(row);
      });
  }

  goalForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = goalInput.value.trim();
    if (!name) {
      goalInput.focus();
      return;
    }
    if (goals.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      error('That goal already exists.');
      return;
    }
    error('');
    const goal: Goal = {
      id: uid('goal'),
      name,
      color: PALETTE[goals.length % PALETTE.length],
      createdAt: now,
      slotIndex: goals.length,
    };
    goals.push(goal);
    selectedGoalId = goal.id;
    goalInput.value = '';
    renderGoals();
    renderBackfillGoals();
    renderEntries();
  });

  actionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!selectedGoalId) {
      error('Add a goal first.');
      goalInput.focus();
      return;
    }
    const text = actionText.value.trim();
    if (!text) {
      actionText.classList.add('invalid');
      actionText.focus();
      return;
    }
    error('');
    actionText.classList.remove('invalid');
    actions.push({
      id: uid('action'),
      goalId: selectedGoalId,
      text,
      minutes: isMilestone ? 0 : selectedMinutes,
      isMilestone,
      timestamp: monthInputToTimestamp(monthInput.value, Date.now()),
    });
    actionText.value = '';
    isMilestone = false;
    syncEffort();
    renderEntries();
  });

  actionText.addEventListener('input', () => actionText.classList.remove('invalid'));
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

  finishBtn.addEventListener('click', async () => {
    if (goals.length === 0) {
      error('Add at least one goal to continue.');
      goalInput.focus();
      return;
    }
    error('');
    finishBtn.disabled = true;
    finishBtn.textContent = 'Saving…';
    const withDates = goals.map((goal) => {
      const goalActions = actions.filter((a) => a.goalId === goal.id);
      const earliest = goalActions.length ? Math.min(...goalActions.map((a) => a.timestamp)) : now;
      return { ...goal, createdAt: Math.min(earliest, now) };
    });
    const data: AppData = { goals: withDates, actions };
    try {
      await db.importData(data);
      setOnboarded();
    } catch (err) {
      console.error(err);
      finishBtn.disabled = false;
      finishBtn.textContent = 'See my progress';
      error('Could not save your data. Please try again.');
      return;
    }
    onComplete(data);
  });

  demoBtn.addEventListener('click', async () => {
    demoBtn.disabled = true;
    demoBtn.textContent = 'Loading demo…';
    const demo = generateDemoData();
    try {
      await db.importData(demo);
      setOnboarded();
    } catch (err) {
      console.error(err);
      demoBtn.disabled = false;
      demoBtn.textContent = 'Load demo data instead';
      error('Could not load demo data. Please try again.');
      return;
    }
    onComplete(demo);
  });

  renderGoals();
  renderBackfillGoals();
  renderEntries();
  syncEffort();
  root.replaceChildren(element);
  window.scrollTo(0, 0);
}
