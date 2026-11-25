// Tests for the hook script. Run with: node --test hooks/guard.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const guard = path.join(here, 'guard.mjs');
const run = path.join(here, '..', 'scripts', 'run.mjs');
const identity = {
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
};

// A throwaway repo with one committed source file and one committed test.
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-hook-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...identity }, stdio: 'ignore' });
  git('init', '-q');
  fs.writeFileSync(path.join(dir, 'app.js'), 'export const one = 1;\n');
  fs.writeFileSync(path.join(dir, 'app.test.js'), '// committed test\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  const devflow = (...args) => spawnSync(process.execPath, [run, ...args], { cwd: dir, encoding: 'utf8' });
  const hook = (event) => {
    const r = spawnSync(process.execPath, [guard], { cwd: dir, encoding: 'utf8', input: JSON.stringify({ cwd: dir, ...event }) });
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout.trim();
    if (!out.startsWith('{')) return { text: out };
    const parsed = JSON.parse(out);
    return { ...parsed, ...parsed.hookSpecificOutput };
  };
  const bash = (command) => hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
  const edit = (file) => hook({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(dir, file) } });
  return { dir, devflow, hook, bash, edit };
}

const pass = ['--', 'node', '-e', '"process.exit(0)"'];

test('merges are always denied, lookalike commands are left alone', () => {
  const { bash } = repo();
  for (const command of ['git merge feat/x', 'git -C . merge --no-ff feat/x', 'gh pr merge 3 --squash', 'gh api repos/o/r/pulls/3/merge -X PUT']) {
    assert.equal(bash(command).permissionDecision, 'deny', command);
  }
  for (const command of ['git merge --abort', 'git merge-base main HEAD', 'git commit -m "merge fix"', 'git log --merges', 'npm test']) {
    assert.equal(bash(command).permissionDecision, undefined, command);
  }
});

test('opening a pull request asks the person when no task is active', () => {
  const { bash } = repo();
  assert.equal(bash('gh pr create --fill').permissionDecision, 'ask');
});

test('opening a pull request is denied until the ledger is clean, then asks', () => {
  const { dir, devflow, bash } = repo();
  devflow('init', 't', '--tier', '1');
  const blocked = bash('gh pr create --fill');
  assert.equal(blocked.permissionDecision, 'deny');
  assert.match(blocked.permissionDecisionReason, /step 11 regression is pending/);

  fs.writeFileSync(path.join(dir, '.devflow', 't', 'note.md'), 'evidence\n');
  for (const step of ['1', '10', '24']) devflow('record', step, 'passed', '--artefact', '.devflow/t/note.md');
  devflow('run', '8', '--label', 'ok', ...pass);
  for (const check of ['secrets', 'deps', 'newdeps']) devflow('run', '20', '--builtin', check);
  devflow('mark', '11', 'not-run', '--reason', 'no suite');
  const ready = bash('gh pr create --fill');
  assert.equal(ready.permissionDecision, 'ask');
  assert.match(ready.permissionDecisionReason, /Not run, to be stated in the ship report: 11/);
});

test('committed tests need approval to edit during a task, new tests and source do not', () => {
  const { dir, devflow, edit } = repo();
  assert.equal(edit('app.test.js').permissionDecision, undefined, 'no task active, so no protection');
  devflow('init', 't', '--tier', '1');
  assert.equal(edit('app.test.js').permissionDecision, 'ask');
  assert.equal(edit('new.test.js').permissionDecision, undefined);
  assert.equal(edit('app.js').permissionDecision, undefined);
  assert.equal(edit('.devflow/t/ledger.json').permissionDecision, 'deny');
  fs.writeFileSync(path.join(dir, 'devflow.config.json'), JSON.stringify({ protected: ['app.js'] }));
  assert.equal(edit('app.js').permissionDecision, 'ask', 'repo can add its own protected paths');
});

test('stopping with failed or stale steps gets one nudge, not a wall', () => {
  const { dir, devflow, hook } = repo();
  const stop = (active) => hook({ hook_event_name: 'Stop', stop_hook_active: active });
  assert.equal(stop(false).decision, undefined, 'no task active');
  devflow('init', 't', '--tier', '1');
  assert.equal(stop(false).decision, undefined, 'pending steps alone do not block');
  devflow('run', '8', '--label', 'ok', ...pass);
  fs.writeFileSync(path.join(dir, 'app.js'), 'export const one = 2;\n');
  const nudge = stop(false);
  assert.equal(nudge.decision, 'block');
  assert.match(nudge.reason, /8\s+implement\s+stale/);
  assert.equal(stop(true).decision, undefined, 'second attempt goes through');
});

test('after compaction the ledger state is put back in context', () => {
  const { devflow, hook } = repo();
  const start = () => hook({ hook_event_name: 'SessionStart', source: 'compact' });
  assert.equal(start().text, '');
  devflow('init', 'add-search', '--tier', '2');
  assert.match(start().text, /task "add-search" is in progress[\s\S]*7\s+plan\s+pending/);
});

test('malformed input never breaks a session', () => {
  const r = spawnSync(process.execPath, [guard], { encoding: 'utf8', input: 'not json' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});
