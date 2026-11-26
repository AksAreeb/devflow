#!/usr/bin/env node
// devflow policy generator. Writes the files people and agents read from the
// one policy block in devflow.config.json, so each rule is stated once.
//
//   node policy.mjs            show what would be created
//   node policy.mjs --write    create the files that do not exist yet
//
// It never overwrites. A file that already exists is left alone and listed, and
// `scan.mjs rules` then reports where it disagrees with the policy.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const configFile = path.join(root, 'devflow.config.json');
const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
const policy = config.policy;
if (!policy) {
  console.error('devflow policy: add a "policy" block to devflow.config.json first.');
  process.exit(2);
}

const dev = policy.integrationBranch ?? 'main';
const main = policy.releaseBranch ?? dev;
const twoBranch = dev !== main;
const hotfix = policy.hotfixPrefix ?? 'hotfix/';
const prefixes = policy.branchPrefixes ?? [];
const agentFile = policy.agentFile ?? 'AGENTS.md';
const pointerFile = agentFile === 'AGENTS.md' ? 'CLAUDE.md' : 'AGENTS.md';
const maxLines = policy.maxDiffLines ?? 500;
const docs = policy.docs ?? [];
const checks = Object.entries(config.checks ?? {}).filter(([, command]) => command);
const list = (items) => items.map((item) => `\`${item}\``).join(', ');
const lines = (...parts) => parts.flat().filter((part) => part !== null).join('\n') + '\n';

const files = {
  [agentFile]: lines(
    '# Agent guide',
    '',
    'The rules for AI coding agents in this repo. They are generated from the `policy` block in `devflow.config.json`. To change a rule, change the policy and regenerate, so this file and the enforcement stay in step.',
    '',
    '## Branches',
    '',
    `- Start work from \`origin/${dev}\`.`,
    prefixes.length ? `- Name the branch with one of these prefixes: ${list(prefixes)}.` : null,
    `- Pull requests target \`${dev}\`.`,
    twoBranch ? `- Only \`${dev}\` and \`${hotfix}*\` branches go to \`${main}\`, and a person opens and merges those.` : null,
    `- Never push straight to ${twoBranch ? `\`${dev}\` or \`${main}\`` : `\`${dev}\``}.`,
    '',
    '## Commits and pull requests',
    '',
    policy.commits === 'conventional' ? '- Commit subjects follow Conventional Commits, for example `fix: handle an empty search`.' : '- Write a short imperative subject and a body that says why.',
    `- Keep a pull request to ${maxLines} lines of diff or fewer. Split anything larger.`,
    '- Fill in every section of the pull request template. Say what was not verified.',
    twoBranch && policy.mergeIntoRelease === 'merge' ? `- Changes are squashed into \`${dev}\`. The move to \`${main}\` uses a merge commit.` : null,
    '',
    '## What an agent never does',
    '',
    '- Merge or approve a pull request.',
    '- Trigger a production deploy or a release.',
    '- Change CI or release workflows unless that is the task.',
    '- Commit a secret, or weaken a test to make it pass.',
    '',
    checks.length ? ['## Checks', '', 'Run these before asking for review:', '', ...checks.map(([name, command]) => `- ${name}: \`${command}\``), ''] : null,
    docs.length ? ['## Where things are', '', ...docs.map((entry) => `- \`${entry}\``)] : null,
  ),

  [pointerFile]: lines(`Read \`${agentFile}\`. It holds the rules for this repo.`),

  'CONTRIBUTING.md': lines(
    '# Contributing',
    '',
    `1. Branch from \`${dev}\`${prefixes.length ? `, using one of these prefixes: ${list(prefixes)}` : ''}.`,
    '2. Make one change per pull request, with its tests.',
    checks.length ? `3. Run the checks: ${list(checks.map(([name]) => name))}.` : '3. Run the checks.',
    `4. Open a pull request into \`${dev}\` and fill in the template.`,
    '5. A person reviews and merges it.',
    twoBranch ? ['', `\`${main}\` is the release branch. It receives changes only from \`${dev}\` and from \`${hotfix}*\` branches.`] : null,
    '',
    `The rules agents follow are in \`${agentFile}\`.`,
  ),

  '.github/pull_request_template.md': lines(
    '## Summary',
    '',
    'What changed, in two or three sentences.',
    '',
    '## Why',
    '',
    '## How it was tested',
    '',
    'The commands that were run and what they showed.',
    '',
    '## Not verified',
    '',
    'Anything that was not checked, and why. Write "nothing" if that is true.',
    '',
    '## Rollback',
  ),

  ...(twoBranch && policy.enforcement !== 'hooks-only' ? {
    '.github/workflows/branch-policy.yml': lines(
      'name: Branch policy',
      '',
      'on:',
      '  pull_request:',
      '    types: [opened, reopened, synchronize, edited]',
      '',
      'permissions: {}',
      '',
      'jobs:',
      '  branch-policy:',
      '    name: Branch policy',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Check where this pull request is aimed',
      '        env:',
      '          BASE: ${{ github.base_ref }}',
      '          HEAD: ${{ github.head_ref }}',
      '          SAME_REPO: ${{ github.event.pull_request.head.repo.full_name == github.repository }}',
      '          NUMBER: ${{ github.event.pull_request.number }}',
      '        run: |',
      `          if [ "$BASE" = "${main}" ]; then`,
      `            if [ "$SAME_REPO" = "true" ] && { [ "$HEAD" = "${dev}" ] || [[ "$HEAD" == ${hotfix}* ]]; }; then`,
      '              exit 0',
      '            fi',
      `            echo "::error::Only ${dev} and ${hotfix}* branches may target ${main}. Retarget with: gh pr edit $NUMBER --base ${dev}"`,
      '            exit 1',
      '          fi',
      `          if [ "$BASE" != "${dev}" ]; then`,
      `            echo "::error::Pull requests target ${dev}. Retarget with: gh pr edit $NUMBER --base ${dev}"`,
      '            exit 1',
      '          fi',
    ),
  } : {}),

  ...Object.fromEntries(docs.map((entry) => {
    const file = entry.endsWith('.md') ? entry : `${entry.replace(/\/$/, '')}/README.md`;
    const title = path.basename(path.dirname(file)) === '.' ? 'Documentation' : path.basename(path.dirname(file));
    return [file, lines(`# ${title[0].toUpperCase()}${title.slice(1)}`, '', 'What belongs here, and an index of what is in it.')];
  })),
};

const write = process.argv.includes('--write');
let created = 0;
for (const [file, content] of Object.entries(files)) {
  const target = path.join(root, file);
  if (fs.existsSync(target)) {
    console.log(`exists   ${file}`);
    continue;
  }
  created += 1;
  if (write) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  console.log(`${write ? 'created ' : 'would create'} ${file}  (${content.split('\n').length - 1} lines)`);
}
console.log(write
  ? `\n${created} file(s) created. Existing files were left alone. Check them with: scan.mjs rules`
  : `\n${created} file(s) would be created. Run again with --write to create them. Existing files are never overwritten.`);
