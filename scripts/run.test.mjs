// Tests for the capture script. Run with: node --test scripts/run.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run.mjs');
const identity = {
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
};

// A throwaway git repo with one committed file.
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...identity }, stdio: 'ignore' });
  git('init', '-q');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  const devflow = (...args) => {
    const r = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const ledger = (task) => JSON.parse(fs.readFileSync(path.join(dir, '.devflow', task, 'ledger.json'), 'utf8'));
  return { dir, devflow, ledger };
}

const pass = ['--', 'node', '-e', '"process.exit(0)"'];
const fail = ['--', 'node', '-e', '"process.exit(3)"'];

test('init creates a ledger with only the steps the tier owes', () => {
  const { dir, devflow, ledger } = repo();
  assert.equal(devflow('init', 'copy-fix', '--tier', '1').code, 0);
  const steps = ledger('copy-fix').entries.map((e) => e.step);
  assert.deepEqual(steps, [1, 8, 10, 11, 20, 24]);
  assert.match(fs.readFileSync(path.join(dir, '.git', 'info', 'exclude'), 'utf8'), /^\.devflow\/$/m);
  assert.equal(devflow('init', 'copy-fix', '--tier', '1').code, 2, 'refuses to overwrite a ledger');
});

test('run records the command, exit code and a log, and passes the failure on', () => {
  const { dir, devflow, ledger } = repo();
  devflow('init', 't', '--tier', '1');
  assert.equal(devflow('run', '8', '--label', 'green', ...pass).code, 0);
  assert.equal(devflow('run', '20', '--label', 'secrets', ...fail).code, 1);
  const entries = ledger('t').entries;
  const green = entries.find((e) => e.step === 8).runs[0];
  assert.equal(green.exitCode, 0);
  assert.match(green.tree, /^[0-9a-f]{40}$/);
  assert.ok(fs.existsSync(path.join(dir, '.devflow', 't', green.log)));
  assert.equal(entries.find((e) => e.step === 20).runs[0].exitCode, 3);
  assert.match(devflow('status').out, /20\s+security\s+failed/);
});

test('a step with required checks stays pending until every check has run', () => {
  const { dir, devflow } = repo();
  const ok = 'node -e "process.exit(0)"';
  fs.writeFileSync(path.join(dir, 'devflow.config.json'), JSON.stringify({
    checks: { test: ok, typecheck: ok, build: ok, lint: null },
  }));
  devflow('init', 't', '--tier', '1');
  devflow('run', '11', '--check', 'test');
  assert.match(devflow('status').out, /11\s+regression\s+pending/);
  for (const check of ['typecheck', 'build']) devflow('run', '11', '--check', check);
  assert.match(devflow('status').out, /11\s+regression\s+pending/, 'the built-in integrity check is still owed');
  assert.equal(devflow('run', '11', '--builtin', 'integrity').code, 0);
  assert.match(devflow('status').out, /11\s+regression\s+passed/, 'lint is declared absent with null, so it is not owed');
  assert.equal(devflow('run', '11', '--check', 'coverage').code, 2, 'unknown check is an error');
});

test('editing code after a run makes the evidence stale and blocks the gate', () => {
  const { dir, devflow } = repo();
  devflow('init', 't', '--tier', '1');
  devflow('run', '8', '--label', 'green', ...pass);
  assert.match(devflow('status').out, /8\s+implement\s+passed/);
  fs.writeFileSync(path.join(dir, 'app.txt'), 'two\n');
  const gate = devflow('status', '--gate');
  assert.match(gate.out, /8\s+implement\s+stale/);
  assert.equal(gate.code, 1);
});

test('a test shown failing first passes by failing, and does not go stale', () => {
  const { dir, devflow } = repo();
  devflow('init', 't', '--tier', '1');
  assert.equal(devflow('run', '8', '--label', 'red', '--expect-fail', ...fail).code, 0);
  assert.equal(devflow('run', '8', '--label', 'red-wrong', '--expect-fail', ...pass).code, 1, 'a test that passes before the code exists proves nothing');
  assert.match(devflow('status').out, /8\s+implement\s+failed/);
  devflow('run', '8', '--label', 'red-wrong', '--expect-fail', ...fail);
  fs.writeFileSync(path.join(dir, 'app.txt'), 'implemented\n');
  devflow('run', '8', '--label', 'green', ...pass);
  assert.match(devflow('status').out, /8\s+implement\s+passed/, 'the red runs predate the code and still count');
});

test('judged steps need an artefact, script steps cannot be recorded by hand', () => {
  const { dir, devflow } = repo();
  devflow('init', 't', '--tier', '1');
  assert.equal(devflow('record', '8', 'passed', '--artefact', 'app.txt').code, 2);
  assert.equal(devflow('record', '1', 'passed', '--artefact', 'missing.md').code, 2);
  fs.mkdirSync(path.join(dir, '.devflow', 't'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.devflow', 't', 'spec.md'), '# spec\n');
  assert.equal(devflow('record', '1', 'passed', '--artefact', '.devflow/t/spec.md').code, 0);
  assert.match(devflow('status').out, /1\s+spec\s+passed/);
});

test('marking a step needs a reason, and the gate is clean only when nothing is pending', () => {
  const { dir, devflow } = repo();
  devflow('init', 't', '--tier', '1');
  assert.equal(devflow('mark', '10', 'n/a').code, 2);
  assert.equal(devflow('status', '--gate').code, 1);
  fs.writeFileSync(path.join(dir, '.devflow', 't', 'note.md'), 'evidence\n');
  for (const step of ['1', '24']) devflow('record', step, 'passed', '--artefact', '.devflow/t/note.md');
  devflow('run', '8', '--label', 'green', ...pass);
  devflow('mark', '10', 'n/a', '--reason', 'docs only');
  devflow('mark', '11', 'not-run', '--reason', 'no test suite yet');
  for (const check of ['secrets', 'deps', 'newdeps']) assert.equal(devflow('run', '20', '--builtin', check).code, 0);
  const gate = devflow('status', '--gate');
  assert.equal(gate.code, 0, gate.out);
  assert.match(gate.out, /Not run, to be stated in the ship report: 11/);
});
