// A stand-in for the GitHub CLI in tests (spawned as `node fake-gh.mjs …`, so it works on Windows without a shim).
// Every call is appended to FAKE_GH_LOG as a JSON line. Behaviour is chosen by environment variables:
//   FAKE_GH_MERGE=clean   `pr merge --auto` fails as GitHub does when nothing is left to wait for
//   FAKE_GH_STATE         state reported by `pr view` (default OPEN); FAKE_GH_OID is its merge commit
//   FAKE_GH_AUTH=fail     `auth status` fails
import fs from 'node:fs';

const args = process.argv.slice(2);
if (process.env.FAKE_GH_LOG) fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\n');
const [group, sub] = args;
const fail = (msg) => { process.stderr.write(msg + '\n'); process.exitCode = 1; };

if (group === 'auth' && sub === 'status') {
  if (process.env.FAKE_GH_AUTH === 'fail') fail('You are not logged into any GitHub hosts.');
} else if (group === 'pr' && sub === 'create') {
  process.stdout.write('Creating pull request\nhttps://github.com/example/twin/pull/7\n');
} else if (group === 'pr' && sub === 'merge') {
  if (process.env.FAKE_GH_MERGE === 'clean' && args.includes('--auto')) fail('GraphQL: Pull request is in clean status (enablePullRequestAutoMerge)');
} else if (group === 'pr' && sub === 'view') {
  process.stdout.write(JSON.stringify({ state: process.env.FAKE_GH_STATE ?? 'OPEN', mergeCommit: process.env.FAKE_GH_OID ? { oid: process.env.FAKE_GH_OID } : null }));
} else if (group === 'pr' && sub === 'comment') {
  process.stdout.write('https://github.com/example/twin/pull/7#issuecomment-1\n');
} else {
  fail(`fake gh: unsupported ${args.join(' ')}`);
}
