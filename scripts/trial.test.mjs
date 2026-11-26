// Regression tests for problems found in the first live run of the pipeline.
// Run with: node --test scripts/trial.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const identity = {
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
};

function repo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-trial-'));
  const write = (name, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  };
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...identity }, stdio: 'ignore' });
  git('init', '-q');
  write('app.js', 'export const one = 1;\n');
  for (const [name, content] of Object.entries(files)) write(name, content);
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  const node = (script, args, env = {}) => {
    const r = spawnSync(process.execPath, [path.join(here, script), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const hook = (command) => {
    const r = spawnSync(process.execPath, [path.join(here, '..', 'hooks', 'guard.mjs')], {
      cwd: dir, encoding: 'utf8',
      input: JSON.stringify({ cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }),
    });
    return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : {};
  };
  return { dir, write, node, hook };
}

const finding = (name, severity, fixAvailable) => [name, { name, severity, fixAvailable }];
const audit = (...findings) => JSON.stringify({ vulnerabilities: Object.fromEntries(findings) });

test('the dependency check leads with the worst production finding and does not hide it in a long report', () => {
  const { write, node, dir } = repo({ 'package-lock.json': '{}\n' });
  write('all.json', audit(
    finding('next', 'critical', true), finding('sharp', 'high', { isSemVerMajor: true }),
    finding('tinypool', 'critical', { isSemVerMajor: true }), finding('brace-expansion', 'high', true),
    finding('esbuild', 'moderate', true),
  ));
  write('prod.json', audit(finding('next', 'critical', true), finding('sharp', 'high', { isSemVerMajor: true })));
  const env = { DEVFLOW_AUDIT_ALL: path.join(dir, 'all.json'), DEVFLOW_AUDIT_PRODUCTION: path.join(dir, 'prod.json') };
  const result = node('scan.mjs', ['deps'], env);
  assert.equal(result.code, 1);
  assert.match(result.out, /production: 1 critical, 1 high/);
  assert.match(result.out, /BLOCKING {2}critical {1,}next {2}\(fix: npm audit fix\)/);
  assert.match(result.out, /BLOCKING {2}high {1,}sharp {2}\(fix needs a breaking upgrade\)/);
  assert.match(result.out, /not blocking, development only {2}critical {1,}tinypool/);
  assert.match(result.out, /do not offer to waive it/);
  assert.ok(result.out.trim().split('\n').length <= 10, 'short enough that its end is still the summary');
});

test('findings that exist only in development tooling are reported but do not block', () => {
  const { write, node, dir } = repo({ 'package-lock.json': '{}\n' });
  write('all.json', audit(finding('tinypool', 'critical', true), finding('esbuild', 'moderate', true)));
  write('prod.json', audit());
  const env = { DEVFLOW_AUDIT_ALL: path.join(dir, 'all.json'), DEVFLOW_AUDIT_PRODUCTION: path.join(dir, 'prod.json') };
  const result = node('scan.mjs', ['deps'], env);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /production: none/);
  assert.match(result.out, /not blocking, development only {2}critical {1,}tinypool/);

  write('devflow.config.json', JSON.stringify({ audit: 'all' }));
  assert.equal(node('scan.mjs', ['deps'], env).code, 1, 'a repo can choose to block on the whole tree');
});

test('an audit that returns nothing is a failure, not a pass', () => {
  const { write, node, dir } = repo({ 'package-lock.json': '{}\n' });
  write('empty.txt', 'npm ERR! network\n');
  const env = { DEVFLOW_AUDIT_ALL: path.join(dir, 'empty.txt'), DEVFLOW_AUDIT_PRODUCTION: path.join(dir, 'empty.txt') };
  assert.equal(node('scan.mjs', ['deps'], env).code, 1);
});

test('a failed spec check shows the shape it expects', () => {
  const { write, node } = repo();
  write('.devflow/current', 't\n');
  write('.devflow/t/spec.md', '# Spec\n\n## Problem\nA stale comment.\n\n- R1: The comment shall name the right file.\n  Example: it says next.config.mjs.\n');
  const result = node('scan.mjs', ['spec']);
  assert.equal(result.code, 1);
  assert.match(result.out, /- R1: When <trigger>, the system shall <response>\./);
  assert.match(result.out, /- Example: Given <state>/);
  assert.match(result.out, /Form: short/);
});

test('waiving a step that failed asks the person, marking a pending step does not', () => {
  const { node, hook } = repo();
  node('run.mjs', ['init', 't', '--tier', '1']);
  const mark = (step) => hook(`node "/plugin/scripts/run.mjs" mark ${step} n/a --reason "not relevant"`);
  assert.equal(mark(20).permissionDecision, undefined, 'still pending');
  node('run.mjs', ['run', '20', '--label', 'deps', '--', 'node', '-e', '"process.exit(1)"']);
  const waiver = mark(20);
  assert.equal(waiver.permissionDecision, 'ask');
  assert.match(waiver.permissionDecisionReason, /step 20 has failed, and this would waive it/);
  assert.equal(mark(10).permissionDecision, undefined, 'a different, pending step');
});
