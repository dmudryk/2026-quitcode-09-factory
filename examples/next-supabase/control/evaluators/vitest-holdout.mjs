// evaluators/vitest-holdout.mjs — оцінювач прихованих сценаріїв (holdouts) для Next.js + Vitest (курсова редакція WS9).
// Прихований сценарій — це Vitest-файл (тест домену чи PGlite-тест бази), який будівельник НЕ бачить: «контрольна з
// невідомими задачами». Фабрика розшифровує набір і запускає цей файл; він проганяє сценарії на КОПІЇ кандидата.
// Контракт воріт holdout фабрики (src/gates/holdout.mjs):
//   stdin: масив scenarios набору; змінна FACTORY_CANDIDATE_DIR = справжній шлях робочого простору;
//   cwd: порожня тимчасова тека; ОСТАННІЙ рядок stdout має бути {"cases":[{"id","passed"}]} — кожен id рівно раз.
// Ніколи не пишіть у робочий простір: наступна спроба стартує з нього, і приховані файли «протекли» б будівельнику.
// Сценарій: { "id": "H07a", "ac": "AC-LEAVE-07", "input": "<характерний літерал ≥6 символів — для перевірки витоку>",
//             "source": "<Vitest-файл; назва кожного тесту починається з id сценарію, напр. it(\"H07a: …\")>" }
// Профіль next-vitest не ізольований (Node permission model не запускає Vitest), тож код кандидата під час цих тестів
// теоретично може читати копію. Тому набори завжди запечатані (holdouts.requireSealed), а це — захист від підгонки
// під тести й помилок, а не пісочниця (docs/trust.md, docs/uk/limits.md).
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
