// A stand-in for a target's scripts/uat/run.mjs (WS8 UAT): records its arguments, prints the report line, exits with
// FAKE_UAT_EXIT (default 0).
import fs from 'node:fs';

if (process.env.FAKE_UAT_LOG) fs.writeFileSync(process.env.FAKE_UAT_LOG, JSON.stringify({ args: process.argv.slice(2), sawHoldoutKey: 'FACTORY_HOLDOUT_KEY' in process.env }));
console.log('UAT: fake run');
console.log('\nЗвіт: docs/qa/uat/2026-11-03/report.md');
console.log(`  R1: ${process.env.FAKE_UAT_EXIT === '1' ? 'FAIL' : 'PASS'} — the README shows an input and its slug`);
process.exitCode = Number(process.env.FAKE_UAT_EXIT ?? 0);
