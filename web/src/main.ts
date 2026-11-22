import './style.css';
import { db } from './storage/db';
import { startApp } from './app';
import { startLauncher } from './launcher';
import { showOnboarding } from './ui/onboarding';
import { registerServiceWorker } from './pwa/register';

const root = document.getElementById('app')!;
const isLauncher = new URLSearchParams(location.search).get('launcher') === '1';

async function boot(): Promise<void> {
  if (isLauncher) {
    startLauncher(root);
    return;
  }

  const data = await db.loadData();
  if (data.goals.length === 0) {
    showOnboarding(root, (next) => startApp(root, next, false));
  } else {
    startApp(root, data, false);
  }
}

if (!isLauncher) registerServiceWorker();
void boot();
