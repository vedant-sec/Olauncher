import { Viewport } from '../types';

interface PointerPoint {
  x: number;
  y: number;
}

export interface InteractionOptions {
  canvas: HTMLCanvasElement;
  getViewport: () => Viewport;
  setViewport: (viewport: Viewport) => void;
  onHover: (clientX: number, clientY: number) => void;
  onTap: (clientX: number, clientY: number) => void;
  onLeave: () => void;
  onGestureStart: () => void;
  onResetView: () => void;
  onInteractionChange?: (active: boolean) => void;
  onLongPress?: (clientX: number, clientY: number) => void;
}

const MIN_ZOOM = 0.22;
const MAX_ZOOM = 4.5;

export function attachInteraction(options: InteractionOptions): () => void {
  const { canvas, getViewport, setViewport } = options;
  const pointers = new Map<number, PointerPoint>();

  let dragStart: { x: number; y: number; vpX: number; vpY: number; moved: boolean } | null = null;
  let pinch: { dist: number; midX: number; midY: number; zoom: number; vpX: number; vpY: number } | null = null;
  let moveRaf = 0;
  let pendingMove: PointerEvent | null = null;
  let activeGesture = false;
  let wheelEndTimer = 0;
  let longPressTimer = 0;
  let longPressed = false;

  function setGestureActive(active: boolean): void {
    if (activeGesture === active) return;
    activeGesture = active;
    options.onInteractionChange?.(active);
  }

  function cancelLongPress(): void {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = 0;
    }
  }

  function beginPinch(): void {
    const pts = [...pointers.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const vp = getViewport();
    pinch = {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      zoom: vp.zoom,
      vpX: vp.x,
      vpY: vp.y,
    };
    dragStart = null;
    cancelLongPress();
    setGestureActive(true);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    options.onGestureStart();

    if (pointers.size === 1) {
      const vp = getViewport();
      dragStart = { x: event.clientX, y: event.clientY, vpX: vp.x, vpY: vp.y, moved: false };
      pinch = null;
      longPressed = false;
      cancelLongPress();
      if (options.onLongPress) {
        const x = event.clientX;
        const y = event.clientY;
        longPressTimer = window.setTimeout(() => {
          longPressTimer = 0;
          if (pointers.size === 1 && dragStart && !dragStart.moved) {
            longPressed = true;
            dragStart.moved = true; // prevent tap/pan after long press
            options.onLongPress?.(x, y);
          }
        }, 500);
      }
    } else if (pointers.size === 2) {
      cancelLongPress();
      beginPinch();
    } else {
      cancelLongPress();
    }
  }

  function processPointerMove(event: PointerEvent): void {
    const point = pointers.get(event.pointerId);

    if (!point) {
      if (event.pointerType === 'mouse') options.onHover(event.clientX, event.clientY);
      return;
    }

    point.x = event.clientX;
    point.y = event.clientY;

    if (pointers.size >= 2 && pinch) {
      const pts = [...pointers.values()];
      const [a, b] = pts;
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.zoom * (dist / pinch.dist)));
      const worldX = (pinch.midX - pinch.vpX) / pinch.zoom;
      const worldY = (pinch.midY - pinch.vpY) / pinch.zoom;
      setViewport({ x: midX - worldX * zoom, y: midY - worldY * zoom, zoom });
      return;
    }

    if (!dragStart) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    if (!dragStart.moved && Math.hypot(dx, dy) > 5) {
      dragStart.moved = true;
      cancelLongPress();
      setGestureActive(true);
    }
    if (dragStart.moved) {
      setViewport({ x: dragStart.vpX + dx, y: dragStart.vpY + dy, zoom: getViewport().zoom });
    }
  }

  function onPointerMove(event: PointerEvent): void {
    const point = pointers.get(event.pointerId);
    if (!point) {
      if (event.pointerType === 'mouse') options.onHover(event.clientX, event.clientY);
      return;
    }
    point.x = event.clientX;
    point.y = event.clientY;
    pendingMove = event;
    if (!moveRaf) {
      moveRaf = requestAnimationFrame(() => {
        moveRaf = 0;
        const ev = pendingMove;
        pendingMove = null;
        if (ev) processPointerMove(ev);
      });
    }
  }

  function onPointerUp(event: PointerEvent): void {
    cancelLongPress();
    const wasSingle = pointers.size === 1;
    const dragged = dragStart?.moved ?? false;
    const wasLongPressed = longPressed;
    longPressed = false;
    pointers.delete(event.pointerId);

    if (wasSingle) {
      if (!dragged && !wasLongPressed) options.onTap(event.clientX, event.clientY);
      dragStart = null;
      pinch = null;
      setGestureActive(false);
      return;
    }

    if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      const vp = getViewport();
      dragStart = { x: remaining.x, y: remaining.y, vpX: vp.x, vpY: vp.y, moved: true };
      pinch = null;
      setGestureActive(true);
    } else if (pointers.size === 0) {
      dragStart = null;
      pinch = null;
      setGestureActive(false);
    }
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    options.onGestureStart();
    cancelLongPress();
    setGestureActive(true);
    window.clearTimeout(wheelEndTimer);
    const vp = getViewport();
    const factor = Math.exp(-event.deltaY * 0.0015);
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * factor));
    const ratio = zoom / vp.zoom;
    setViewport({
      x: event.clientX - (event.clientX - vp.x) * ratio,
      y: event.clientY - (event.clientY - vp.y) * ratio,
      zoom,
    });
    wheelEndTimer = window.setTimeout(() => setGestureActive(false), 140);
  }

  function onPointerLeave(event: PointerEvent): void {
    if (!pointers.has(event.pointerId) && event.pointerType === 'mouse') options.onLeave();
  }

  function onDoubleClick(): void {
    options.onResetView();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);

  return () => {
    if (moveRaf) cancelAnimationFrame(moveRaf);
    window.clearTimeout(wheelEndTimer);
    cancelLongPress();
    setGestureActive(false);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', onDoubleClick);
  };
}
