import { marketDatabasePath } from './marketDb.js';
import { runQatarOpenDataScan } from './osmScan.js';

try {
  process.loadEnvFile?.('.env');
} catch {
  // Optional local configuration.
}

const run = await runQatarOpenDataScan();
console.log(JSON.stringify({ run, database: marketDatabasePath() }, null, 2));
