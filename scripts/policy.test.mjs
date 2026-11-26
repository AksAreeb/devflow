// Tests for the policy generator. Run with: node --test scripts/policy.test.mjs
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
const policy = {
  integrationBranch: 'dev', releaseBranch: 'main', hotfixPrefix: 'hotfix/',
  branchPrefixes: ['feat/', 'fix/'], commits: 'conventional', mergeIntoRelease: 'merge',
  docs: ['docs/README.md', 'docs/decisions'],
};

function repo(config, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-generate-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...identity }, stdio: 'ignore' });
  git('init', '-q');
  fs.writeFileSync(path.join(dir, 'devflow.config.json'), JSON.stringify(config));
  for (const [name, content] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), content);
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  git('update-ref', 'refs/remotes/origin/dev', 'HEAD');
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/dev');
  const run = (script, ...args) => {
    const r = spawnSync(process.execPath, [path.join(here, script), ...args], { cwd: dir, encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const read = (file) => fs.readFileSync(path.join(dir, file), 'utf8');
  return { dir, run, read, has: (file) => fs.existsSync(path.join(dir, file)) };
}

test('a dry run creates nothing', () => {
  const { run, has } = repo({ policy });
  const result = run('policy.mjs');
  assert.equal(result.code, 0);
  assert.match(result.out, /would create AGENTS\.md/);
  assert.equal(has('AGENTS.md'), false);
});

test('generated files state the policy and pass the rules audit', () => {
  const { run, read, has } = repo({ policy, checks: { test: 'npm test', lint: null } });
  assert.equal(run('policy.mjs', '--write').code, 0);

  const guide = read('AGENTS.md');
  assert.match(guide, /Start work from `origin\/dev`/);
  assert.match(guide, /prefixes: `feat\/`, `fix\/`/);
  assert.match(guide, /Only `dev` and `hotfix\/\*` branches go to `main`/);
  assert.match(guide, /Conventional Commits/);
  assert.match(guide, /- test: `npm test`/);
  assert.doesNotMatch(guide, /lint/, 'a check the repo does not have is left out');
  assert.ok(guide.split('\n').length < 60, 'the agent guide stays short');

  assert.match(read('CLAUDE.md'), /Read `AGENTS\.md`/);
  assert.match(read('.github/workflows/branch-policy.yml'), /\[ "\$BASE" != "dev" \]/);
  assert.match(read('.github/workflows/branch-policy.yml'), /BASE: \$\{\{ github\.base_ref \}\}/);
  assert.ok(has('docs/README.md') && has('docs/decisions/README.md'));

  const audit = run('scan.mjs', 'rules');
  assert.equal(audit.code, 0, audit.out);
});

test('an existing file is never overwritten', () => {
  const { run, read } = repo({ policy }, { 'AGENTS.md': 'My own rules.\n' });
  const result = run('policy.mjs', '--write');
  assert.match(result.out, /exists {3}AGENTS\.md/);
  assert.equal(read('AGENTS.md'), 'My own rules.\n');
});

test('a single-branch repo gets no branch-policy workflow and no release wording', () => {
  const { run, read, has } = repo({ policy: { integrationBranch: 'dev', agentFile: 'CLAUDE.md' } });
  run('policy.mjs', '--write');
  assert.equal(has('.github/workflows/branch-policy.yml'), false);
  assert.doesNotMatch(read('CLAUDE.md'), /hotfix/);
  assert.match(read('AGENTS.md'), /Read `CLAUDE\.md`/);
  assert.equal(run('scan.mjs', 'rules').code, 0);
});

test('without a policy block there is nothing to generate', () => {
  assert.equal(repo({}).run('policy.mjs').code, 2);
});
