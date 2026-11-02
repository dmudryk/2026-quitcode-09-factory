#!/usr/bin/env node
// scripts/factory-tap.mjs — адаптер тестів для principled-factory (профіль «next-vitest», курсова редакція WS9).
// Скопіюйте цей файл у свій репозиторій як scripts/factory-tap.mjs і закомітьте на main (він зелений і нічого не ламає).
//
// Навіщо: фабрика розуміє лише TAP зі СТАБІЛЬНИМИ назвами тестів. Vitest-овий --reporter=tap-flat додає «# time=…ms»,
// тож два однакові прогони дають різні підписи, і ворота repeat та doctor завжди падали б. Цей скрипт запускає Vitest із
// JSON-звітом і друкує TAP, який фабрика може судити:
//   - один рядок на ID критерію: «ok N - AC-LEAVE-07», лише якщо ВСІ тести, чия назва починається з цього ID, пройшли;
//     «not ok», якщо хоч один упав або файл, що його оголошує, не завантажився;
//   - один рядок на кожен інший тест зі стабільною назвою «файл > describe > назва» (без часу);
//   - файл, що не завантажився: «not ok N - tests/x.test.ts» (фабрика вважає «*.ts» у назві збоєм завантаження);
//   - з --checks спершу рядки typecheck, lint, ac-coverage (те, що перевіряє CI). НЕ вносьте їх у visibleTests задачі:
//     judgeVisible падає на БУДЬ-ЯКОМУ «not ok», а на базовій лінії вони можуть бути червоними законно
//     (тести імпортують код, якого ще немає).
// Запуск: node scripts/factory-tap.mjs [--checks] [фільтри vitest…]   (код виходу 1, якщо щось not ok)
// Windows: скрипт запускає «node <cli.js>» напряму — npm/npx є shell-обгортками, яких фабрика не запускає.
// Під інший стек змініть шляхи до next/tsc/eslint і скрипт ac-coverage нижче (або приберіть зайві перевірки).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const AC = /^AC-[A-Z]{2,12}-\d{2}(?![\w-])/;
const AC_IN_SOURCE = /\b(?:it|test)(?:\.\w+)*\(\s*["'`](AC-[A-Z]{2,12}-\d{2})(?![\w-])/g;
const argv = process.argv.slice(2);
const withChecks = argv.includes("--checks");
const filters = argv.filter((a) => a !== "--checks");
const cwd = process.cwd();
const rel = (p) => path.relative(cwd, p).split(path.sep).join("/");
const lines = []; // { ok, name, diag }
const run = (args) => spawnSync(process.execPath, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const tail = (r) => `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split("\n").slice(-25).join("\n");

if (withChecks) {
  const typegen = run(["node_modules/next/dist/bin/next", "typegen"]);
  const tsc = typegen.status === 0 ? run(["node_modules/typescript/bin/tsc", "--noEmit"]) : typegen;
  lines.push({ ok: tsc.status === 0, name: "typecheck", diag: tsc.status === 0 ? "" : tail(tsc) });
  const lint = run(["node_modules/eslint/bin/eslint.js", "--max-warnings", "0"]);
  lines.push({ ok: lint.status === 0, name: "lint", diag: lint.status === 0 ? "" : tail(lint) });
  const cov = run(["scripts/check-ac-coverage.mjs"]);
  lines.push({ ok: cov.status === 0, name: "ac-coverage", diag: cov.status === 0 ? "" : tail(cov) });
}

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-tap-"));
const outFile = path.join(outDir, "vitest.json");
const vitest = run(["node_modules/vitest/vitest.mjs", "run", "--reporter=json", `--outputFile=${outFile}`, ...filters]);
let report = null;
try { report = JSON.parse(fs.readFileSync(outFile, "utf8")); } catch { /* reported below */ }
fs.rmSync(outDir, { recursive: true, force: true });

const acs = new Map(); // id → { ok, diag[] }
const mark = (id, ok, diag) => {
  const a = acs.get(id) ?? { ok: true, diag: [] };
  a.ok &&= ok;
  if (!ok && diag) a.diag.push(diag);
  acs.set(id, a);
};

if (!report) {
  lines.push({ ok: false, name: "vitest", diag: tail(vitest) });
} else {
  for (const file of report.testResults) {
    const name = rel(file.name);
    if (file.status === "failed" && !file.assertionResults.length) {
      lines.push({ ok: false, name, diag: String(file.message ?? "").slice(0, 2000) });
      let src = "";
      try { src = fs.readFileSync(file.name, "utf8"); } catch { /* unreadable */ }
      for (const m of src.matchAll(AC_IN_SOURCE)) mark(m[1], false, `${name} failed to load`);
      continue;
    }
    for (const t of file.assertionResults) {
      if (!["passed", "failed"].includes(t.status)) continue; // skipped / todo / pending are not counted
      const ok = t.status === "passed";
      const diag = ok ? "" : `${name} > ${t.title}\n${(t.failureMessages ?? []).join("\n").slice(0, 1500)}`;
      const id = t.title.match(AC)?.[0];
      if (id) mark(id, ok, diag);
      else lines.push({ ok, name: [name, ...t.ancestorTitles, t.title].join(" > "), diag });
    }
  }
  for (const [id, a] of [...acs].sort(([x], [y]) => x.localeCompare(y))) {
    lines.push({ ok: a.ok, name: id, diag: a.diag.join("\n\n") });
  }
}

const out = ["TAP version 13", `1..${lines.length}`];
lines.forEach((l, i) => {
  out.push(`${l.ok ? "ok" : "not ok"} ${i + 1} - ${l.name.replace(/[\r\n]+/g, " ").replace(/\s#\s/g, " ")}`);
  if (!l.ok && l.diag) out.push("  ---", ...l.diag.split("\n").map((d) => `  ${d}`), "  ...");
});
process.stdout.write(out.join("\n") + "\n");
process.exitCode = lines.every((l) => l.ok) ? 0 : 1;
