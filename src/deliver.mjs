// Course edition (QuitCode WS9): delivery after release, and UAT after the deploy (principles 7.1, 7.2).
// Upstream stops at a local branch. Here a released run can go further, only as far as its autonomy tier allows:
//   deliver: push factory/<run> → open a PR whose body is the proof pack → turn on auto-merge when the tier allows it;
//   uat:     wait for the merge and the deploy of the merge commit → run the target's UAT for the run's AC IDs →
//            attach the report to the proof pack as a post-release addendum → a failing UAT records an incident,
//            which demotes the change classes (src/autonomy.mjs).
// The approved proof pack is never rewritten: its digest is what a human approved. The UAT result is a separate file.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { FactoryError, git, nowIso, resolveExecutable, runProcess } from './util.mjs';
import { appendEvent, loadRun, runDir, saveRun } from './store.mjs';
import { loadTask } from './task.mjs';
import { recordIncidentForRun } from './delivery.mjs';

export const ghArgv = (config) => config.factory.delivery?.gh ?? ['gh'];

// gh is spawned without a shell (argv array), from the target so that it infers the repository from the remote.
function gh(argv, args, cwd, { allowFail = false } = {}) {
  const [cmd, ...pre] = argv;
  const res = spawnSync(resolveExecutable(cmd), [...pre, ...args], { cwd, encoding: 'utf8', windowsHide: true, timeout: 180_000 });
  const out = { ok: res.status === 0, stdout: (res.stdout ?? '').trim(), stderr: (res.stderr ?? '').trim() || String(res.error?.message ?? '') };
  if (!out.ok && !allowFail) throw new FactoryError('GH', `gh ${args.slice(0, 2).join(' ')} failed: ${out.stderr || out.stdout}`);
  return out;
}

// Merge only what the autonomy tier already let through without a further human step (or, if configured, after the
// release approvals the tier demanded). A human merges everything else.
export function mergeDecision(run, delivery = {}) {
  const mode = delivery.autoMerge ?? 'auto-tier';
  if (mode === 'never') return { merge: false, reason: 'delivery.autoMerge is "never": a human merges the PR' };
  if (run.tier === 'auto') return { merge: true, reason: `tier auto: ${run.reason ?? 'every class touched is unattended'}` };
  const approvers = run.release?.approvers ?? [];
  if (mode === 'after-approval' && approvers.length) return { merge: true, reason: `tier ${run.tier} satisfied by ${approvers.join(', ')}` };
  return { merge: false, reason: `tier ${run.tier}: the PR waits for a human to merge it (delivery.autoMerge is "${mode}")` };
}

function requirementIds(run) {
  try {
    const { task, digest } = loadTask(run.controlDir, run.taskId);
    return { ids: task.requirements.map((r) => r.id), changed: digest !== run.taskDigest };
  } catch { return { ids: [], changed: true }; }
}

export function deliver({ store, runId, config }) {
  const run = loadRun(store, runId);
  if (run.state !== 'released') throw new FactoryError('STATE', `run ${runId} is ${run.state}; only a released run can be delivered`);
  if (run.unsafe?.length) throw new FactoryError('UNSAFE', `run ${runId} switched off ${run.unsafe.join(', ')} and can never be delivered`);
  if (run.delivery?.pr) throw new FactoryError('STATE', `run ${runId} was already delivered as ${run.delivery.pr}`);
  const delivery = config.factory.delivery;
  if (!delivery) throw new FactoryError('CONFIG', 'factory.json has no delivery section: the release stays on its local branch');
  const argv = ghArgv(config);
  const remote = delivery.remote ?? 'origin';
  const base = delivery.base ?? 'main';
  const method = delivery.mergeMethod ?? 'squash';
  const branch = run.release.branch;
  const cwd = run.targetDir;

  git(cwd, ['push', '-u', remote, branch]);
  appendEvent(store, runId, 'pushed', { remote, branch, commit: run.release.commit });
  const proofFile = path.join(runDir(store, runId), 'proof-pack.md');
  const created = gh(argv, ['pr', 'create', '--base', base, '--head', branch, '--title', `${run.taskTitle} [${run.taskId}]`, '--body-file', proofFile], cwd);
  const pr = created.stdout.match(/https?:\/\/\S+\/pull\/\d+/g)?.at(-1) ?? created.stdout.split('\n').at(-1);

  const decision = mergeDecision(run, delivery);
  const record = { remote, base, branch, pr, at: nowIso(), mergeMethod: method, autoMerge: decision.merge, reason: decision.reason, mergeState: 'open' };
  if (decision.merge) {
    let res = gh(argv, ['pr', 'merge', pr, '--auto', `--${method}`], cwd, { allowFail: true });
    // With nothing left to wait for (no required checks pending), GitHub refuses auto-merge; merge directly then.
    if (!res.ok && /clean status|not in the correct state|already mergeable/i.test(res.stderr)) res = gh(argv, ['pr', 'merge', pr, `--${method}`], cwd, { allowFail: true });
    if (res.ok) {
      record.mergeState = 'auto-merge-on';
      const view = gh(argv, ['pr', 'view', pr, '--json', 'state,mergeCommit'], cwd, { allowFail: true });
      try {
        const v = JSON.parse(view.stdout);
        if (v.state === 'MERGED') { record.mergeState = 'merged'; record.mergeCommit = v.mergeCommit?.oid ?? null; }
      } catch { /* the state is refreshed by factory uat */ }
    } else {
      record.mergeState = 'auto-merge-failed';
      record.error = res.stderr.split('\n')[0];
    }
  }
  run.delivery = record;
  saveRun(store, run);
  appendEvent(store, runId, 'delivered', record);
  return run;
}

// Poll fn() until it returns a truthy value or the deadline passes.
async function poll(fn, { timeoutMs, everyMs }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() >= deadline) return null;
    await sleep(everyMs);
  }
}

async function deployedSha(url) {
  try {
    const res = await fetch(url, { redirect: 'manual', headers: { 'cache-control': 'no-cache' } });
    return (await res.json()).sha ?? null;
  } catch { return null; }
}

export async function uat({ store, runId, config, by, url, cwd, grep, timeoutMs = 30 * 60_000, everyMs = 15_000, comment = true, log = () => {} }) {
  const run = loadRun(store, runId);
  if (run.state !== 'released') throw new FactoryError('STATE', `run ${runId} is ${run.state}, not released`);
  if (!run.delivery?.pr) throw new FactoryError('STATE', `run ${runId} has no PR yet: factory deliver ${runId} first`);
  const delivery = config.factory.delivery ?? {};
  const base = (url ?? delivery.uatUrl ?? '').replace(/\/+$/, '');
  if (!base) throw new FactoryError('USAGE', 'missing --url (or delivery.uatUrl): the deployed app to test');
  const argv = ghArgv(config);
  const target = run.targetDir;

  // 1. The PR must be merged: UAT checks what users get, not a branch.
  log(`waiting for ${run.delivery.pr} to be merged`);
  const merged = await poll(() => {
    const v = gh(argv, ['pr', 'view', run.delivery.pr, '--json', 'state,mergeCommit'], target, { allowFail: true });
    try {
      const s = JSON.parse(v.stdout);
      if (s.state === 'CLOSED') throw new FactoryError('STATE', `${run.delivery.pr} was closed without merging`);
      return s.state === 'MERGED' ? s : null;
    } catch (error) { if (error instanceof FactoryError) throw error; return null; }
  }, { timeoutMs, everyMs });
  if (!merged) throw new FactoryError('TIMEOUT', `${run.delivery.pr} is not merged yet; run factory uat again later`);
  const sha = merged.mergeCommit?.oid ?? null;
  run.delivery = { ...run.delivery, mergeState: 'merged', mergeCommit: sha };
  saveRun(store, run);

  // 2. The deploy must serve the merge commit (the health route reports the build's commit).
  const healthPath = delivery.healthPath ?? '/api/health';
  let deployed = null;
  if (healthPath && sha) {
    log(`waiting for ${base}${healthPath} to report ${sha.slice(0, 12)}`);
    deployed = await poll(async () => ((await deployedSha(base + healthPath)) === sha ? sha : null), { timeoutMs, everyMs });
    if (!deployed) throw new FactoryError('TIMEOUT', `${base}${healthPath} does not report the merge commit ${sha.slice(0, 12)} yet; is the deploy finished?`);
  }

  // 3. The target's own UAT, filtered to this run's requirements (Playwright --grep on titles that start with the AC ID).
  const { ids, changed } = requirementIds(run);
  const pattern = grep ?? ids.join('|');
  if (!pattern) throw new FactoryError('USAGE', 'no AC IDs to test: pass --grep "<AC-…|AC-…>"');
  const [cmd, ...pre] = delivery.uatCommand ?? ['node', 'scripts/uat/run.mjs'];
  log(`running UAT for ${pattern} on ${base}`);
  const res = await runProcess({ command: cmd, args: [...pre, '--url', base, '--grep', pattern], cwd: cwd ?? target, env: process.env, timeoutMs: 60 * 60_000 });
  const output = `${res.stdout}\n${res.stderr}`;
  const report = [...output.matchAll(/Звіт:\s*(\S*report\.md)/g)].at(-1)?.[1] ?? null;
  const passed = res.exitCode === 0;

  // 4. The addendum: next to the proof pack, never inside it (the approved digest stays valid).
  const lines = [
    `# UAT після розгортання · ${run.taskTitle}`,
    '',
    '> Додаток до proof pack, записаний після злиття. Він не входить у затверджений дайджест proof pack.',
    '',
    `- Прогін \`${run.id}\` · PR ${run.delivery.pr} · коміт злиття \`${sha ?? 'невідомо'}\``,
    `- Застосунок ${base}${deployed ? ` (${healthPath} показує цей коміт)` : ''}`,
    `- Критерії: ${pattern}${changed ? ' (увага: файл задачі змінився після прогону)' : ''}`,
    `- Результат: **${passed ? 'PASS' : 'FAIL'}** (код виходу ${res.exitCode ?? res.status})`,
    `- Звіт UAT: ${report ? `\`${report}\`` : 'не знайдено у виводі'}`,
    `- Записано ${nowIso()}${by ? ` · ${by}` : ''}`,
    '',
  ];
  const addendum = path.join(runDir(store, runId), 'uat.md');
  fs.writeFileSync(addendum, lines.join('\n'));
  fs.writeFileSync(path.join(runDir(store, runId), 'uat-output.txt'), output);
  run.uat = { at: nowIso(), url: base, sha, grep: pattern, exitCode: res.exitCode, passed, report, addendum: 'uat.md' };
  if (comment) {
    const c = gh(argv, ['pr', 'comment', run.delivery.pr, '--body-file', addendum], target, { allowFail: true });
    run.uat.commented = c.ok;
  }
  saveRun(store, run);
  appendEvent(store, runId, 'uat', run.uat);

  // 5. An escaped defect: the factory's evidence said yes, users' behaviour says no. Demote what this change touched.
  let incident = null;
  if (!passed) incident = recordIncidentForRun({ store, runId, by: by ?? 'factory-uat', summary: `UAT failed after deploy${report ? `: ${report}` : ''}` }).incident;
  return { run: loadRun(store, runId), passed, report, incident, output };
}
