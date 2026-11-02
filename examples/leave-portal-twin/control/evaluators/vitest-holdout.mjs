// control/evaluators/vitest-holdout.mjs — hidden acceptance scenarios as Vitest files (PGlite DB tests, domain tests),
// run against a COPY of the candidate. Contract of principled-factory's holdout gate (src/gates/holdout.mjs):
//   stdin: the set's `scenarios` array (decrypted by the factory); env FACTORY_CANDIDATE_DIR = the workspace's real path;
//   cwd: an empty scratch directory; the LAST stdout line must be {"cases":[{"id","passed"}]} with every scenario id once.
// Never write into the workspace: the next attempt starts from it, so hidden files there would leak to the builder.
// Scenario: { "id": "H07a", "ac": "AC-LEAVE-07", "input": "<distinctive literal, ≥6 chars, for the leak scan>",
//             "source": "<a Vitest file; every test title starts with the scenario id, e.g. it(\"H07a: …\")>" }
// The profile is unconfined, so candidate code running in these tests could read the copy; seal the sets
// (holdouts.requireSealed) and treat this as a harness against overfitting, not a sandbox (docs/trust.md).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const scenarios = JSON.parse(raw);
const ws = process.env.FACTORY_CANDIDATE_DIR;
const SKIP = /^(node_modules|\.git|\.next|\.factory|test-results|coverage)(\/|$)/;

const copy = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "holdout-copy-")));
const cases = [];
try {
  fs.cpSync(ws, copy, {
    recursive: true,
    filter: (src) => !SKIP.test(path.relative(ws, src).split(path.sep).join("/")),
  });
  fs.symlinkSync(fs.realpathSync.native(path.join(ws, "node_modules")), path.join(copy, "node_modules"), "junction");
  const dir = path.join(copy, "tests", "holdout");
  fs.mkdirSync(dir, { recursive: true });
  for (const s of scenarios) fs.writeFileSync(path.join(dir, `${s.id}.test.ts`), s.source);

  const out = path.join(copy, "holdout-report.json");
  const env = { ...process.env };
  delete env.FACTORY_CANDIDATE_DIR; // candidate code must not learn where the workspace is
  spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/holdout", "--reporter=json", `--outputFile=${out}`],
    { cwd: copy, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); // output captured, never printed
  let report = null;
  try { report = JSON.parse(fs.readFileSync(out, "utf8")); } catch { /* every case fails below */ }

  for (const s of scenarios) {
    const file = report?.testResults.find((f) => path.basename(f.name) === `${s.id}.test.ts`);
    const tests = (file?.assertionResults ?? []).filter((t) => ["passed", "failed"].includes(t.status) && t.title.startsWith(`${s.id}:`));
    cases.push({ id: s.id, passed: tests.length > 0 && tests.every((t) => t.status === "passed") });
  }
} catch (error) {
  console.error(`holdout evaluator: ${error.message}`); // stderr is kept as evidence, never shown to the builder
  for (const s of scenarios) if (!cases.some((c) => c.id === s.id)) cases.push({ id: s.id, passed: false });
} finally {
  fs.rmSync(copy, { recursive: true, force: true }); // unlinks the junction, does not follow it
}
console.log(JSON.stringify({ cases }));
