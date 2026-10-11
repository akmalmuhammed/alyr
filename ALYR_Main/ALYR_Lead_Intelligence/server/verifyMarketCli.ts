import { verifyMarketBatch } from './marketVerification.js';

try {
  process.loadEnvFile?.('.env');
} catch {
  // Optional local configuration.
}

const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
const limit = limitArgument ? Number(limitArgument.split('=')[1]) : 25;
const result = await verifyMarketBatch({ limit: Number.isFinite(limit) ? limit : 25 });
console.log(JSON.stringify(result, null, 2));
