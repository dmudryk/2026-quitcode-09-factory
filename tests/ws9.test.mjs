// Course edition (QuitCode WS9): tests for what this edition adds to principled-factory for a Next.js + Vitest stack.
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
