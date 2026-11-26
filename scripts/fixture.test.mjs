// Tests for the fixture set-up script. Run with: node --test scripts/fixture.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const make = (target) => spawnSync(process.execPath, [path.join(here, 'fixture.mjs'), target], { encoding: 'utf8' });
const key = JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', 'rentals.defects.json'), 'utf8'));

test('the fixture becomes a clean git repo that does not give away its planted defects', () => {
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'devflow-fixture-')), 'rentals');
  const made = make(target);
  assert.equal(made.status, 0, made.stderr);
  const git = (...args) => execFileSync('git', args, { cwd: target, encoding: 'utf8' }).trim();
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(git('rev-list', '--count', 'HEAD'), '1');

  const files = git('ls-files').split('\n');
  assert.ok(files.includes('src/server.mjs') && files.includes('package-lock.json'));
  assert.ok(!files.some((file) => /defects|node_modules/.test(file)));
  for (const file of files) {
    const text = fs.readFileSync(path.join(target, file), 'utf8');
    assert.doesNotMatch(text, /\bD\d\d\b|planted|defect|on purpose|answer key/i, `${file} hints at the answer key`);
  }
  assert.equal(make(target).status, 2, 'an existing folder is never overwritten');
});

test('every planted defect names a step that exists and a file in the fixture', () => {
  const steps = JSON.parse(fs.readFileSync(path.join(here, 'steps.json'), 'utf8')).map((s) => s.n);
  assert.equal(new Set(key.defects.map((d) => d.id)).size, key.defects.length);
  for (const defect of key.defects) {
    assert.ok(steps.includes(defect.step), `${defect.id} names step ${defect.step}`);
    const file = defect.where.split(',')[0];
    assert.ok(fs.existsSync(path.join(here, '..', 'fixtures', 'rentals', file)), `${defect.id} names ${file}`);
  }
});
