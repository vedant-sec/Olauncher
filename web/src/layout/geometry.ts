import { AppData, Layout, LayoutAction, LayoutGoal } from '../types';

export const GOAL_RING_RADIUS = 230;
const GOLDEN_ANGLE = 2.39996;
const GOAL_ANGLE_START = -Math.PI / 2;
const LABEL_MARGIN = 84;

function goalRadiusForMinutes(totalMinutes: number): number {
  const hours = totalMinutes / 60;
  return Math.min(26, 9 + Math.sqrt(hours) * 1.8);
}

/** World radius of a goal's outermost action, used to keep labels clear of dots. */
export function actionSpiralRadius(goalRadius: number, index: number): number {
  return goalRadius + 4 + 6 * Math.sqrt(Math.max(0, index));
}

/**
 * Slot angles come from a fixed bit-reversal sequence (van der Corput).
 * It spreads any prefix of slots evenly around the ring, and a new goal
 * always gets the next slot, so existing goals never move.
 */
function slotFraction(slot: number): number {
  let n = Math.max(0, Math.floor(slot));
  let result = 0;
  let denominator = 1;
  while (n > 0) {
    denominator *= 2;
    result += (n % 2) / denominator;
    n = Math.floor(n / 2);
  }
  return result;
}

export function buildLayout(data: AppData): Layout {
  const sortedGoals = [...data.goals].sort((a, b) => a.slotIndex - b.slotIndex);

  const actionTotals = new Map<string, number>();
  for (const action of data.actions) {
    actionTotals.set(action.goalId, (actionTotals.get(action.goalId) ?? 0) + action.minutes);
  }

  const goals: LayoutGoal[] = sortedGoals.map((goal) => {
    const angle = GOAL_ANGLE_START + slotFraction(goal.slotIndex) * Math.PI * 2;
    const totalMinutes = actionTotals.get(goal.id) ?? 0;
    return {
      goal,
      angle,
      x: Math.cos(angle) * GOAL_RING_RADIUS,
      y: Math.sin(angle) * GOAL_RING_RADIUS,
      radius: goalRadiusForMinutes(totalMinutes),
      outerRadius: goalRadiusForMinutes(totalMinutes),
      totalMinutes,
      actionCount: 0,
    };
  });

  const goalById = new Map(goals.map((g) => [g.goal.id, g]));

  const actionsByGoal = new Map<string, typeof data.actions>();
  for (const action of data.actions) {
    if (!goalById.has(action.goalId)) continue;
    const list = actionsByGoal.get(action.goalId);
    if (list) list.push(action);
    else actionsByGoal.set(action.goalId, [action]);
  }

  const actions: LayoutAction[] = [];

  for (const goal of goals) {
    const list = actionsByGoal.get(goal.goal.id) ?? [];
    list.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    goal.actionCount = list.length;

    list.forEach((action, i) => {
      const angle = i * GOLDEN_ANGLE + goal.angle;
      // Start the spiral just outside the goal node so early work stays visible.
      const radius = actionSpiralRadius(goal.radius, i);
      goal.outerRadius = Math.max(goal.outerRadius, radius);
      const x = goal.x + Math.cos(angle) * radius;
      const y = goal.y + Math.sin(angle) * radius;

      const dx = x - goal.x;
      const dy = y - goal.y;
      const len = Math.hypot(dx, dy) || 1;
      const bend = (8 + radius * 0.14) * (i % 2 === 0 ? 1 : -1);
      const ctrlX = (goal.x + x) / 2 + (-dy / len) * bend;
      const ctrlY = (goal.y + y) / 2 + (dx / len) * bend;

      actions.push({
        action,
        index: i,
        x,
        y,
        goalX: goal.x,
        goalY: goal.y,
        ctrlX,
        ctrlY,
        hue: goal.goal.color,
      });
    });
  }

  let minX = -GOAL_RING_RADIUS;
  let minY = -GOAL_RING_RADIUS;
  let maxX = GOAL_RING_RADIUS;
  let maxY = GOAL_RING_RADIUS;

  for (const goal of goals) {
    const extent = goal.outerRadius + LABEL_MARGIN;
    minX = Math.min(minX, goal.x - extent);
    maxX = Math.max(maxX, goal.x + extent);
    minY = Math.min(minY, goal.y - extent);
    maxY = Math.max(maxY, goal.y + extent);
  }
  for (const action of actions) {
    minX = Math.min(minX, action.x);
    minY = Math.min(minY, action.y);
    maxX = Math.max(maxX, action.x);
    maxY = Math.max(maxY, action.y);
  }

  return {
    goals,
    actions,
    goalById,
    bounds: { minX, minY, maxX, maxY },
  };
}
