export interface Goal {
  id: string;
  name: string;
  color: number; // HSL Hue (0 - 360)
  createdAt: number; // Timestamp (ms)
  slotIndex: number; // Deterministic position slot on the ring
}

export interface Action {
  id: string;
  goalId: string;
  text: string;
  minutes: number; // Effort in minutes (0 for milestone)
  isMilestone: boolean;
  timestamp: number; // Timestamp (ms), can be past date
  note?: string;
  isDemo?: boolean;
}

export interface AppData {
  goals: Goal[];
  actions: Action[];
}

export interface LayoutGoal {
  goal: Goal;
  angle: number;
  x: number;
  y: number;
  radius: number;
  outerRadius: number;
  totalMinutes: number;
  actionCount: number;
}

export interface LayoutAction {
  action: Action;
  index: number;
  x: number;
  y: number;
  goalX: number;
  goalY: number;
  ctrlX: number;
  ctrlY: number;
  hue: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Layout {
  goals: LayoutGoal[];
  actions: LayoutAction[];
  goalById: Map<string, LayoutGoal>;
  bounds: Bounds;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export type Effect =
  | {
      kind: 'pulse';
      start: number;
      duration: number;
      x0: number;
      y0: number;
      cx: number;
      cy: number;
      x1: number;
      y1: number;
      hue: number;
    }
  | {
      kind: 'ring';
      start: number;
      duration: number;
      x: number;
      y: number;
      hue: number;
    };

export type PresetId = '1w' | '1m' | '3m' | '6m' | 'all';
