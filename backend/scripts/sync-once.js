import 'dotenv/config';
import '../db.js';
import { syncAll } from '../services/sync.js';

(async () => {
  console.log('Running one-off sync…');
  const r = await syncAll();
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
})();
