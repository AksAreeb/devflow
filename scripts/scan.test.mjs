// Tests for the built-in checks. Run with: node --test scripts/scan.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scan.mjs');
const identity = {
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
};

// A throwaway repo whose first commit holds the given files.
function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-scan-'));
  const write = (name, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  };
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...identity }, stdio: 'ignore' });
  git('init', '-q');
  for (const [name, content] of Object.entries(files)) write(name, content);
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  const scan = (check) => {
    const r = spawnSync(process.execPath, [script, check], { cwd: dir, encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  return { dir, write, scan, remove: (name) => fs.rmSync(path.join(dir, name)) };
}

// Built at run time so this file never contains something that looks like a real key.
const fakeAwsKey = 'AKIA' + 'Q'.repeat(16);

test('secrets: flags a key in new code, ignores placeholders and env lookups', () => {
  const { write, scan } = repo({ 'app.js': 'export const one = 1;\n' });
  assert.equal(scan('secrets').code, 0);
  write('config.js', `const apiKey = "your-api-key-goes-here-xxxx";\nconst token = process.env.TOKEN;\n`);
  assert.equal(scan('secrets').code, 0);
  write('leak.js', `const key = "${fakeAwsKey}";\n`);
  const found = scan('secrets');
  assert.equal(found.code, 1);
  assert.match(found.out, /leak\.js:1\s+AWS access key/);
  assert.doesNotMatch(found.out, new RegExp(fakeAwsKey), 'the secret itself is not echoed');
});

test('newdeps: a new dependency needs approval and a lockfile change', () => {
  const pkg = (deps) => JSON.stringify({ name: 'x', dependencies: deps });
  const { write, scan } = repo({ 'package.json': pkg({ zod: '^3.0.0' }), 'package-lock.json': '{}\n' });
  assert.equal(scan('newdeps').code, 0);
  write('package.json', pkg({ zod: '^3.0.0', 'left-pad': '^1.3.0' }));
  const found = scan('newdeps');
  assert.equal(found.code, 1);
  assert.match(found.out, /new dependency "left-pad" is not approved/);
  assert.match(found.out, /no lockfile changed/);
  write('package-lock.json', '{"updated":true}\n');
  write('devflow.config.json', JSON.stringify({ approvedDependencies: ['left-pad'] }));
  assert.equal(scan('newdeps').code, 0);
});

test('integrity: flags weakened tests, skips, snapshots and suppressions', () => {
  const { write, scan, remove } = repo({
    'sum.test.js': "test('adds', () => {\n  expect(sum(1, 2)).toBe(3);\n});\n",
    'old.test.js': "test('old', () => { expect(1).toBe(1); });\n",
    '__snapshots__/page.snap': 'one\n',
    'sum.js': 'export const sum = (a, b) => a + b;\n',
  });
  assert.equal(scan('integrity').code, 0);
  write('new.test.js', "test('new', () => { expect(2).toBe(2); });\n");
  assert.equal(scan('integrity').code, 0, 'adding a test is fine');

  write('sum.test.js', "test.skip('adds', () => {\n  expect(sum(1, 2)).toBe(4);\n});\n");
  remove('old.test.js');
  write('__snapshots__/page.snap', 'two\n');
  write('sum.js', '// @ts-ignore\nexport const sum = (a, b) => a + b;\n');
  const found = scan('integrity');
  assert.equal(found.code, 1);
  assert.match(found.out, /old\.test\.js: test file deleted/);
  assert.match(found.out, /page\.snap: snapshot changed/);
  assert.match(found.out, /sum\.test\.js: 1 assertion line\(s\) removed or changed, 1 added/);
  assert.match(found.out, /sum\.test\.js:1\s+test skipped or focused/);
  assert.match(found.out, /sum\.js:1\s+new suppression/);
});

test('deps: a repo with no lockfile has nothing to audit', () => {
  const { scan } = repo({ 'app.js': 'export const one = 1;\n' });
  const result = scan('deps');
  assert.equal(result.code, 0);
  assert.match(result.out, /no supported lockfile/);
});
