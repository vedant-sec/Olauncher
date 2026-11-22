// Status bar: date, day, time, battery % — top-left. Used in launcher mode.
interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener: (type: string, cb: () => void) => void;
}

let bar: HTMLElement | null = null;
let timer = 0;
let battery: BatteryLike | null = null;

function formatDatePart(d: Date): string {
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${month}`;
}

function formatDay(d: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()];
}

function formatTime(d: Date): string {
  const hh = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${mm} ${ampm}`;
}

function update(): void {
  if (!bar) return;
  const d = new Date();
  const time = formatTime(d);
  const batteryPart = battery ? ` · ${Math.round(battery.level * 100)}%` : '';
  bar.innerHTML = `<div class="pm-time">${time}</div><div class="pm-meta">${formatDay(d)}, ${formatDatePart(d)}${batteryPart}</div>`;
}

export function startStatusBar(): void {
  stopStatusBar();
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'pm-status-bar';
    bar.setAttribute('aria-live', 'off');
    bar.style.position = 'fixed';
    bar.style.top = 'calc(var(--safe-top) + 12px)';
    bar.style.left = 'calc(var(--safe-left) + 16px)';
    bar.style.color = 'rgba(255,255,255,0.95)';
    bar.style.fontSize = '14px';
    bar.style.fontWeight = '600';
    bar.style.fontVariantNumeric = 'tabular-nums';
    bar.style.letterSpacing = '0.02em';
    bar.style.whiteSpace = 'nowrap';
    bar.style.pointerEvents = 'none';
    bar.style.zIndex = '9999';
    document.body.appendChild(bar);
  }
  const nav = navigator as unknown as { getBattery?: () => Promise<BatteryLike> };
  if (nav.getBattery) {
    void nav.getBattery().then((b) => {
      if (!bar) return;
      battery = b;
      const onChange = () => update();
      b.addEventListener('levelchange', onChange);
      b.addEventListener('chargingchange', onChange);
      b.addEventListener('dischargingchange', onChange);
    });
  }
  timer = window.setInterval(update, 1000);
  update();
}

export function stopStatusBar(): void {
  if (timer) {
    window.clearInterval(timer);
    timer = 0;
  }
  battery = null;
  bar?.remove();
  bar = null;
}
