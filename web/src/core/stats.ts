import { AppData } from '../types';

export interface WindowStats {
  newActions: number;
  minutes: number;
  milestones: number;
  goalsStarted: number;
  allActions: number;
  allMinutes: number;
  allMilestones: number;
  allGoals: number;
  addedByGoal: Map<string, number>;
}

export function computeStats(data: AppData, thenDate: number, cutoff: number): WindowStats {
  const stats: WindowStats = {
    newActions: 0,
    minutes: 0,
    milestones: 0,
    goalsStarted: 0,
    allActions: 0,
    allMinutes: 0,
    allMilestones: 0,
    allGoals: 0,
    addedByGoal: new Map(),
  };

  for (const action of data.actions) {
    if (action.timestamp > cutoff) continue;
    stats.allActions++;
    stats.allMinutes += action.minutes;
    if (action.isMilestone) stats.allMilestones++;

    if (action.timestamp >= thenDate) {
      stats.newActions++;
      stats.minutes += action.minutes;
      if (action.isMilestone) stats.milestones++;
      stats.addedByGoal.set(action.goalId, (stats.addedByGoal.get(action.goalId) ?? 0) + 1);
    }
  }

  for (const goal of data.goals) {
    if (goal.createdAt > cutoff) continue;
    stats.allGoals++;
    if (goal.createdAt >= thenDate) stats.goalsStarted++;
  }

  return stats;
}
