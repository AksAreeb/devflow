// Tests for lessons: what a failed step taught, carried into later tasks.
// Run with: node --test scripts/lessons.test.mjs
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

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-lessons-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...identity }, stdio: 'ignore' });
  git('init', '-q');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  const devflow = (...args) => {
    const r = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  return { dir, devflow };
}

const pass = ['--', 'node', '-e', '"process.exit(0)"'];
const fail = ['--', 'node', '-e', '"process.exit(3)"'];
const advice = 'Run git fetch and branch from the remote base before the audit.';

test('a step that failed and was then fixed still blocks the gate until its lesson is recorded', () => {
  const { devflow } = repo();
  devflow('init', 't', '--tier', '1');
  devflow('mark', '1', 'n/a', '--reason', 'not what this test is about');
  devflow('run', '8', '--label', 'diff', ...fail);
  assert.equal(devflow('run', '8', '--label', 'diff', ...pass).code, 0);
  const blocked = devflow('status', '--gate', '--through', '8');
  assert.equal(blocked.code, 1);
  assert.match(blocked.out, /step 8 .* failed 1 time\(s\) during this task: record what to do differently/);

  assert.equal(devflow('lesson', '8', '--text', 'too short').code, 2, 'a lesson is a full sentence');
  assert.equal(devflow('lesson', '8', '--text', advice).code, 0);
  const clean = devflow('status', '--gate', '--through', '8');
  assert.equal(clean.code, 0, clean.out);
  assert.match(clean.out, /Gate: clean/);
});

test('a slip with nothing to teach is settled with a reason and leaves no lesson behind', () => {
  const { devflow } = repo();
  devflow('init', 't', '--tier', '1');
  devflow('mark', '1', 'n/a', '--reason', 'not what this test is about');
  devflow('run', '8', '--label', 'diff', ...fail);
  devflow('run', '8', '--label', 'diff', ...pass);
  assert.equal(devflow('lesson', '8', '--none').code, 2, 'the reason is required');
  assert.equal(devflow('lesson', '8', '--none', '--reason', 'typo in the command').code, 0);
  assert.equal(devflow('status', '--gate', '--through', '8').code, 0);
  assert.match(devflow('lessons').out, /No lessons recorded/);
});

test('a step that never failed owes no lesson, and a test shown failing on purpose is not a failure', () => {
  const { devflow } = repo();
  devflow('init', 't', '--tier', '1');
  devflow('mark', '1', 'n/a', '--reason', 'not what this test is about');
  assert.equal(devflow('run', '8', '--label', 'new-test', '--expect-fail', ...fail).code, 0);
  devflow('run', '8', '--label', 'diff', ...pass);
  assert.equal(devflow('status', '--gate', '--through', '8').code, 0);
});

test('lessons are shown when the next task starts and when the same step fails again', () => {
  const { devflow } = repo();
  devflow('init', 'first', '--tier', '1');
  devflow('run', '20', '--label', 'deps', ...fail);
  devflow('lesson', '20', '--text', advice);
  devflow('lesson', '20', '--text', advice);
  assert.equal(devflow('lessons').out.split(advice).length - 1, 1, 'the same lesson is stored once');

  const started = devflow('init', 'second', '--tier', '1');
  assert.match(started.out, /Lessons from earlier tasks in this repo/);
  assert.ok(started.out.includes(`step 20: ${advice}  (from "first")`));

  const passing = devflow('run', '20', '--label', 'deps', ...pass);
  assert.doesNotMatch(passing.out, /failed in this repo before/);
  const failing = devflow('run', '20', '--label', 'deps', ...fail);
  assert.match(failing.out, /This step has failed in this repo before/);
  assert.ok(failing.out.includes(advice));
  assert.match(devflow('lessons', '--step', '8').out, /No lessons recorded/);
});

test('a failed verdict counts as a failure that owes a lesson', () => {
  const { dir, devflow } = repo();
  devflow('init', 't', '--tier', '1');
  devflow('mark', '1', 'n/a', '--reason', 'not what this test is about');
  fs.writeFileSync(path.join(dir, '.devflow', 't', 'evidence', '10-qa.md'), 'checked\n');
  devflow('record', '10', 'failed', '--artefact', '.devflow/t/evidence/10-qa.md');
  devflow('record', '10', 'passed', '--artefact', '.devflow/t/evidence/10-qa.md');
  devflow('run', '8', '--label', 'diff', ...pass);
  const blocked = devflow('status', '--gate', '--through', '10');
  assert.equal(blocked.code, 1);
  assert.match(blocked.out, /step 10 .* failed 1 time\(s\)/);
});
