import { AppData, Goal, Action } from '../types';

export function generateDemoData(): AppData {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const ONE_YEAR = 365 * ONE_DAY;
  const startDate = now - ONE_YEAR;

  const demoGoals: Goal[] = [
    { id: 'demo-1', name: 'Software Craft', color: 210, createdAt: startDate, slotIndex: 0 },
    { id: 'demo-2', name: 'Spanish Fluency', color: 350, createdAt: startDate + 5 * ONE_DAY, slotIndex: 1 },
    { id: 'demo-3', name: 'Marathon Training', color: 140, createdAt: startDate + 12 * ONE_DAY, slotIndex: 2 },
    { id: 'demo-4', name: 'Non-Fiction Reading', color: 45, createdAt: startDate + 20 * ONE_DAY, slotIndex: 3 },
    { id: 'demo-5', name: 'Creative Writing', color: 280, createdAt: startDate + 30 * ONE_DAY, slotIndex: 4 },
    { id: 'demo-6', name: 'Piano Practice', color: 180, createdAt: startDate + 45 * ONE_DAY, slotIndex: 5 },
    { id: 'demo-7', name: 'Mindfulness', color: 90, createdAt: startDate + 60 * ONE_DAY, slotIndex: 6 },
  ];

  const goalActionPool: Record<string, { standard: string[]; milestones: string[] }> = {
    'demo-1': {
      standard: [
        'Implemented core data structure',
        'Refactored canvas render loop',
        'Wrote unit tests for storage layer',
        'Fixed memory leak in sprite cache',
        'Designed dark mode UI layout',
        'Built PWA service worker offline cache',
        'Optimized viewport culling logic',
        'Reviewed open pull request',
      ],
      milestones: [
        'Shipped v1.0 release candidate',
        'Passed 100% test coverage target',
        'First external contributor PR merged',
        'Completed architecture overhaul',
      ],
    },
    'demo-2': {
      standard: [
        'Duolingo vocabulary practice',
        'Listened to Spanish podcast episode',
        'Read news article in Spanish',
        'Grammar exercise: Subjunctive mood',
        'Conversation exchange call (30m)',
        'Anki flashcard review (100 cards)',
      ],
      milestones: [
        'Completed B1 intermediate assessment',
        'Finished first novel in Spanish without dictionary',
        'Had 1-hour conversation entirely in Spanish',
      ],
    },
    'demo-3': {
      standard: [
        'Easy 5k recovery run',
        'Interval training session (8x400m)',
        'Tempo run at marathon pace',
        'Leg day strength & mobility',
        'Long weekend endurance run',
        'Hill repeats session',
      ],
      milestones: [
        'Ran first half-marathon distance (21.1 km)',
        'Broke 20-minute 5k personal record',
        'Completed peak 30km training run',
      ],
    },
    'demo-4': {
      standard: [
        'Read 2 chapters of Designing Data-Intensive Applications',
        'Read 30 pages of Thinking, Fast and Slow',
        'Annotated paper on Distributed Systems',
        'Finished article on Web Performance',
        'Evening reading session',
      ],
      milestones: [
        'Finished reading book 10 of the year',
        'Completed full summary of DDIA',
        'Finished reading book 25 of the year',
      ],
    },
    'demo-5': {
      standard: [
        'Morning free-writing stream (500 words)',
        'Character outline draft for Chapter 3',
        'Edited scene dialogue',
        'World-building research session',
        'Drafted essay on digital minimalism',
      ],
      milestones: [
        'Finished draft of Short Story #1',
        'Reached 50,000 words total written',
        'Published essay online',
      ],
    },
    'demo-6': {
      standard: [
        'Major scales & arpeggio warmups',
        'Sight-reading practice (Bach Minuet)',
        'Hand independence drills',
        'Chopin Nocturne measure 1-16 breakdown',
        'Rhythm practice with metronome',
      ],
      milestones: [
        'Mastered Chopin Nocturne Op. 9 No. 2 from memory',
        'Performed full piece for family',
      ],
    },
    'demo-7': {
      standard: [
        'Morning silent breathwork',
        'Guided Vipassana meditation',
        'Evening body scan session',
        'Mindful walking practice',
      ],
      milestones: [
        'Completed 30-day streak of daily meditation',
        'Finished 3-day silent weekend retreat',
      ],
    },
  };

  const minutesOptions = [15, 30, 45, 60, 90, 120];
  const demoActions: Action[] = [];

  // We generate ~900 actions across 365 days.
  // Activity increases exponentially toward today.
  // Target: total ~900 items.
  let idCounter = 1;
  const numDays = 365;

  for (let day = 0; day < numDays; day++) {
    const dayProgress = day / numDays; // 0.0 to 1.0
    // Probability of action on a given day increases over time: ~3 items per day later on
    const dailyDensity = 1.15 + Math.pow(dayProgress, 1.8) * 5.2;
    const numActionsToday = Math.floor(dailyDensity + (Math.random() * 0.8 - 0.4));

    const dayTimestamp = startDate + day * ONE_DAY + Math.floor(Math.random() * 12 * 60 * 60 * 1000);

    for (let a = 0; a < numActionsToday; a++) {
      // Pick a goal among active goals at this date
      const availableGoals = demoGoals.filter((g) => g.createdAt <= dayTimestamp);
      if (availableGoals.length === 0) continue;

      const goal = availableGoals[Math.floor(Math.random() * availableGoals.length)];
      const pool = goalActionPool[goal.id];

      // 5% chance of milestone
      const isMilestone = Math.random() < 0.05;
      let text: string;
      let minutes: number;

      if (isMilestone) {
        text = pool.milestones[Math.floor(Math.random() * pool.milestones.length)];
        minutes = 0;
      } else {
        text = pool.standard[Math.floor(Math.random() * pool.standard.length)];
        minutes = minutesOptions[Math.floor(Math.random() * minutesOptions.length)];
      }

      // Add a slight timestamp jitter (seconds/minutes)
      const actionTimestamp = dayTimestamp + a * 30 * 60 * 1000 + Math.floor(Math.random() * 10 * 60 * 1000);

      demoActions.push({
        id: `demo-action-${idCounter++}`,
        goalId: goal.id,
        text,
        minutes,
        isMilestone,
        timestamp: actionTimestamp,
        isDemo: true,
      });
    }
  }

  // Sort actions by timestamp ascending
  demoActions.sort((a, b) => a.timestamp - b.timestamp);

  return {
    goals: demoGoals,
    actions: demoActions,
  };
}
