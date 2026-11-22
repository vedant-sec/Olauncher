import { Effect, Layout, Viewport } from '../types';
import { getGlowSprite, getWhiteGlowSprite } from './sprites';

export interface RenderState {
  layout: Layout;
  viewport: Viewport;
  thenDate: number;
  nowCutoff: number | null;
  addedByGoal: Map<string, number>;
  hoveredActionId: string | null;
}

export interface RendererOptions {
  debug?: boolean;
  maxDpr?: number;
  staticCache?: boolean;
}

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function dotRadius(action: { isMilestone: boolean; minutes: number }): number {
  return action.isMilestone ? 4.6 : Math.max(2, 1.2 + Math.sqrt(Math.max(0, action.minutes)) * 0.28);
}

interface VisibleAction {
  entry: Layout['actions'][number];
  bright: boolean;
  r: number;
}

interface DebugStats {
  fps: number;
  frameMs: number;
  idleFrames: number;
  draws: number;
}

export function createRenderer(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
  const ctx = canvas.getContext('2d')!;
  const effects: Effect[] = [];
  const debug = !!options.debug;
  const maxDpr = options.maxDpr ?? 2.5;
  const useStaticCache = !!options.staticCache;

  let state: RenderState = {
    layout: { goals: [], actions: [], goalById: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    thenDate: 0,
    nowCutoff: null,
    addedByGoal: new Map(),
    hoveredActionId: null,
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  let dirty = true;
  let raf = 0;
  let background: HTMLCanvasElement | null = null;

  // Static cache: faint links/nodes + goal nodes/ring rendered in screen space.
  let staticCache: HTMLCanvasElement | null = null;
  let staticCacheDirty = true;
  let cacheViewport: Viewport = { x: 0, y: 0, zoom: 1 };
  let interacting = false;
  let interactionEndTimer = 0;

  // Debug
  let lastFrameAt = 0;
  let frameMs = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsLast = 0;
  let idleFrames = 0;
  let drawCount = 0;
  let lastInputAt = 0;
  let debugEl: HTMLDivElement | null = null;
  const visiblePool: VisibleAction[] = [];
  const faintLinkGroups = new Map<string, { style: string; width: number; items: VisibleAction[] }>();
  const brightLinkGroups = new Map<string, { style: string; width: number; items: VisibleAction[] }>();
  const faintNodeGroups = new Map<number, VisibleAction[]>();

  if (debug) {
    debugEl = document.createElement('div');
    debugEl.className = 'debug-overlay';
    canvas.parentElement?.appendChild(debugEl);
  }

  function markInput(): void {
    lastInputAt = performance.now();
  }

  function requestRender(): void {
    dirty = true;
    if (!raf) raf = requestAnimationFrame(renderFrame);
  }

  function renderFrame(now: number): void {
    raf = 0;
    if (dirty || effects.length > 0) {
      if (lastFrameAt) frameMs = now - lastFrameAt;
      lastFrameAt = now;
      draw(now);
      drawCount++;
      if (effects.length === 0 && now - lastInputAt > 250) idleFrames++;
      dirty = false;

      if (debug) {
        fpsFrames++;
        if (!fpsLast) fpsLast = now;
        if (now - fpsLast >= 500) {
          fps = Math.round((fpsFrames * 1000) / (now - fpsLast));
          fpsFrames = 0;
          fpsLast = now;
          updateDebugOverlay();
        }
      }
    }
    if (dirty || effects.length > 0) raf = requestAnimationFrame(renderFrame);
  }

  function updateDebugOverlay(): void {
    if (!debugEl) return;
    const stats: DebugStats = { fps, frameMs, idleFrames, draws: drawCount };
    debugEl.textContent =
      `fps ${stats.fps}\n` +
      `ms ${stats.frameMs.toFixed(1)}\n` +
      `idle ${stats.idleFrames}\n` +
      `draws ${stats.draws}\n` +
      `dpr ${dpr.toFixed(2)}`;
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = clamp(window.devicePixelRatio || 1, 1, maxDpr);
    const pixelW = Math.round(width * dpr);
    const pixelH = Math.round(height * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }
    background = buildBackground();
    staticCacheDirty = true;
    requestRender();
  }

  function buildBackground(): HTMLCanvasElement {
    const bg = document.createElement('canvas');
    bg.width = Math.round(width * dpr);
    bg.height = Math.round(height * dpr);
    const bctx = bg.getContext('2d')!;
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const radial = bctx.createRadialGradient(width * 0.5, height * 0.44, 0, width * 0.5, height * 0.44, Math.max(width, height) * 0.72);
    radial.addColorStop(0, '#151a2b');
    radial.addColorStop(0.5, '#0c101b');
    radial.addColorStop(1, '#06070c');
    bctx.fillStyle = radial;
    bctx.fillRect(0, 0, width, height);

    const vignette = bctx.createRadialGradient(width * 0.5, height * 0.48, Math.min(width, height) * 0.32, width * 0.5, height * 0.48, Math.max(width, height) * 0.78);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    bctx.fillStyle = vignette;
    bctx.fillRect(0, 0, width, height);
    return bg;
  }

  function ensureStaticCache(): HTMLCanvasElement {
    if (!staticCache || staticCache.width !== canvas.width || staticCache.height !== canvas.height) {
      staticCache = document.createElement('canvas');
      staticCache.width = canvas.width;
      staticCache.height = canvas.height;
      staticCacheDirty = true;
    }
    return staticCache;
  }

  function rebuildStaticCache(): void {
    const sc = ensureStaticCache();
    const sctx = sc.getContext('2d')!;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, sc.width, sc.height);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { layout, viewport: vp, thenDate, nowCutoff } = state;
    const margin = 90;
    const visible = collectVisible(layout, vp, thenDate, nowCutoff, margin);

    sctx.save();
    sctx.translate(vp.x, vp.y);
    sctx.scale(vp.zoom, vp.zoom);

    // Goal ring guide
    sctx.beginPath();
    sctx.arc(0, 0, 230, 0, Math.PI * 2);
    sctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    sctx.lineWidth = 1 / vp.zoom;
    sctx.stroke();

    drawFaintLinks(sctx, visible, vp);
    drawFaintNodes(sctx, visible, vp);
    drawGoalNodes(sctx, layout, vp);
    drawCenterNode(sctx, vp);

    sctx.restore();

    cacheViewport = { ...vp };
    staticCacheDirty = false;
  }

  function collectVisible(layout: Layout, vp: Viewport, thenDate: number, nowCutoff: number | null, margin: number): VisibleAction[] {
    let n = 0;
    const actions = layout.actions;
    for (let i = 0; i < actions.length; i++) {
      const entry = actions[i];
      if (nowCutoff !== null && entry.action.timestamp > nowCutoff) continue;
      const sx = vp.x + entry.x * vp.zoom;
      const sy = vp.y + entry.y * vp.zoom;
      const gx = vp.x + entry.goalX * vp.zoom;
      const gy = vp.y + entry.goalY * vp.zoom;
      if (
        (sx <= -margin || sx >= width + margin || sy <= -margin || sy >= height + margin) &&
        (gx <= -margin || gx >= width + margin || gy <= -margin || gy >= height + margin)
      ) continue;
      const r = dotRadius(entry.action);
      const bright = entry.action.timestamp >= thenDate;
      if (!bright && r * vp.zoom < 0.8) continue;
      let slot = visiblePool[n];
      if (!slot) {
        slot = { entry, bright, r };
        visiblePool[n] = slot;
      } else {
        slot.entry = entry;
        slot.bright = bright;
        slot.r = r;
      }
      n++;
    }
    visiblePool.length = n;
    return visiblePool;
  }

  function drawFaintLinks(target: CanvasRenderingContext2D, visible: VisibleAction[], vp: Viewport): void {
    faintLinkGroups.clear();
    const straight = vp.zoom < 0.35;
    const skipFaint = vp.zoom < 0.18;
    if (skipFaint) return;

    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      if (item.bright) continue;
      const hue = item.entry.hue;
      const key = String(hue);
      let g = faintLinkGroups.get(key);
      if (!g) {
        g = { style: `hsla(${hue}, 55%, 65%, 0.1)`, width: 0.7 / vp.zoom, items: [] };
        faintLinkGroups.set(key, g);
      }
      g.items.push(item);
    }

    for (const g of faintLinkGroups.values()) {
      target.beginPath();
      target.strokeStyle = g.style;
      target.lineWidth = g.width;
      for (const item of g.items) {
        const a = item.entry;
        target.moveTo(a.x, a.y);
        if (straight) target.lineTo(a.goalX, a.goalY);
        else target.quadraticCurveTo(a.ctrlX, a.ctrlY, a.goalX, a.goalY);
      }
      target.stroke();
    }
  }

  function drawBrightLinks(target: CanvasRenderingContext2D, visible: VisibleAction[], vp: Viewport): void {
    brightLinkGroups.clear();
    const straight = vp.zoom < 0.35;

    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      if (!item.bright) continue;
      const hue = item.entry.hue;
      const key = String(hue);
      let g = brightLinkGroups.get(key);
      if (!g) {
        g = { style: `hsla(${hue}, 80%, 72%, 0.34)`, width: 1.05 / vp.zoom, items: [] };
        brightLinkGroups.set(key, g);
      }
      g.items.push(item);
    }

    for (const g of brightLinkGroups.values()) {
      target.beginPath();
      target.strokeStyle = g.style;
      target.lineWidth = g.width;
      for (const item of g.items) {
        const a = item.entry;
        target.moveTo(a.x, a.y);
        if (straight) target.lineTo(a.goalX, a.goalY);
        else target.quadraticCurveTo(a.ctrlX, a.ctrlY, a.goalX, a.goalY);
      }
      target.stroke();
    }
  }

  function drawFaintNodes(target: CanvasRenderingContext2D, visible: VisibleAction[], vp: Viewport): void {
    faintNodeGroups.clear();
    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      if (item.bright) continue;
      const hue = item.entry.hue;
      let arr = faintNodeGroups.get(hue);
      if (!arr) { arr = []; faintNodeGroups.set(hue, arr); }
      arr.push(item);
    }

    for (const [hue, items] of faintNodeGroups.entries()) {
      // Plain circles
      target.beginPath();
      target.fillStyle = `hsla(${hue}, 48%, 68%, 0.26)`;
      let hasPlain = false;
      for (const item of items) {
        if (item.entry.action.isMilestone) continue;
        hasPlain = true;
        const a = item.entry;
        target.moveTo(a.x + item.r, a.y);
        target.arc(a.x, a.y, item.r, 0, Math.PI * 2);
      }
      if (hasPlain) target.fill();

      // Milestone faint: fill + stroke
      for (const item of items) {
        if (!item.entry.action.isMilestone) continue;
        const a = item.entry;
        target.beginPath();
        target.arc(a.x, a.y, item.r, 0, Math.PI * 2);
        target.fillStyle = `hsla(${hue}, 55%, 68%, 0.22)`;
        target.fill();
        target.strokeStyle = 'rgba(255, 255, 255, 0.38)';
        target.lineWidth = 1.1 / vp.zoom;
        target.stroke();
      }
    }
  }

  function drawBrightNodes(target: CanvasRenderingContext2D, visible: VisibleAction[], vp: Viewport): void {
    for (const item of visible) {
      if (!item.bright) continue;
      const a = item.entry;
      const r = item.r;
      const glow = getGlowSprite(a.hue);
      const glowSize = Math.max(24, r * 9);
      target.globalAlpha = a.action.isMilestone ? 0.9 : 0.75;
      target.drawImage(glow, a.x - glowSize / 2, a.y - glowSize / 2, glowSize, glowSize);
      target.globalAlpha = 1;

      target.beginPath();
      target.arc(a.x, a.y, r, 0, Math.PI * 2);
      target.fillStyle = `hsl(${a.hue}, 85%, 72%)`;
      target.fill();

      if (a.action.isMilestone) {
        target.beginPath();
        target.arc(a.x, a.y, r + 1.4, 0, Math.PI * 2);
        target.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        target.lineWidth = 1.4 / vp.zoom;
        target.stroke();
      }

      if (state.hoveredActionId === a.action.id) {
        target.beginPath();
        target.arc(a.x, a.y, r + 2.8 / vp.zoom + 2, 0, Math.PI * 2);
        target.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        target.lineWidth = 1.2 / vp.zoom;
        target.stroke();
      }
    }
  }

  function drawGoalNodes(target: CanvasRenderingContext2D, layout: Layout, vp: Viewport): void {
    for (const goal of layout.goals) {
      target.beginPath();
      target.arc(goal.x, goal.y, goal.radius, 0, Math.PI * 2);
      target.fillStyle = `hsl(${goal.goal.color}, 52%, 46%)`;
      target.fill();
      target.beginPath();
      target.arc(goal.x, goal.y, goal.radius, 0, Math.PI * 2);
      target.strokeStyle = `hsla(${goal.goal.color}, 85%, 78%, 0.72)`;
      target.lineWidth = 1.3 / vp.zoom;
      target.stroke();

      target.beginPath();
      target.arc(goal.x, goal.y, Math.max(1.2, goal.radius * 0.2), 0, Math.PI * 2);
      target.fillStyle = 'rgba(255, 255, 255, 0.65)';
      target.fill();
    }
  }

  function drawCenterNode(target: CanvasRenderingContext2D, vp: Viewport): void {
    target.beginPath();
    target.arc(0, 0, 5, 0, Math.PI * 2);
    target.fillStyle = 'rgba(255, 255, 255, 0.95)';
    target.fill();
    target.beginPath();
    target.arc(0, 0, 9.5, 0, Math.PI * 2);
    target.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    target.lineWidth = 1 / vp.zoom;
    target.stroke();
  }

  function drawLabels(target: CanvasRenderingContext2D, layout: Layout, vp: Viewport): void {
    for (const goal of layout.goals) {
      const gx = vp.x + goal.x * vp.zoom;
      const gy = vp.y + goal.y * vp.zoom;
      if (gx < -140 || gx > width + 140 || gy < -80 || gy > height + 80) continue;

      const offset = goal.outerRadius * vp.zoom + 15;
      const lx = gx + Math.cos(goal.angle) * offset;
      const ly = gy + Math.sin(goal.angle) * offset;
      const added = state.addedByGoal.get(goal.goal.id) ?? 0;

      target.save();
      const fontSize = width < 560 ? 12 : 13;
      target.font = `600 ${fontSize}px ${FONT_STACK}`;
      target.textBaseline = 'middle';
      target.shadowColor = 'rgba(0, 0, 0, 0.9)';
      target.shadowBlur = 8;

      const nameText = goal.goal.name;
      const addedText = added > 0 ? `+${added}` : '';
      const nameWidth = target.measureText(nameText).width;
      const gap = added > 0 ? 6 : 0;
      const total = nameWidth + gap + (added > 0 ? target.measureText(addedText).width : 0);
      const startX = clamp(lx - total / 2, 10, Math.max(10, width - 10 - total));
      const labelY = clamp(ly, 14, height - 14);

      const padX = 5;
      const padY = 4;
      target.shadowBlur = 0;
      target.fillStyle = 'rgba(7, 9, 14, 0.5)';
      target.beginPath();
      target.roundRect(startX - padX, labelY - fontSize * 0.62 - padY, total + padX * 2, fontSize * 1.24 + padY * 2, 7);
      target.fill();
      target.shadowBlur = 8;
      target.textAlign = 'left';
      target.fillStyle = added > 0 ? 'rgba(238, 242, 250, 0.95)' : 'rgba(190, 198, 214, 0.62)';
      target.fillText(nameText, startX, labelY);
      if (added > 0) {
        target.fillStyle = 'rgba(255, 255, 255, 0.98)';
        target.fillText(addedText, startX + nameWidth + gap, labelY);
      }
      target.restore();
    }

    const youX = vp.x;
    const youY = vp.y + 16;
    target.save();
    target.font = `600 11px ${FONT_STACK}`;
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    target.shadowColor = 'rgba(0, 0, 0, 0.9)';
    target.shadowBlur = 6;
    target.fillStyle = 'rgba(220, 226, 240, 0.6)';
    target.fillText('You', youX, youY);
    target.restore();
  }

  function drawEffects(target: CanvasRenderingContext2D, vp: Viewport, now: number): void {
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      const p = clamp((now - effect.start) / effect.duration, 0, 1);

      if (effect.kind === 'pulse') {
        if (p < 0.7) {
          const t = easeInOutCubic(p / 0.7);
          const x = (1 - t) * (1 - t) * effect.x0 + 2 * (1 - t) * t * effect.cx + t * t * effect.x1;
          const y = (1 - t) * (1 - t) * effect.y0 + 2 * (1 - t) * t * effect.cy + t * t * effect.y1;
          const glow = getWhiteGlowSprite();
          target.globalAlpha = 0.9;
          target.drawImage(glow, x - 17, y - 17, 34, 34);
          target.globalAlpha = 1;
          target.beginPath();
          target.arc(x, y, 2.2, 0, Math.PI * 2);
          target.fillStyle = '#fff';
          target.fill();
        } else {
          const q = (p - 0.7) / 0.3;
          const alpha = Math.sin(q * Math.PI) * 0.75;
          const glow = getGlowSprite(effect.hue);
          target.globalAlpha = alpha;
          target.drawImage(glow, effect.x1 - 85, effect.y1 - 85, 170, 170);
          target.globalAlpha = 1;
        }
      } else {
        const radius = 8 + easeInOutCubic(p) * 48;
        const alpha = (1 - p) * 0.9;
        target.beginPath();
        target.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
        target.strokeStyle = `hsla(${effect.hue}, 90%, 82%, ${alpha})`;
        target.lineWidth = 2 / vp.zoom;
        target.stroke();
        target.beginPath();
        target.arc(effect.x, effect.y, radius * 0.72, 0, Math.PI * 2);
        target.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.55})`;
        target.lineWidth = 1 / vp.zoom;
        target.stroke();
      }

      if (p >= 1) effects.splice(i, 1);
    }
  }

  function draw(now: number): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (background) ctx.drawImage(background, 0, 0, width, height);

    const { layout, viewport: vp, thenDate, nowCutoff } = state;
    const margin = 90;
    const visible = collectVisible(layout, vp, thenDate, nowCutoff, margin);

    if (useStaticCache) {
      // Rebuild static cache when data/time changed, or after interaction ends at final zoom.
      const viewportChanged =
        vp.x !== cacheViewport.x || vp.y !== cacheViewport.y || vp.zoom !== cacheViewport.zoom;
      if (staticCacheDirty || (!interacting && viewportChanged)) {
        rebuildStaticCache();
      }

      if (staticCache) {
        if (interacting && (vp.x !== cacheViewport.x || vp.y !== cacheViewport.y || vp.zoom !== cacheViewport.zoom)) {
          // Draw cached static layer transformed to current viewport.
          const scale = vp.zoom / cacheViewport.zoom;
          const dx = vp.x - cacheViewport.x * scale;
          const dy = vp.y - cacheViewport.y * scale;
          ctx.save();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.translate(dx, dy);
          ctx.scale(scale, scale);
          ctx.drawImage(staticCache, 0, 0, width, height);
          ctx.restore();
        } else {
          ctx.drawImage(staticCache, 0, 0, width, height);
        }
      }

      // Bright items and effects are always live.
      ctx.save();
      ctx.translate(vp.x, vp.y);
      ctx.scale(vp.zoom, vp.zoom);
      drawBrightLinks(ctx, visible, vp);
      drawBrightNodes(ctx, visible, vp);
      drawEffects(ctx, vp, now);
      ctx.restore();
      drawLabels(ctx, layout, vp);
      return;
    }

    // Non-cached path (normal mode / default): full draw, but with batching and LOD.
    ctx.save();
    ctx.translate(vp.x, vp.y);
    ctx.scale(vp.zoom, vp.zoom);

    ctx.beginPath();
    ctx.arc(0, 0, 230, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1 / vp.zoom;
    ctx.stroke();

    drawFaintLinks(ctx, visible, vp);
    drawBrightLinks(ctx, visible, vp);
    drawFaintNodes(ctx, visible, vp);
    drawBrightNodes(ctx, visible, vp);
    drawGoalNodes(ctx, layout, vp);
    drawCenterNode(ctx, vp);
    drawEffects(ctx, vp, now);

    ctx.restore();
    drawLabels(ctx, layout, vp);
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      requestRender();
    }
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);
  document.addEventListener('visibilitychange', onVisibilityChange);
  resize();
  requestRender();

  return {
    update(partial: Partial<RenderState>): void {
      const prev = state;
      state = { ...state, ...partial };
      if (
        partial.layout !== undefined ||
        partial.thenDate !== undefined ||
        partial.nowCutoff !== undefined ||
        partial.addedByGoal !== undefined
      ) {
        staticCacheDirty = true;
      }
      // Hover-only changes don't invalidate static cache
      if (
        partial.hoveredActionId !== undefined &&
        partial.layout === undefined &&
        partial.thenDate === undefined &&
        partial.nowCutoff === undefined &&
        partial.addedByGoal === undefined &&
        partial.viewport === undefined
      ) {
        // hover ring is drawn in bright nodes (live) - ok
      }
      if (partial.viewport !== undefined && partial.viewport !== prev.viewport) {
        markInput();
      }
      requestRender();
    },
    addEffect(effect: Effect): void {
      effects.push(effect);
      requestRender();
    },
    invalidate(): void {
      requestRender();
    },
    setInteracting(value: boolean): void {
      if (interacting === value) return;
      interacting = value;
      if (value) {
        markInput();
        window.clearTimeout(interactionEndTimer);
      } else {
        // Rebuild cache at final zoom level after interaction stops.
        staticCacheDirty = staticCacheDirty || useStaticCache;
        window.clearTimeout(interactionEndTimer);
        interactionEndTimer = window.setTimeout(() => {
          staticCacheDirty = true;
          requestRender();
        }, 120);
      }
      requestRender();
    },
    resize,
    getSize(): { width: number; height: number } {
      return { width, height };
    },
    destroy(): void {
      cancelAnimationFrame(raf);
      raf = 0;
      window.clearTimeout(interactionEndTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      observer.disconnect();
      debugEl?.remove();
      debugEl = null;
      staticCache = null;
      background = null;
    },
  };
}

export type Renderer = ReturnType<typeof createRenderer>;