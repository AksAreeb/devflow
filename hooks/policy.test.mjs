// Tests for branch policy enforcement in the hooks. Run with: node --test hooks/policy.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const guard = path.join(path.dirname(fileURLToPath(import.meta.url)), 'guard.mjs');
const identity = {
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
};
const policy = {
  integrationBranch: 'dev', releaseBranch: 'main', hotfixPrefix: 'hotfix/',
  branchPrefixes: ['feat/', 'fix/', 'docs/', 'chore/'], commits: 'conventional',
};

// A throwaway repo on the given branch, with or without a policy.
function repo(branch, config = { policy }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-policy-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...identity }, stdio: 'ignore' });
  git('init', '-q');
  fs.writeFileSync(path.join(dir, 'devflow.config.json'), JSON.stringify(config));
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  git('checkout', '-q', '-B', branch);
  return (command) => {
    const r = spawnSync(process.execPath, [guard], {
      cwd: dir, encoding: 'utf8',
      input: JSON.stringify({ cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }),
    });
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout.trim();
    return out ? JSON.parse(out).hookSpecificOutput : {};
  };
}

test('a new branch needs an allowed prefix and must not start from the release branch', () => {
  const onMain = repo('main');
  assert.equal(onMain('git switch -c feat/search').permissionDecision, 'deny', 'branching from main');
  assert.match(onMain('git switch -c feat/search').permissionDecisionReason, /git switch -c feat\/search origin\/dev/);
  assert.equal(onMain('git switch -c feat/search origin/dev').permissionDecision, undefined, 'an explicit start point is respected');
  assert.equal(onMain('git checkout -b hotfix/login').permissionDecision, undefined, 'hotfixes start from main');

  const onDev = repo('dev');
  assert.equal(onDev('git switch -c feat/search').permissionDecision, undefined);
  assert.equal(onDev('git switch -c search-thing').permissionDecision, 'deny', 'no allowed prefix');
  assert.equal(onDev('git switch -c feat/search origin/main').permissionDecision, 'deny', 'explicitly from main');
});

test('a pull request must target the integration branch, except promotions and hotfixes', () => {
  const onFeature = repo('feat/search');
  assert.equal(onFeature('gh pr create --base main --fill').permissionDecision, 'deny');
  assert.equal(onFeature('gh pr create --base dev --fill').permissionDecision, 'ask', 'allowed, and the person still confirms');
  assert.equal(repo('dev')('gh pr create --base main --fill').permissionDecision, 'ask', 'a promotion');
  assert.equal(repo('hotfix/login')('gh pr create -B main --fill').permissionDecision, 'ask', 'a hotfix');
});

test('pushing straight to a protected branch is refused', () => {
  const hook = repo('feat/search');
  assert.equal(hook('git push origin main').permissionDecision, 'deny');
  assert.equal(hook('git push origin HEAD:dev').permissionDecision, 'deny');
  assert.equal(hook('git push origin abc123:refs/heads/main').permissionDecision, 'deny');
  assert.equal(hook('git push -u origin feat/search').permissionDecision, undefined);
  assert.equal(hook('git push origin feat/dev-tools').permissionDecision, undefined, 'a name that only contains "dev"');
});

test('commit subjects follow the convention the policy names', () => {
  const hook = repo('feat/search');
  assert.equal(hook('git commit -m "added search"').permissionDecision, 'deny');
  assert.equal(hook('git commit -m "feat: add street search"').permissionDecision, undefined);
  assert.equal(hook('git commit -m "fix(search)!: drop the old index"').permissionDecision, undefined);
  const free = repo('feat/search', { policy: { ...policy, commits: 'free' } });
  assert.equal(free('git commit -m "added search"').permissionDecision, undefined);
});

test('a repo with no policy is left alone', () => {
  const hook = repo('main', {});
  assert.equal(hook('git switch -c anything').permissionDecision, undefined);
  assert.equal(hook('git push origin main').permissionDecision, undefined);
  assert.equal(hook('git commit -m "wip"').permissionDecision, undefined);
});
