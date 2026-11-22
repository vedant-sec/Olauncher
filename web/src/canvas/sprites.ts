const SPRITE_SIZE = 128;
const hueCache = new Map<number, HTMLCanvasElement>();
let whiteSprite: HTMLCanvasElement | null = null;

function makeSprite(colorStops: Array<[number, string]>): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext('2d')!;
  const c = SPRITE_SIZE / 2;
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
  for (const [stop, color] of colorStops) gradient.addColorStop(stop, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return canvas;
}

/** Pre-rendered glow halo, cached per goal hue. */
export function getGlowSprite(hue: number): HTMLCanvasElement {
  const key = ((Math.round(hue) % 360) + 360) % 360;
  const cached = hueCache.get(key);
  if (cached) return cached;

  const sprite = makeSprite([
    [0, `hsla(${key}, 95%, 78%, 0.9)`],
    [0.18, `hsla(${key}, 90%, 68%, 0.45)`],
    [0.45, `hsla(${key}, 85%, 62%, 0.12)`],
    [1, `hsla(${key}, 85%, 60%, 0)`],
  ]);
  hueCache.set(key, sprite);
  return sprite;
}

/** White halo used for pulses, milestones and the center node. */
export function getWhiteGlowSprite(): HTMLCanvasElement {
  if (whiteSprite) return whiteSprite;
  whiteSprite = makeSprite([
    [0, 'rgba(255, 255, 255, 0.95)'],
    [0.2, 'rgba(235, 240, 255, 0.42)'],
    [0.5, 'rgba(210, 220, 255, 0.1)'],
    [1, 'rgba(200, 210, 255, 0)'],
  ]);
  return whiteSprite;
}
