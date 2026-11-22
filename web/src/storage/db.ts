import { AppData, Goal, Action } from '../types';

const DB_NAME = 'progress_mirror_db';
const DB_VERSION = 1;
const STORE_GOALS = 'goals';
const STORE_ACTIONS = 'actions';
const LOCAL_STORAGE_KEY = 'progress_mirror_fallback_data';

class Database {
  private dbPromise: Promise<IDBDatabase | null>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private initDB(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      console.warn('IndexedDB unavailable, falling back to localStorage');
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_GOALS)) {
          db.createObjectStore(STORE_GOALS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_ACTIONS)) {
          const actionStore = db.createObjectStore(STORE_ACTIONS, { keyPath: 'id' });
          actionStore.createIndex('goalId', 'goalId', { unique: false });
          actionStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = (err) => {
        console.warn('IndexedDB open error, using localStorage fallback:', err);
        resolve(null);
      };
    });
  }

  private loadLocalStorage(): AppData {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to parse localStorage:', e);
    }
    return { goals: [], actions: [] };
  }

  private saveLocalStorage(data: AppData): void {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  async loadData(): Promise<AppData> {
    const db = await this.dbPromise;
    if (!db) {
      return this.loadLocalStorage();
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_GOALS, STORE_ACTIONS], 'readonly');
        const goalsStore = tx.objectStore(STORE_GOALS);
        const actionsStore = tx.objectStore(STORE_ACTIONS);

        const goalsReq = goalsStore.getAll();
        const actionsReq = actionsStore.getAll();

        tx.oncomplete = () => {
          resolve({
            goals: goalsReq.result || [],
            actions: actionsReq.result || [],
          });
        };

        tx.onerror = () => {
          console.warn('IndexedDB transaction error, falling back to localStorage');
          resolve(this.loadLocalStorage());
        };
      } catch (err) {
        console.warn('IndexedDB error, falling back to localStorage:', err);
        resolve(this.loadLocalStorage());
      }
    });
  }

  async saveGoal(goal: Goal): Promise<void> {
    const db = await this.dbPromise;
    if (!db) {
      const data = this.loadLocalStorage();
      const idx = data.goals.findIndex((g) => g.id === goal.id);
      if (idx >= 0) data.goals[idx] = goal;
      else data.goals.push(goal);
      this.saveLocalStorage(data);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_GOALS], 'readwrite');
      tx.objectStore(STORE_GOALS).put(goal);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  async saveAction(action: Action): Promise<void> {
    const db = await this.dbPromise;
    if (!db) {
      const data = this.loadLocalStorage();
      const idx = data.actions.findIndex((a) => a.id === action.id);
      if (idx >= 0) data.actions[idx] = action;
      else data.actions.push(action);
      this.saveLocalStorage(data);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_ACTIONS], 'readwrite');
      tx.objectStore(STORE_ACTIONS).put(action);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  async deleteAction(id: string): Promise<void> {
    const db = await this.dbPromise;
    if (!db) {
      const data = this.loadLocalStorage();
      data.actions = data.actions.filter((a) => a.id !== id);
      this.saveLocalStorage(data);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_ACTIONS], 'readwrite');
      tx.objectStore(STORE_ACTIONS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  async deleteGoal(id: string): Promise<void> {
    const db = await this.dbPromise;
    if (!db) {
      const data = this.loadLocalStorage();
      data.goals = data.goals.filter((g) => g.id !== id);
      data.actions = data.actions.filter((a) => a.goalId !== id);
      this.saveLocalStorage(data);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_GOALS, STORE_ACTIONS], 'readwrite');
      tx.objectStore(STORE_GOALS).delete(id);
      const actionStore = tx.objectStore(STORE_ACTIONS);
      const index = actionStore.index('goalId');
      const req = index.openCursor(IDBKeyRange.only(id));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.dbPromise;
    if (!db) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_GOALS, STORE_ACTIONS], 'readwrite');
      tx.objectStore(STORE_GOALS).clear();
      tx.objectStore(STORE_ACTIONS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  async clearDemoData(): Promise<void> {
    const data = await this.loadData();
    const demoActionIds = new Set(data.actions.filter((a) => a.isDemo).map((a) => a.id));
    const demoGoalIds = new Set(data.goals.filter((g) => g.id.startsWith('demo-')).map((g) => g.id));

    const db = await this.dbPromise;
    if (!db) {
      data.actions = data.actions.filter((a) => !a.isDemo);
      data.goals = data.goals.filter((g) => !g.id.startsWith('demo-'));
      this.saveLocalStorage(data);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_GOALS, STORE_ACTIONS], 'readwrite');
      const gStore = tx.objectStore(STORE_GOALS);
      const aStore = tx.objectStore(STORE_ACTIONS);

      demoGoalIds.forEach((id) => gStore.delete(id));
      demoActionIds.forEach((id) => aStore.delete(id));

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  async importData(data: AppData): Promise<void> {
    const db = await this.dbPromise;
    if (!db) {
      this.saveLocalStorage(data);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_GOALS, STORE_ACTIONS], 'readwrite');
      const gStore = tx.objectStore(STORE_GOALS);
      const aStore = tx.objectStore(STORE_ACTIONS);

      gStore.clear();
      aStore.clear();

      data.goals.forEach((g) => gStore.put(g));
      data.actions.forEach((a) => aStore.put(a));

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  /** Adds records without removing existing ones (used for demo data). */
  async mergeData(data: AppData): Promise<void> {
    const db = await this.dbPromise;
    if (!db) {
      const current = this.loadLocalStorage();
      const goalIds = new Set(current.goals.map((g) => g.id));
      const actionIds = new Set(current.actions.map((a) => a.id));
      current.goals.push(...data.goals.filter((g) => !goalIds.has(g.id)));
      current.actions.push(...data.actions.filter((a) => !actionIds.has(a.id)));
      this.saveLocalStorage(current);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_GOALS, STORE_ACTIONS], 'readwrite');
      const gStore = tx.objectStore(STORE_GOALS);
      const aStore = tx.objectStore(STORE_ACTIONS);

      data.goals.forEach((g) => gStore.put(g));
      data.actions.forEach((a) => aStore.put(a));

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }
}

export const db = new Database();
