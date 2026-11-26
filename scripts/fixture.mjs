#!/usr/bin/env node
// Makes a throwaway git repo from the rentals fixture, to run a trial task on.
//
//   node scripts/fixture.mjs <target-folder> [--install]
//
// The target must not exist yet. The answer key (fixtures/rentals.defects.json)
// stays behind, so an agent working in the new repo cannot read it.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'rentals');
const [target, ...flags] = process.argv.slice(2);

if (!target) {
  console.error('use: node scripts/fixture.mjs <target-folder> [--install]');
  process.exit(2);
}
if (fs.existsSync(target)) {
  console.error(`fixture: ${target} already exists. Choose a new folder, so nothing is overwritten.`);
  process.exit(2);
}

const skipped = new Set(['node_modules', '.data']);
fs.cpSync(source, target, { recursive: true, filter: (file) => !skipped.has(path.basename(file)) });

const git = (...args) => execFileSync('git', args, { cwd: target, stdio: 'ignore' });
git('init', '-q', '-b', 'main');
git('config', 'user.name', 'fixture');
git('config', 'user.email', 'fixture@example.com');
git('add', '-A');
git('commit', '-q', '-m', 'Rentals app as it stands');

if (flags.includes('--install')) {
  execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: target, stdio: 'inherit', shell: true });
}
console.log(`Fixture repo created at ${path.resolve(target)}`);
console.log(flags.includes('--install') ? 'Dependencies are installed. Run "npm test" there to check it.' : 'Run "npm ci" there before running the app or its tests.');
