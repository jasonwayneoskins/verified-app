// Grading job CLI. Grades ungraded picks whose games have final scores.
// Usage: node scripts/grade.js
// Production scheduling: point cron-job.org (free) at
//   GET https://<your-app>/api/cron/grade?secret=<CRON_SECRET>  every 15-30 min.
import { ensureSchema, close } from '../src/db/index.js';
import { runGrader } from '../src/grader.js';

await ensureSchema();
const summary = await runGrader({});
console.log(JSON.stringify(summary, null, 2));
await close();
process.exit(summary.errors.length ? 1 : 0);
