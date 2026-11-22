import { AppData, Goal, Action } from '../types';

function toBase64(utf8: string): string {
  const bytes = new TextEncoder().encode(utf8);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

interface AndroidBridge {
  saveFile?: (fileName: string, mimeType: string, base64Content: string) => void;
}

function getAndroidBridge(): AndroidBridge | undefined {
  return (window as unknown as { AndroidBridge?: AndroidBridge }).AndroidBridge;
}

export function exportDataToJSON(data: AppData): void {
  const jsonString = JSON.stringify(data, null, 2);
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `progress-mirror-backup-${dateStr}.json`;

  const bridge = getAndroidBridge();
  if (bridge?.saveFile) {
    bridge.saveFile(fileName, 'application/json', toBase64(jsonString));
    return;
  }

  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function validateAppData(json: any): { valid: boolean; data?: AppData; error?: string } {
  if (!json || typeof json !== 'object') {
    return { valid: false, error: 'Invalid JSON format' };
  }

  if (!Array.isArray(json.goals) || !Array.isArray(json.actions)) {
    return { valid: false, error: 'JSON must contain "goals" and "actions" arrays' };
  }

  const goals: Goal[] = [];
  for (const g of json.goals) {
    if (typeof g.id !== 'string' || typeof g.name !== 'string' || typeof g.color !== 'number') {
      return { valid: false, error: 'Invalid goal object in file' };
    }
    goals.push({
      id: g.id,
      name: g.name,
      color: g.color,
      createdAt: typeof g.createdAt === 'number' ? g.createdAt : Date.now(),
      slotIndex: typeof g.slotIndex === 'number' ? g.slotIndex : goals.length,
    });
  }

  const actions: Action[] = [];
  for (const a of json.actions) {
    if (
      typeof a.id !== 'string' ||
      typeof a.goalId !== 'string' ||
      typeof a.text !== 'string' ||
      typeof a.minutes !== 'number' ||
      typeof a.timestamp !== 'number'
    ) {
      return { valid: false, error: 'Invalid action object in file' };
    }
    actions.push({
      id: a.id,
      goalId: a.goalId,
      text: a.text,
      minutes: a.minutes,
      isMilestone: Boolean(a.isMilestone),
      timestamp: a.timestamp,
      note: typeof a.note === 'string' ? a.note : undefined,
      isDemo: Boolean(a.isDemo),
    });
  }

  return { valid: true, data: { goals, actions } };
}

export function parseJSONFile(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const result = validateAppData(json);
        if (result.valid && result.data) {
          resolve(result.data);
        } else {
          reject(new Error(result.error || 'Validation failed'));
        }
      } catch (err) {
        reject(new Error('Failed to parse JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
