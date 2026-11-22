const ONBOARDED_KEY = 'pm:onboarded';
const LAST_GOAL_KEY = 'pm:last-goal';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable; the app still works for this session.
  }
}

export function hasOnboarded(): boolean {
  return read(ONBOARDED_KEY) === '1';
}

export function setOnboarded(): void {
  write(ONBOARDED_KEY, '1');
}

export function clearOnboarded(): void {
  write(ONBOARDED_KEY, null);
}

export function getLastGoalId(): string | null {
  return read(LAST_GOAL_KEY);
}

export function setLastGoalId(id: string): void {
  write(LAST_GOAL_KEY, id);
}

export function uid(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
