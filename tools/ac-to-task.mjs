#!/usr/bin/env node
// tools/ac-to-task.mjs — імпортер вимог: вимога PM (markdown-файл або GitHub issue) → задача фабрики (task JSON).
//
// Що робить: кожен вибраний критерій приймання (AC) стає записом requirements[]:
//   { id: <ID критерію>, description: <текст «Дано / Коли / Тоді»>, verifiedBy: ["visible:<ID>", "holdout:<набір>"] }.
//   «visible:<ID>» — це рядок TAP, який друкує scripts/factory-tap.mjs у вашому репозиторії (один рядок на ID критерію).
// Нефункціональні вимоги імпортер навмисно пише як "TBD": фабрика не прийме задачу, доки людина їх не вирішить
// (принцип 1.2 «у роботу йде лише те, що можна перевірити»).
//
// Запуск:
//   node tools/ac-to-task.mjs --file <репо>/requirements/03-leave.md --ac AC-LEAVE-07,AC-LEAVE-08 --id leave-revision \
//        [--holdout leave-db] [--target <репо>] [--size small|medium|large] [--change <id зміни openspec>] [--out <файл>]
//        [--format lines|table|block]   (як PM записує критерії; типово lines — див. ТОЧКУ РОЗШИРЕННЯ 3)
//   node tools/ac-to-task.mjs --issue <власник>/<репо>#12 --ac … --id …      (тіло issue читається через `gh issue view`)
// --target <репо>: pass-to-pass = критерії, уже «реалізовано» в <репо>/docs/conformance.md, для яких є Vitest-тест
//   (захист від регресії); захищені шаблони, що не збігаються з жодним файлом репо, відкидаються з попередженням.
// --out <файл>: запис у файл UTF-8. У Windows PowerShell 5.1 оператор «>» пише UTF-16, і фабрика такий JSON не прочитає.
//
// Як адаптувати під формат вашого PM — docs/uk/adapt-importer.md. Місця для змін позначені «ТОЧКА РОЗШИРЕННЯ N».
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { matchesAny } from "../src/util.mjs"; // ті самі правила шаблонів, що й у фабриці (без {a,b})

const args = process.argv.slice(2);
const opt = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const fail = (msg) => { console.error(`ac-to-task: ${msg}`); process.exit(2); };
const warn = (msg) => console.error(`ac-to-task: УВАГА ${msg}`);

// ТОЧКА РОЗШИРЕННЯ 1 — вигляд ID критерію. Типово «AC-<ЛІТЕРИ>-<дві цифри>»: AC-LEAVE-07, AC-USERS-12.
// Якщо ваш PM пише інакше (наприклад «AC-3.2» чи «US12-AC1»), змініть цей вираз І такий самий вираз у scripts/factory-tap.mjs,
// інакше фабрика не знайде рядок TAP для критерію.
const AC_ID = "AC-[A-Z]{2,12}-\\d{2}";

// ТОЧКА РОЗШИРЕННЯ 2 — звідки беремо текст вимоги. Зараз: файл markdown або GitHub issue.
// Сюди ж можна додати Jira, Linear чи Google Docs (експорт у markdown) — головне повернути { text, source }.
function readSource() {
  if (opt("file")) return { source: opt("file"), text: fs.readFileSync(opt("file"), "utf8") };
  if (opt("issue")) {
    const m = opt("issue").match(/^([\w.-]+\/[\w.-]+)#(\d+)$/) ?? fail("--issue має виглядати як власник/репо#12");
    const issue = JSON.parse(execFileSync("gh", ["issue", "view", m[2], "--repo", m[1], "--json", "title,body,url"], { encoding: "utf8" }));
    return { source: issue.url, text: `# ${issue.title}\n\n${issue.body}` };
  }
  return fail("вкажіть --file <вимога.md> або --issue <власник/репо#N>");
}

// ТОЧКА РОЗШИРЕННЯ 3 — як знайти критерії в тексті. Три готові формати (--format), кожен повертає Map: ID → опис критерію.
// Якщо вашого формату тут немає, додайте свою функцію в PARSERS — приклади й промпт у docs/uk/adapt-importer.md.
const PARSERS = {
  // «lines» (типово): ОДИН РЯДОК на критерій, ID на початку, далі «:» чи «—» (або одразу «Дано»). Рядок може бути пунктом
  // списку, пунктом з номером, чекбоксом issue, заголовком, цитатою, з жирним ID:
  //   - AC-LEAVE-07: Дано … Коли … Тоді …        - [ ] **AC-LEAVE-07** — Дано …        ### AC-LEAVE-07: Дано …
  lines(text) {
    const line = new RegExp(`^\\s*(?:>\\s*)?(?:#{1,6}\\s+)?(?:[-*+]\\s+|\\d+[.)]\\s+)?(?:\\[[ xX]\\]\\s+)?(?:\\*\\*|__)?(${AC_ID})(?![\\w-])`
      + `(?:\\*\\*|__)?(?:\\s*(?::|—|–|-\\s)|\\s+(?=Дано))\\s*(.*)$`);
    const acs = new Map();
    for (const l of text.split("\n")) {
      const m = l.match(line);
      if (m && !acs.has(m[1])) acs.set(m[1], m[2].trim()); // перший запис ID виграє
    }
    return acs;
  },
  // «table»: рядок таблиці, перша клітинка — ID, решта — текст критерію:  | AC-X-01 | Дано … | Коли … | Тоді … |
  table(text) {
    const acs = new Map();
    for (const l of text.split("\n")) {
      const cells = l.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2 && new RegExp(`^${AC_ID}$`).test(cells[0]) && !acs.has(cells[0])) acs.set(cells[0], cells.slice(1).join(" · "));
    }
    return acs;
  },
  // «block»: заголовок з ID («### AC-X-01 — назва»), а «Дано / Коли / Тоді» — окремими рядками під ним, до наступного заголовка.
  block(text) {
    const acs = new Map();
    let current = null;
    for (const l of text.split("\n")) {
      const head = l.match(new RegExp(`^#{2,6}\\s+(${AC_ID})(?![\\w-])`));
      if (head) { current = head[1]; acs.set(current, ""); continue; }
      if (/^#{1,6}\s/.test(l)) { current = null; continue; }
      if (current && l.trim()) acs.set(current, `${acs.get(current)} ${l.replace(/^\s*[-*]\s+/, "").replaceAll("**", "").trim()}`.trim());
    }
    return acs;
  },
};

// ТОЧКА РОЗШИРЕННЯ 4 — назва задачі та «навіщо». Типово: перший заголовок «# …» (без префікса «Вимога:») і розділ «## Навіщо».
function parseTitleAndWhy(text, fallback) {
  const title = (text.match(/^#\s+(.+)$/m)?.[1] ?? fallback).replace(/^Вимога:\s*/i, "").trim();
  const why = text.match(/^#{2,6}\s+Навіщо\s*$([\s\S]*?)(?=^#{1,6}\s|(?![\s\S]))/m)?.[1].trim().replace(/\s+/g, " ") ?? "";
  return { title, why };
}

// Критерії, які фабрика БАЧИТЬ: ті, що мають тест у файлах, які запускає Vitest (*.test.ts(x) у tests/ або src/),
// крім tests/e2e (Playwright: це UAT, фабрика його не запускає) і tests/fixtures.
function vitestAcs(target) {
  const found = new Set();
  const walk = (dir) => {
    for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
      const p = path.join(dir, e.name);
      const r = path.relative(target, p).split(path.sep).join("/");
      if (e.isDirectory() && !/^(node_modules|\.git|\.next)$/.test(e.name) && !/^tests\/(e2e|fixtures)(\/|$)/.test(r)) walk(p);
      else if (e.isFile() && /\.test\.tsx?$/.test(e.name)) {
        const re = new RegExp(`\\b(?:it|test)(?:\\.\\w+)*\\(\\s*["'\`](${AC_ID})(?![\\w-])`, "g");
        for (const m of fs.readFileSync(p, "utf8").matchAll(re)) found.add(m[1]);
      }
    }
  };
  for (const d of ["tests", "src"]) walk(path.join(target, d));
  return found;
}

// ТОЧКА РОЗШИРЕННЯ 5 — що вже реалізовано (pass-to-pass: ці критерії мають лишитися зеленими).
// Типово: рядки таблиці docs/conformance.md, де друга клітинка — ID, а передостання — «реалізовано».
function implementedAcs(target) {
  const matrix = path.join(target, "docs", "conformance.md");
  if (!fs.existsSync(matrix)) return [];
  return fs.readFileSync(matrix, "utf8").split("\n")
    .map((l) => l.split("|").map((c) => c.trim()))
    .filter((c) => new RegExp(`^${AC_ID}$`).test(c[1] ?? "") && /^реалізовано$/i.test(c.at(-2) ?? ""))
    .map((c) => c[1]);
}

// ТОЧКА РОЗШИРЕННЯ 6 — що будівельник (агент) не має права змінювати. Тести, скрипти, вимоги, специфікації, залежності, CI.
// Міграції тут НЕ захищені: у близнюку фабрика сама пише нові міграції (рішення автора курсу).
const PROTECTED = ["tests/**", "src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**", "package.json", "package-lock.json",
  ".github/**", "openspec/**", "requirements/**", "vitest.config.mts", "vitest.config.ts", "supabase/seed.sql",
  "supabase/config.toml", "AGENTS.md", "CLAUDE.md"];

// Шаблон, що не збігається з жодним файлом репо, нічого не захищає: прибираємо його й кажемо про це, щоб список був чесним.
// (Фабрика відмовить задачі, якщо НЕ збігається жоден шаблон: тоді тести критеріїв можна було б змінювати.)
function existingGlobs(target, globs) {
  const files = execFileSync("git", ["-C", target, "ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
  return globs.filter((g) => files.some((f) => matchesAny(f, [g])) || (warn(`захищений шаблон ${g} не збігається з жодним файлом — пропущено`), false));
}

// --- головне ------------------------------------------------------------------------------------------------------
const { source, text: raw } = readSource();
const id = opt("id") ?? fail("потрібен --id <ідентифікатор задачі>");
const wanted = (opt("ac") ?? fail("потрібен --ac AC-…,AC-…")).split(",").map((s) => s.trim()).filter(Boolean);
const text = raw.replace(/<!--[\s\S]*?-->/g, ""); // коментарі HTML у вимогах — не критерії
const { title, why } = parseTitleAndWhy(text, id);
const format = opt("format") ?? "lines";
const parse = PARSERS[format] ?? fail(`невідомий --format ${format}; є: ${Object.keys(PARSERS).join(", ")}`);
const acs = parse(text);
const missing = wanted.filter((a) => !acs.has(a));
if (missing.length) fail(`не знайдено в ${source}: ${missing.join(", ")} (знайдено: ${[...acs.keys()].join(", ") || "нічого"})`);

const holdout = opt("holdout");
const target = opt("target");
let passToPass = [];
let protectedGlobs = PROTECTED;
if (target) {
  const seen = vitestAcs(target);
  const noVitest = wanted.filter((a) => !seen.has(a));
  if (noVitest.length) {
    warn(`${noVitest.join(", ")} не мають Vitest-тесту (лише e2e або ще не написано): спершу напишіть Vitest/PGlite-тест `
      + "на гілці «тести спершу» або перевіряйте їх лише прихованими сценаріями (holdout).");
  }
  const skipped = [];
  passToPass = implementedAcs(target).filter((a) => !wanted.includes(a)).filter((a) => seen.has(a) || (skipped.push(a), false));
  if (skipped.length) warn(`pass-to-pass пропускає критерії лише з e2e-тестами (Vitest їх не запускає): ${skipped.join(", ")}`);
  protectedGlobs = existingGlobs(target, PROTECTED);
}

const task = {
  schemaVersion: 1,
  id,
  title,
  intent: [`Implement "${title}" so that every acceptance criterion below holds as a rule, not only for the examples in the visible tests.`,
    why && `Why: ${why}`, `Source: ${source}.`].filter(Boolean).join(" "),
  ...(opt("size") ? { size: opt("size") } : {}),
  requirements: wanted.map((a) => ({ id: a, description: acs.get(a), verifiedBy: [`visible:${a}`, ...(holdout ? [`holdout:${holdout}`] : [])] })),
  nonFunctionals: { security: "TBD", accessRules: "TBD", idempotency: "TBD", tenancy: "TBD", failureModes: "TBD" },
  visibleTests: { failToPass: wanted, passToPass: [...new Set(passToPass)].sort() },
  holdouts: holdout ? [holdout] : [],
  protected: protectedGlobs,
  ...(opt("change") ? { context: [`openspec/changes/${opt("change")}/proposal.md`, `openspec/changes/${opt("change")}/tasks.md`] } : {}),
};
const json = JSON.stringify(task, null, 2) + "\n";
if (opt("out")) { fs.writeFileSync(opt("out"), json); console.error(`ac-to-task: задачу записано в ${opt("out")}; заповніть nonFunctionals (зараз TBD)`); }
else process.stdout.write(json);
