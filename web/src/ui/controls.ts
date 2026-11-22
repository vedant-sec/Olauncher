import { PresetId } from '../types';
import { formatDate, formatShortDate } from '../core/time';

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: '1w', label: '1W' },
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: 'all', label: 'All' },
];

export interface ControlsOptions {
  onPreset: (preset: PresetId) => void;
  onSlider: (timestamp: number) => void;
  onPlay: () => void;
}

export interface Controls {
  element: HTMLElement;
  setThenDate: (timestamp: number, preset: PresetId | null) => void;
  setRange: (min: number, max: number) => void;
  setReplayActive: (active: boolean) => void;
}

export function createControls(options: ControlsOptions): Controls {
  const element = document.createElement('div');
  element.className = 'dock';

  const presetButtons = PRESETS.map(
    (preset) => `<button type="button" class="preset" data-preset="${preset.id}">${preset.label}</button>`,
  ).join('');

  element.innerHTML = `
    <div class="dock-top">
      <div class="presets" role="group" aria-label="Time range presets">${presetButtons}</div>
      <button type="button" class="play-btn" aria-pressed="false"><span class="play-icon">▶</span><span class="play-text">Play growth</span></button>
    </div>
    <label class="range-row">
      <span class="range-label">Since</span>
      <input type="range" class="then-slider" aria-label="Compare against date" />
      <span class="range-date"></span>
    </label>
  `;

  const presetsEl = element.querySelector<HTMLElement>('.presets')!;
  const slider = element.querySelector<HTMLInputElement>('.then-slider')!;
  const dateEl = element.querySelector<HTMLElement>('.range-date')!;
  const playBtn = element.querySelector<HTMLButtonElement>('.play-btn')!;
  const playIcon = element.querySelector<HTMLElement>('.play-icon')!;
  const playText = element.querySelector<HTMLElement>('.play-text')!;

  function highlight(preset: PresetId | null): void {
    presetsEl.querySelectorAll<HTMLButtonElement>('.preset').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.preset === preset);
    });
  }

  presetsEl.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('.preset');
    if (!btn) return;
    options.onPreset(btn.dataset.preset as PresetId);
  });

  slider.addEventListener('input', () => {
    options.onSlider(Number(slider.value));
  });

  playBtn.addEventListener('click', () => options.onPlay());

  return {
    element,
    setThenDate(timestamp: number, preset: PresetId | null): void {
      const clamped = Math.min(Number(slider.max), Math.max(Number(slider.min), timestamp));
      slider.value = String(clamped);
      dateEl.textContent = formatShortDate(clamped);
      dateEl.title = formatDate(clamped);
      highlight(preset);
    },
    setRange(min: number, max: number): void {
      slider.min = String(Math.floor(min));
      slider.max = String(Math.floor(max));
      slider.step = String(Math.max(60_000, Math.floor((max - min) / 1200)));
    },
    setReplayActive(active: boolean): void {
      element.classList.toggle('replaying', active);
      playBtn.classList.toggle('active', active);
      playBtn.setAttribute('aria-pressed', String(active));
      playIcon.textContent = active ? '■' : '▶';
      playText.textContent = active ? 'Stop' : 'Play growth';
      slider.disabled = active;
    },
  };
}
