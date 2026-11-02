// Readiness (principle 7.3): before agents touch a target, its delivery basics must hold.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { openStore } from './store.mjs';
import { writeReadiness } from './pipeline.mjs';
import { createWorkspace, removeWorkspace } from './workspace.mjs';
import { runTestCommand } from './gates/deterministic.mjs';
import { probeConfinement } from './confine.mjs';
import { git, newId, resolveExecutable } from './util.mjs';
import { ghArgv } from './deliver.mjs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

export async function doctor({ controlDir, targetDir, storeDir }) {
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok, detail });
  const config = loadConfig(controlDir);
  const isGit = git(targetDir, ['rev-parse', '--is-inside-work-tree'], { allowFail: true }) === 'true';
  add('git', isGit, isGit ? 'target is a git repository (diffs, rollback, release branches)' : 'target is not a git repository');
  if (isGit) {
    const dirty = git(targetDir, ['status', '--porcelain'], { allowFail: true });
    add('clean', !dirty, dirty ? 'uncommitted changes: agents work from the last commit, so commit or stash first' : 'working tree clean');
  }
  const ci = ['.github/workflows', '.gitlab-ci.yml', 'azure-pipelines.yml', 'Jenkinsfile'].some((p) => fs.existsSync(path.join(targetDir, p)));
  add('ci', ci, ci ? 'CI configuration present' : 'no CI configuration found: changes would not be re-verified after release');
  for (const [name, cmd] of Object.entries(config.profile.commands)) {
    let ok = true;
    try { resolveExecutable(cmd.argv[0]); } catch { ok = false; }
    add(`command:${name}`, ok, ok ? `${cmd.argv[0]} is available` : `${cmd.argv[0]} not found`);
  }
  // Course edition: the target's dependencies, the agent's executable and, when delivery is configured, gh and the remote.
  for (const c of courseChecks(config, targetDir, isGit)) add(c.id, c.ok, c.detail);
  // Confinement is a claim about this machine's Node, so it is proven here rather than assumed from a version number.
  if (config.profile.confined) {
    const probe = await probeConfinement();
    add('confinement', probe.ok, probe.ok
      ? `Node ${process.version} confines the profile's commands to the workspace: outside reads and writes, links, child processes and node:sqlite are denied`
      : `Node ${process.version} does not confine the profile's commands to the workspace: ${probe.problems.join('; ')}`);
  }
  if (isGit && checks.every((c) => c.ok)) {
    const ws = path.join(os.tmpdir(), newId('factory-doctor'));
    try {
      createWorkspace(targetDir, ws);
      const a = await runTestCommand({ ws, profile: config.profile });
      const b = await runTestCommand({ ws, profile: config.profile });
      const sig = (r) => r.tests.map((t) => `${t.name}:${t.ok}`).sort().join('|') + `#${r.exitCode}`;
      add('deterministic-tests', sig(a) === sig(b), sig(a) === sig(b) ? `test outcomes identical across two runs (${a.tests.length} tests)` : 'test outcomes differ between runs: fix flaky tests before adding agents');
      // Course edition: «identical» is not «ran». Zero parsed tests, or none passing, means the test command is broken
      // (no node_modules, wrong path), and every gate built on it would judge nothing.
      if (a.parse === 'tap') {
        const passed = a.tests.filter((t) => t.ok && !t.skipped).length;
        add('tests-ran', a.tests.length > 0 && passed > 0, !a.tests.length
          ? `the test command reported no tests (exit ${a.exitCode}): check that it runs in a fresh checkout and prints TAP`
          : passed ? `${passed} of ${a.tests.length} tests pass at HEAD` : `none of the ${a.tests.length} tests passes at HEAD: are the dependencies installed?`);
      }
    } finally {
      removeWorkspace(targetDir, ws);
    }
  }
  const ok = checks.every((c) => c.ok);
  const record = { ok, target: path.resolve(targetDir), head: isGit ? git(targetDir, ['rev-parse', 'HEAD']) : null, checks };
  writeReadiness(openStore(storeDir), record);
  return record;
}

// Course edition (WS9) readiness checks, each reported with what to do about it.
function courseChecks(config, targetDir, isGit) {
  const out = [];
  const pkgFile = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgFile)) {
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')); } catch { /* an unreadable package.json is the tests' problem */ }
    const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }).length;
    if (deps) {
      const ok = fs.existsSync(path.join(targetDir, 'node_modules'));
      out.push({ id: 'dependencies', ok, detail: ok ? 'node_modules present (linked into each workspace)' : 'package.json declares dependencies but node_modules is missing: run npm ci in the target' });
    }
  }
  const agent = config.factory.agent;
  const exe = agent.adapter === 'claude' ? (agent.executable ?? 'claude') : agent.adapter === 'command' ? agent.command?.[0] : null;
  if (exe) {
    let resolved = null;
    let problem = '';
    try { resolved = resolveExecutable(exe); } catch (error) { problem = error.message; }
    if (resolved && !fs.existsSync(resolved)) problem = `${resolved} does not exist`;
    // On Windows an npm-installed CLI is an extensionless shell shim first on PATH: spawning it fails with ENOENT.
    if (resolved && process.platform === 'win32' && !/\.(exe|com)$/i.test(resolved)) {
      problem = `${resolved} is a shell shim, which cannot be spawned without a shell; install the native executable or set agent.executable to its full path`;
    }
    out.push({ id: 'agent', ok: !problem, detail: problem ? `agent executable: ${problem}` : `agent executable ${resolved}` });
  }
  const delivery = config.factory.delivery;
  if (delivery) {
    const [cmd, ...pre] = ghArgv(config);
    let ok = false;
    let detail;
    try {
      const res = spawnSync(resolveExecutable(cmd), [...pre, 'auth', 'status'], { cwd: targetDir, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
      ok = res.status === 0;
      detail = ok ? 'gh is installed and signed in (delivery: push, PR, merge)' : `gh auth status failed: ${(res.stderr || res.stdout || '').trim().split('\n')[0]}; run gh auth login`;
    } catch (error) { detail = `gh not found (${error.message}): install the GitHub CLI or remove delivery from factory.json`; }
    out.push({ id: 'delivery:gh', ok, detail });
    if (isGit) {
      const remote = delivery.remote ?? 'origin';
      const url = git(targetDir, ['remote', 'get-url', remote], { allowFail: true });
      out.push({ id: 'delivery:remote', ok: Boolean(url), detail: url ? `remote ${remote} → ${url}` : `the target has no git remote «${remote}» to push release branches to` });
    }
  }
  return out;
}
