// Tests for the repo rules audit. Run with: node --test scripts/rules.test.mjs
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
const policy = { integrationBranch: 'dev', releaseBranch: 'main', mergeIntoRelease: 'merge', docs: ['docs/README.md'] };

// A throwaway repo holding the given files, with origin's default branch set to dev.
function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-rules-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: { ...process.env, ...identity }, stdio: 'ignore' });
  git('init', '-q');
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  git('update-ref', 'refs/remotes/origin/dev', 'HEAD');
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/dev');
  const r = spawnSync(process.execPath, [script, 'rules'], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const sound = {
  'devflow.config.json': JSON.stringify({ policy }),
  'AGENTS.md': '# Agent guide\n\nBranch from `dev`. Pull requests target `dev`.\nOnly `dev` and hotfix branches go to `main`.\nSee `docs/README.md`.\n',
  'CLAUDE.md': 'Read `AGENTS.md`.\n',
  'CONTRIBUTING.md': '# Contributing\n\nBranch off `dev` and keep checks green.\n',
  '.github/pull_request_template.md': '## Summary\n\n## Testing\n',
  '.github/workflows/branch-policy.yml': 'name: Branch policy\n',
  'docs/README.md': '# Docs\n',
};

test('a repo whose files agree with its policy passes', () => {
  const result = repo(sound);
  assert.equal(result.code, 0, result.out);
});

test('a repo with no policy block has nothing to check against', () => {
  const result = repo({ ...sound, 'devflow.config.json': '{}' });
  assert.equal(result.code, 1);
  assert.match(result.out, /no "policy" block/);
});

test('missing files, broken pointers and an unlinked second agent file are reported', () => {
  const { 'CONTRIBUTING.md': dropped, '.github/workflows/branch-policy.yml': gone, ...rest } = sound;
  const result = repo({
    ...rest,
    'AGENTS.md': '# Agent guide\n\nRead `../CLAUDE.md` and `docs/CI_CD.md` first. Run `npm test`.\n',
    'CLAUDE.md': '# Rules\n\nSome rules of its own.\n',
  });
  assert.equal(result.code, 1);
  assert.match(result.out, /CONTRIBUTING\.md: missing/);
  assert.match(result.out, /branch-policy\.yml: missing/);
  assert.match(result.out, /AGENTS\.md:3 {2}points to \.\.\/CLAUDE\.md, which does not exist/);
  assert.match(result.out, /AGENTS\.md:3 {2}points to docs\/CI_CD\.md, which does not exist/);
  assert.match(result.out, /CLAUDE\.md: does not point to AGENTS\.md/);
  assert.doesNotMatch(result.out, /npm/, 'a command is not a path');
});

test('partial paths, template names and personal files are not broken pointers', () => {
  const result = repo({
    ...sound,
    '.gitignore': '.env\n/docs/ignored/\n',
    'apps/server/eval/run.ts': 'export {};\n',
    'AGENTS.md': [
      '# Agent guide', '',
      'Run `eval/run.ts` for evals.',
      'Name a decision record `docs/adr/NNNN-title.md`.',
      'Copy the example to `apps/server/.env` and adjust `.claude/settings.local.json`.',
      'The runbook is `docs/ignored/runbook.md`.',
      'See `docs/gone/away.md`.', '',
    ].join('\n'),
  });
  assert.equal(result.code, 1);
  assert.match(result.out, /Repo rules: 2 finding/);
  assert.match(result.out, /AGENTS\.md:6 {2}points to docs\/ignored\/runbook\.md/, 'being gitignored does not excuse a missing doc');
  assert.match(result.out, /AGENTS\.md:7 {2}points to docs\/gone\/away\.md/);
});

test('statements that contradict the policy are reported, exceptions are not', () => {
  const result = repo({
    ...sound,
    'README.md': '# App\n\nWe work trunk-based and squash-merge to main.\nBranch off `main` for new work.\nNever branch from `main` for features.\n',
  });
  assert.equal(result.code, 1);
  assert.match(result.out, /README\.md:3 {2}describes trunk-based development/);
  assert.match(result.out, /README\.md:3 {2}says to squash into main/);
  assert.match(result.out, /README\.md:4 {2}says to branch from main/);
  assert.doesNotMatch(result.out, /README\.md:5/, 'a line stating the exception is left alone');
});

test('oversized agent instructions and a wrong default branch are reported', () => {
  const long = '# Agent guide\n' + 'A rule that should live in the docs.\n'.repeat(90);
  const result = repo({
    ...sound,
    'AGENTS.md': long,
    'devflow.config.json': JSON.stringify({ policy: { ...policy, integrationBranch: 'develop' } }),
  });
  assert.equal(result.code, 1);
  assert.match(result.out, /agent instructions total \d+ lines; the budget is 80/);
  assert.match(result.out, /default branch is dev, but the policy integrates on develop/);
});
