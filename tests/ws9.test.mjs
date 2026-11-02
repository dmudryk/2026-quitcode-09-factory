// Course edition (WS9): tests for what this edition adds to principled-factory for a Next.js + Vitest stack.
// Delivery (push, PR, auto-merge, UAT) is tested separately in tests/deliver.test.mjs.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkspace, removeWorkspace } from '../src/workspace.mjs';
import { git } from '../src/util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const made = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-ws9-')); made.push(d); return d; };
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

function gitRepo(dir, files) {
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['-c', 'user.name=T', '-c', 'user.email=t@localhost', 'add', '-A']);
  git(dir, ['-c', 'user.name=T', '-c', 'user.email=t@localhost', 'commit', '-q', '-m', 'init']);
  return dir;
}

// --- workspace: node_modules junction ---------------------------------------------------------------------------
test('[P5.2] the workspace sees the target\'s installed dependencies; removing it leaves them untouched', () => {
  const target = gitRepo(path.join(tmp(), 'target'), { '.gitignore': 'node_modules/\n', 'index.mjs': 'export const x = 1;\n' });
  fs.mkdirSync(path.join(target, 'node_modules', 'dep'), { recursive: true });
  fs.writeFileSync(path.join(target, 'node_modules', 'dep', 'index.js'), 'module.exports = 42;\n');
  const wsDir = path.join(tmp(), 'ws');
  const { ws } = createWorkspace(target, wsDir);
  assert.equal(fs.readFileSync(path.join(ws, 'node_modules', 'dep', 'index.js'), 'utf8'), 'module.exports = 42;\n');
  assert.equal(git(ws, ['status', '--porcelain']), '', 'the junction is gitignored, so it never shows up in a diff');
  removeWorkspace(target, wsDir);
  assert.equal(fs.existsSync(wsDir), false);
  assert.equal(fs.readFileSync(path.join(target, 'node_modules', 'dep', 'index.js'), 'utf8'), 'module.exports = 42;\n');
});

test('[P5.2] a target without node_modules gets a workspace without the junction', () => {
  const target = gitRepo(path.join(tmp(), 'target'), { 'index.mjs': 'export const x = 1;\n' });
  const wsDir = path.join(tmp(), 'ws');
  const { ws } = createWorkspace(target, wsDir);
  try { assert.equal(fs.existsSync(path.join(ws, 'node_modules')), false); } finally { removeWorkspace(target, wsDir); }
});

// --- example control for a Next.js + Supabase twin -----------------------------------------------------------------
const EXAMPLE = path.join(ROOT, 'examples', 'next-supabase', 'control');

test('[P9.4] the next-supabase example control loads with the built-in next-vitest profile', async () => {
  const { loadConfig } = await import('../src/config.mjs');
  const config = loadConfig(EXAMPLE);
  assert.equal(config.profile.name, 'next-vitest');
  assert.equal(config.profile.confined, undefined, 'Vitest cannot start under the Node permission model, so this profile is unconfined');
  assert.ok(config.factory.delivery, 'delivery is configured');
  assert.ok(config.policy.dataBoundary.denyGlobs.includes('**/.env*'), '.env.local and friends are outside the data boundary');
});

test('[P7.1][P8.3] in the twin example every change, migrations included, is released without a human; upstream needs people', async () => {
  const { loadConfig } = await import('../src/config.mjs');
  const { decideTier } = await import('../src/autonomy.mjs');
  const { openStore } = await import('../src/store.mjs');
  const store = openStore(path.join(tmp(), 'store'));
  const twin = loadConfig(EXAMPLE);
  for (const file of ['supabase/migrations/20261103000000_bulk.sql', 'src/lib/leave/bulk.ts', 'docs/notes.md', 'next.config.ts']) {
    assert.equal(decideTier(store, [{ file }], twin.factory.autonomy, twin.policy).tier, 'auto', file);
  }
  const upstream = loadConfig(path.join(ROOT, 'examples', 'slug', 'control'));
  assert.equal(decideTier(store, [{ file: 'migrations/001.sql' }], upstream.factory.autonomy, upstream.policy).tier, 'two-humans');
  const noPolicy = { ...twin.policy, unattendedClasses: ['docs', 'code'] };
  assert.equal(decideTier(store, [{ file: 'supabase/migrations/1_x.sql' }], twin.factory.autonomy, noPolicy).tier, 'one-human',
    'without the AI policy listing migration as unattended, its auto tier is raised to one human');
});

// --- importer: PM requirement → task -------------------------------------------------------------------------------
const importer = (args) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'ac-to-task.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
const REQ = path.join(here, 'fixtures', 'ws9', 'requirement.md');

test('[P1.2] the importer turns PM acceptance criteria into a task the factory refuses until people decide the non-functionals', () => {
  const res = importer(['--file', REQ, '--ac', 'AC-BULK-01,AC-BULK-02,AC-BULK-03', '--id', 'bulk-db', '--holdout', 'bulk-db']);
  assert.equal(res.status, 0, res.stderr);
  const task = JSON.parse(res.stdout);
  assert.equal(task.title, 'масове рішення менеджера');
  assert.match(task.intent, /Why: Менеджер погоджує заявки по одній/);
  assert.deepEqual(task.requirements.map((r) => r.id), ['AC-BULK-01', 'AC-BULK-02', 'AC-BULK-03'], 'list item, issue checkbox with bold ID, numbered item');
  assert.match(task.requirements[1].description, /^Дано серед вибраних/);
  assert.deepEqual(task.requirements[0].verifiedBy, ['visible:AC-BULK-01', 'holdout:bulk-db']);
  assert.deepEqual(task.visibleTests.failToPass, ['AC-BULK-01', 'AC-BULK-02', 'AC-BULK-03']);
  assert.ok(Object.values(task.nonFunctionals).every((v) => v === 'TBD'));
});

test('[P1.2] the importer reads criteria written as table rows or as multi-line «Дано / Коли / Тоді» blocks', () => {
  const table = importer(['--file', path.join(here, 'fixtures', 'ws9', 'requirement-table.md'), '--ac', 'AC-REP-01,AC-REP-02', '--id', 'rep', '--format', 'table']);
  assert.equal(table.status, 0, table.stderr);
  assert.deepEqual(JSON.parse(table.stdout).requirements.map((r) => r.description), [
    'є три заявки за місяць · менеджер натискає «Експорт» · завантажується CSV з трьома рядками',
    'заявок немає · менеджер натискає «Експорт» · бачить «Немає даних за період»']);
  const block = importer(['--file', path.join(here, 'fixtures', 'ws9', 'requirement-block.md'), '--ac', 'AC-REM-01,AC-REM-02', '--id', 'rem', '--format', 'block']);
  assert.equal(block.status, 0, block.stderr);
  const [first, second] = JSON.parse(block.stdout).requirements.map((r) => r.description);
  assert.equal(first, 'Дано заявка починається завтра Коли настає 9:00 Тоді людина отримує лист-нагадування');
  assert.equal(second, 'Дано нагадування вже надіслано Коли настає 9:00 знову Тоді другого листа немає', 'the next heading ends the block');
  assert.equal(importer(['--file', REQ, '--ac', 'AC-BULK-01', '--id', 'x', '--format', 'nope']).status, 2);
});

test('[P1.2] the importer refuses criteria it cannot find, and HTML comments are not criteria', () => {
  const res = importer(['--file', REQ, '--ac', 'AC-BULK-09', '--id', 'x']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /не знайдено.*AC-BULK-09/);
});

test('[P1.2] with --target, pass-to-pass comes from implemented criteria that Vitest runs; e2e-only ones are flagged', () => {
  const target = gitRepo(path.join(tmp(), 'target'), {
    'docs/conformance.md': ['| AC | Опис | Код | Статус |', '|---|---|---|---|', '| AC-OLD-01 | x | y | реалізовано |',
      '| AC-OLD-02 | x | y | реалізовано |', '| AC-OLD-03 | x | y | заплановано |', ''].join('\n'),
    'tests/old.test.ts': 'it("AC-OLD-01: works", () => {});\nit("AC-BULK-01: red", () => {});\n',
    'tests/e2e/old.spec.ts': 'test("AC-OLD-02: only in the browser", async () => {});\n',
    'package.json': '{}\n',
  });
  const out = path.join(tmp(), 'task.json');
  const res = importer(['--file', REQ, '--ac', 'AC-BULK-01,AC-BULK-02', '--id', 'bulk', '--target', target, '--out', out]);
  assert.equal(res.status, 0, res.stderr);
  const task = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(task.visibleTests.passToPass, ['AC-OLD-01']);
  assert.match(res.stderr, /AC-BULK-02 не мають Vitest-тесту/);
  assert.match(res.stderr, /лише з e2e-тестами.*AC-OLD-02/);
  assert.deepEqual(task.protected, ['tests/**', 'package.json'], 'globs that match no file are dropped and reported');
});

// --- doctor: readiness that means something ------------------------------------------------------------------------
test('[P7.3] doctor is not ready when the test command reports no tests, or dependencies or the agent are missing', async () => {
  const { setupExample } = await import('../scripts/example.mjs');
  const { doctor } = await import('../src/doctor.mjs');
  const none = await setupExample({ mutateTarget: (t) => fs.rmSync(path.join(t, 'test'), { recursive: true, force: true }) });
  try {
    const r = await doctor({ controlDir: none.control, targetDir: none.target, storeDir: none.store });
    assert.equal(r.ok, false);
    assert.match(r.checks.find((c) => c.id === 'tests-ran').detail, /no tests/);
  } finally { none.cleanup(); }
  const deps = await setupExample({ approve: false, mutateTarget: (t) => fs.writeFileSync(path.join(t, 'package.json'), JSON.stringify({ name: 'x', devDependencies: { vitest: '5' } })) });
  try {
    const r = await doctor({ controlDir: deps.control, targetDir: deps.target, storeDir: deps.store });
    assert.equal(r.checks.find((c) => c.id === 'dependencies').ok, false);
    assert.equal(r.ok, false);
  } finally { deps.cleanup(); }
  const agent = await setupExample({ approve: false, mutateControl: (c) => {
    const f = path.join(c, 'factory.json');
    const fac = JSON.parse(fs.readFileSync(f, 'utf8'));
    fac.agent = { ...fac.agent, adapter: 'claude', executable: path.join(c, 'no-such-claude.exe') };
    fs.writeFileSync(f, JSON.stringify(fac));
  } });
  try {
    const r = await doctor({ controlDir: agent.control, targetDir: agent.target, storeDir: agent.store });
    const check = r.checks.find((c) => c.id === 'agent');
    assert.equal(check.ok, false, check.detail);
  } finally { agent.cleanup(); }
});

test('[P7.3] the stock example stays ready, with the course checks reported', async () => {
  const { setupExample } = await import('../scripts/example.mjs');
  const ex = await setupExample();
  try {
    assert.equal(ex.readiness.ok, true, JSON.stringify(ex.readiness.checks));
    assert.ok(ex.readiness.checks.some((c) => c.id === 'tests-ran' && c.ok));
  } finally { ex.cleanup(); }
});
