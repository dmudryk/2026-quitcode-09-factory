// Course edition (WS9): delivery after release and UAT after the deploy, with a fake GitHub CLI and a local
// bare repository as the remote. Nothing here touches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupExample } from '../scripts/example.mjs';
import { startRun } from '../src/pipeline.mjs';
import { openStore, loadRun, runDir } from '../src/store.mjs';
import { loadConfig } from '../src/config.mjs';
import { autonomyState } from '../src/autonomy.mjs';
import { deliver, uat, mergeDecision } from '../src/deliver.mjs';
import { doctor } from '../src/doctor.mjs';
import { main } from '../src/cli.mjs';
import { git, sha256 } from '../src/util.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE_GH = path.join(here, 'fixtures', 'fake-gh.mjs');
const FAKE_UAT = path.join(here, 'fixtures', 'fake-uat.mjs');
const quiet = async (fn) => { const log = console.log; const err = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = log; console.error = err; } };

// The slug example with a delivery section, a bare remote, and the slug already shipped so that a docs task can run.
async function released({ builder = 'docs', task = 'readme', autoMerge = 'auto-tier', approveAs } = {}) {
  const ex = await setupExample({
    mutateControl: (c) => {
      const f = path.join(c, 'factory.json');
      const fac = JSON.parse(fs.readFileSync(f, 'utf8'));
      fac.delivery = { remote: 'origin', base: 'main', mergeMethod: 'squash', autoMerge, gh: [process.execPath, FAKE_GH],
        uatCommand: [process.execPath, FAKE_UAT], healthPath: '/api/health' };
      fs.writeFileSync(f, JSON.stringify(fac));
    },
    mutateTarget: (t, c) => { if (task === 'readme') fs.copyFileSync(path.join(c, 'candidates', 'honest.mjs'), path.join(t, 'slug.mjs')); },
  });
  const log = path.join(ex.dir, 'gh.jsonl');
  process.env.FAKE_GH_LOG = log;
  const origin = path.join(ex.dir, 'origin.git');
  git(ex.dir, ['init', '-q', '--bare', origin]);
  git(ex.target, ['remote', 'add', 'origin', origin]);
  git(ex.target, ['push', '-q', 'origin', 'main']);
  // The readiness check ran before the remote existed; with delivery configured, it needs the remote.
  const ready = await doctor({ controlDir: ex.control, targetDir: ex.target, storeDir: ex.store });
  assert.equal(ready.ok, true, JSON.stringify(ready.checks.filter((c) => !c.ok)));
  fs.rmSync(log, { force: true });
  const store = openStore(ex.store);
  const started = await startRun({ controlDir: ex.control, targetDir: ex.target, storeDir: ex.store, taskId: task, requestedBy: 'alice', scripted: { builder } });
  let run = loadRun(store, started.id);
  if (approveAs) {
    assert.equal(await quiet(() => main(['approve', 'release', run.id, '--store', ex.store, '--as', approveAs, '--proof', run.proofDigest])), 0);
    run = loadRun(store, run.id);
  }
  assert.equal(run.state, 'released', run.reason);
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).args) : []);
  return { ex, store, run, origin, calls, config: loadConfig(ex.control) };
}
const env = (vars) => { for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
const reset = () => env({ FAKE_GH_MERGE: undefined, FAKE_GH_STATE: undefined, FAKE_GH_OID: undefined, FAKE_GH_AUTH: undefined, FAKE_UAT_EXIT: undefined, FAKE_UAT_LOG: undefined });

test('[P7.1][P7.2] an auto-tier release is pushed, opened as a PR with the proof pack as its body, and set to auto-merge', async () => {
  reset();
  const { ex, store, run, origin, calls, config } = await released();
  try {
    assert.equal(run.tier, 'auto');
    const done = deliver({ store, runId: run.id, config });
    assert.equal(git(origin, ['rev-parse', run.release.branch]), run.release.commit, 'the release branch reached the remote');
    const [create, merge, view] = calls();
    assert.deepEqual(create.slice(0, 6), ['pr', 'create', '--base', 'main', '--head', run.release.branch]);
    assert.equal(create[create.indexOf('--body-file') + 1], path.join(runDir(store, run.id), 'proof-pack.md'));
    assert.deepEqual(merge, ['pr', 'merge', 'https://github.com/example/twin/pull/7', '--auto', '--squash']);
    assert.deepEqual(view.slice(0, 2), ['pr', 'view']);
    assert.equal(done.delivery.pr, 'https://github.com/example/twin/pull/7');
    assert.equal(done.delivery.autoMerge, true);
    assert.equal(done.delivery.mergeState, 'auto-merge-on');
    assert.equal(loadRun(store, run.id).delivery.mergeState, 'auto-merge-on', 'the delivery is recorded in the run store');
    assert.throws(() => deliver({ store, runId: run.id, config }), /already delivered/);
  } finally { ex.cleanup(); }
});

test('[P7.1][P5.3] a release that needed a human approval is opened as a PR but never auto-merged in auto-tier mode', async () => {
  reset();
  const { ex, store, run, calls, config } = await released({ builder: 'honest', task: 'slug', approveAs: 'bob' });
  try {
    assert.equal(run.tier, 'one-human');
    const done = deliver({ store, runId: run.id, config });
    assert.deepEqual(calls().map((a) => a.slice(0, 2).join(' ')), ['pr create']);
    assert.equal(done.delivery.autoMerge, false);
    assert.match(done.delivery.reason, /waits for a human/);
    assert.equal(mergeDecision(done, { autoMerge: 'after-approval' }).merge, true, 'after-approval merges once the approvals the tier needed exist');
    assert.equal(mergeDecision({ ...done, tier: 'auto' }, { autoMerge: 'never' }).merge, false, 'never means a human always merges');
  } finally { ex.cleanup(); }
});

test('[P7.2] only a released run is delivered, and only with a delivery configuration', async () => {
  reset();
  const { ex, store, run, config } = await released();
  try {
    assert.throws(() => deliver({ store, runId: run.id, config: { ...config, factory: { ...config.factory, delivery: undefined } } }), /no delivery section/);
    // The slug is already shipped in this target, so a slug run is refused at admission: not released, not deliverable.
    const other = await startRun({ controlDir: ex.control, targetDir: ex.target, storeDir: ex.store, taskId: 'slug', requestedBy: 'alice', scripted: { builder: 'honest' } });
    const p = loadRun(store, other.id);
    assert.notEqual(p.state, 'released');
    assert.throws(() => deliver({ store, runId: p.id, config }), /only a released run/);
  } finally { ex.cleanup(); }
});

test('[P7.2] when nothing is left to wait for, auto-merge falls back to a direct merge', async () => {
  reset();
  env({ FAKE_GH_MERGE: 'clean', FAKE_GH_STATE: 'MERGED', FAKE_GH_OID: 'abc123' });
  const { ex, store, run, calls, config } = await released();
  try {
    const done = deliver({ store, runId: run.id, config });
    const merges = calls().filter((a) => a[1] === 'merge');
    assert.equal(merges.length, 2);
    assert.ok(!merges[1].includes('--auto'));
    assert.equal(done.delivery.mergeState, 'merged');
    assert.equal(done.delivery.mergeCommit, 'abc123');
  } finally { reset(); ex.cleanup(); }
});

test('[P7.3] with delivery configured, doctor checks that gh is signed in and the remote exists', async () => {
  reset();
  const { ex, config } = await released();
  try {
    let r = await doctor({ controlDir: ex.control, targetDir: ex.target, storeDir: ex.store });
    assert.ok(r.checks.find((c) => c.id === 'delivery:gh').ok);
    assert.ok(r.checks.find((c) => c.id === 'delivery:remote').ok);
    env({ FAKE_GH_AUTH: 'fail' });
    git(ex.target, ['remote', 'remove', 'origin']);
    r = await doctor({ controlDir: ex.control, targetDir: ex.target, storeDir: ex.store });
    assert.equal(r.ok, false);
    assert.match(r.checks.find((c) => c.id === 'delivery:gh').detail, /gh auth login/);
    assert.equal(r.checks.find((c) => c.id === 'delivery:remote').ok, false);
    assert.ok(config.factory.delivery);
  } finally { reset(); ex.cleanup(); }
});

// A deployed app whose health route reports the merge commit.
async function healthServer(sha) {
  const server = http.createServer((req, res) => {
    res.writeHead(req.url === '/api/health' ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sha }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

test('[P7.2] after the merge is deployed, UAT runs for the run\'s AC IDs and its report is attached beside the approved proof pack', async () => {
  reset();
  const { ex, store, run, calls, config } = await released();
  const app = await healthServer('feedface');
  try {
    deliver({ store, runId: run.id, config });
    const proofBefore = sha256(fs.readFileSync(path.join(runDir(store, run.id), 'proof-pack.md'), 'utf8'));
    const uatLog = path.join(ex.dir, 'uat-args.json');
    env({ FAKE_GH_STATE: 'MERGED', FAKE_GH_OID: 'feedface', FAKE_UAT_LOG: uatLog });
    const r = await uat({ store, runId: run.id, config, by: 'alice', url: `${app.url}/`, cwd: ex.target, everyMs: 10, timeoutMs: 5000 });
    assert.equal(r.passed, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(uatLog, 'utf8')), ['--url', app.url, '--grep', 'R1']);
    assert.equal(r.report, 'docs/qa/uat/2026-11-03/report.md');
    const after = loadRun(store, run.id);
    assert.equal(after.delivery.mergeState, 'merged');
    assert.equal(after.uat.sha, 'feedface');
    const addendum = fs.readFileSync(path.join(runDir(store, run.id), 'uat.md'), 'utf8');
    assert.match(addendum, /PASS/);
    assert.match(addendum, /docs\/qa\/uat\/2026-11-03\/report\.md/);
    assert.equal(sha256(fs.readFileSync(path.join(runDir(store, run.id), 'proof-pack.md'), 'utf8')), proofBefore, 'the approved proof pack is never rewritten');
    assert.ok(calls().some((a) => a[0] === 'pr' && a[1] === 'comment'), 'the UAT result is posted on the PR');
    assert.equal(autonomyState(store).docs?.demoted ?? false, false);
  } finally { app.close(); reset(); ex.cleanup(); }
});

test('[P7.1][P7.2] a failing UAT after the deploy records an incident and demotes the classes the change touched', async () => {
  reset();
  const { ex, store, run, config } = await released();
  const app = await healthServer('c0ffee');
  try {
    deliver({ store, runId: run.id, config });
    env({ FAKE_GH_STATE: 'MERGED', FAKE_GH_OID: 'c0ffee', FAKE_UAT_EXIT: '1' });
    const code = await quiet(() => main(['uat', run.id, '--store', ex.store, '--as', 'alice', '--url', app.url, '--cwd', ex.target, '--no-comment']));
    assert.equal(code, 1);
    const after = loadRun(store, run.id);
    assert.equal(after.uat.passed, false);
    assert.equal(after.uat.commented, undefined);
    assert.equal(autonomyState(store).docs.demoted, true, 'the next docs change needs a human again');
    assert.match(fs.readFileSync(store.incidents, 'utf8'), /UAT failed after deploy/);
  } finally { app.close(); reset(); ex.cleanup(); }
});

test('[P7.2] UAT waits for the deploy of the merge commit and gives up when the app serves an older build', async () => {
  reset();
  const { ex, store, run, config } = await released();
  const app = await healthServer('old-build');
  try {
    deliver({ store, runId: run.id, config });
    env({ FAKE_GH_STATE: 'MERGED', FAKE_GH_OID: 'new-build' });
    await assert.rejects(uat({ store, runId: run.id, config, by: 'alice', url: app.url, cwd: ex.target, everyMs: 10, timeoutMs: 200 }), /does not report the merge commit/);
    assert.equal(loadRun(store, run.id).uat, undefined, 'no UAT verdict on a build that is not the merged change');
  } finally { app.close(); reset(); ex.cleanup(); }
});
