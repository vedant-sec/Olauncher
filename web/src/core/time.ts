import { PresetId } from '../types';

export const DAY = 86_400_000;

export function subtractMonths(ts: number, months: number): number {
  const d = new Date(ts);
  const targetMonth = d.getMonth() - months;
  const target = new Date(d.getTime());
  target.setDate(1);
  target.setMonth(targetMonth);
  // Clamp day to the last day of the target month
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return target.getTime();
}

export function presetThenDate(preset: PresetId, dataStart: number, now: number): number {
  switch (preset) {
    case '1w':
      return now - 7 * DAY;
    case '1m':
      return subtractMonths(now, 1);
    case '3m':
      return subtractMonths(now, 3);
    case '6m':
      return subtractMonths(now, 6);
    case 'all':
      return dataStart;
  }
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatMonth(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours === 0) return '0 h';
  if (hours < 10) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours)} h`;
}

export function formatMinutes(minutes: number): string {
  if (minutes === 0) return 'milestone';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function toDateInputValue(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function toMonthInputValue(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Noon on the selected local day, except today which uses the current time. */
export function dateInputToTimestamp(value: string, now: number): number {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return now;
  const picked = new Date(y, m - 1, d, 12, 0, 0).getTime();
  if (toDateInputValue(now) === value) return now;
  return Math.min(picked, now);
}

export function monthInputToTimestamp(value: string, now: number): number {
  const [y, m] = value.split('-').map(Number);
  if (!y || !m) return now;
  const picked = new Date(y, m - 1, 15, 12, 0, 0).getTime();
  return Math.min(picked, now);
}
