#!/usr/bin/env node
// devflow capture script. It runs checks and records what actually happened,
// so the ledger is evidence and not the agent's own summary.
//
//   init <task> --tier <1|2|3>              create the ledger for a task
//   run <step> --check <name>               run a check from devflow.config.json
//   run <step> --builtin <name>             run one of devflow's own checks (scan.mjs)
//   run <step> --label <name> -- <command>  run any command
//       add --expect-fail before the -- when the command is meant to fail
//   record <step> <passed|failed> --artefact <path>   verdict for a judged step
//   mark <step> <n/a|not-run> --reason <text>         step that will not run
//   status [--gate] [--through <step>]      show the ledger; --gate exits 1 if any step up to
//                                           Ship (24, or the step given) is not settled
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const STEPS = JSON.parse(fs.readFileSync(path.join(here, 'steps.json'), 'utf8'));

function die(message) {
  console.error(`devflow: ${message}`);
  process.exit(2);
}

function git(args, env = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

let root;
try {
  root = git(['rev-parse', '--show-toplevel']);
} catch {
  die('not inside a git repository');
}
process.chdir(root);
const base = path.join(root, '.devflow');

// Hash of the whole working tree, committed or not. A run is only evidence for
// the exact code it ran against, so any later edit makes it stale. A throwaway
// index keeps the real staging area untouched.
function treeHash() {
  const index = path.join(os.tmpdir(), `devflow-index-${process.pid}`);
  try {
    git(['add', '-A'], { GIT_INDEX_FILE: index });
    return git(['write-tree'], { GIT_INDEX_FILE: index });
  } finally {
    fs.rmSync(index, { force: true });
  }
}

function currentTask() {
  const pointer = path.join(base, 'current');
  if (!fs.existsSync(pointer)) die('no active task. Start one with: init <task> --tier <1|2|3>');
  return fs.readFileSync(pointer, 'utf8').trim();
}

function loadLedger() {
  const file = path.join(base, currentTask(), 'ledger.json');
  return { file, ledger: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

function save(file, ledger) {
  fs.writeFileSync(file, JSON.stringify(ledger, null, 2) + '\n');
}

function entryFor(ledger, stepArg) {
  const entry = ledger.entries.find((e) => e.step === Number(stepArg));
  if (!entry) die(`step ${stepArg} is not in this task's ledger (tier ${ledger.tier})`);
  return entry;
}

function option(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function loadConfig() {
  const file = path.join(root, 'devflow.config.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

// Works out a step's state from what was recorded. Nothing here trusts a
// status the agent typed: script steps are judged by exit codes and tree hash.
function evaluate(entry, tree, config) {
  if (entry.mark) return entry.mark;
  const results = [];
  if (entry.kind !== 'judged') {
    // A repo with no linter, say, declares that with "lint": null in its config.
    const required = (STEPS.find((s) => s.n === entry.step).checks ?? []).filter((c) => config.checks?.[c] !== null);
    const labels = entry.runs.map((r) => r.label);
    // A run made with --expect-fail (a new test shown failing before the code
    // exists) passes by failing, and is a record of that moment, so it never goes stale.
    if (entry.runs.some((r) => (r.exitCode !== 0) !== Boolean(r.expectFail))) results.push('failed');
    else if (!entry.runs.length || required.some((c) => !labels.includes(c))) results.push('pending');
    // Steps marked durable check a document (the spec, the plan), not the code,
    // so writing code afterwards does not invalidate them.
    else if (!STEPS.find((s) => s.n === entry.step).durable && entry.runs.some((r) => !r.expectFail && r.tree !== tree)) results.push('stale');
    else results.push('passed');
  }
  if (entry.kind !== 'script') {
    // A verdict about the code (QA, review) is only good for the code it looked
    // at. A verdict about a document (spec, plan) does not expire when code changes.
    const expires = STEPS.find((s) => s.n === entry.step).fresh;
    if (!entry.verdict) results.push('pending');
    else if (entry.verdict === 'passed' && expires && entry.verdictTree !== tree) results.push('stale');
    else results.push(entry.verdict);
  }
  return ['failed', 'pending', 'stale'].find((s) => results.includes(s)) ?? 'passed';
}

const commands = {
  init([task, ...rest]) {
    const tier = Number(option(rest, '--tier'));
    if (!/^[a-z0-9][a-z0-9-]*$/.test(task ?? '')) die('task name must be lowercase letters, digits and hyphens');
    if (![1, 2, 3].includes(tier)) die('--tier must be 1, 2 or 3');
    const dir = path.join(base, task);
    if (fs.existsSync(path.join(dir, 'ledger.json'))) die(`ledger for "${task}" already exists. Use: status`);
    fs.mkdirSync(path.join(dir, 'evidence'), { recursive: true });
    const entries = STEPS.filter((s) => s.minTier <= tier).map((s) => ({
      step: s.n, name: s.name, kind: s.kind, runs: [], verdict: null, mark: null, artefacts: [], reason: null,
    }));
    save(path.join(dir, 'ledger.json'), { task, tier, created: new Date().toISOString(), entries });
    fs.writeFileSync(path.join(base, 'current'), task + '\n');
    const exclude = git(['rev-parse', '--git-path', 'info/exclude']);
    const existing = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
    if (!existing.split(/\r?\n/).includes('.devflow/')) {
      fs.mkdirSync(path.dirname(exclude), { recursive: true });
      fs.appendFileSync(exclude, `${existing.endsWith('\n') || !existing ? '' : '\n'}.devflow/\n`);
    }
    console.log(`Ledger created for "${task}" at tier ${tier} with ${entries.length} steps.`);
  },

  run([stepArg, ...rest]) {
    const { file, ledger } = loadLedger();
    const entry = entryFor(ledger, stepArg);
    if (entry.kind === 'judged') die(`step ${entry.step} needs a verdict, not a command. Use: record`);
    const split = rest.indexOf('--');
    const check = option(rest, '--check');
    const builtin = option(rest, '--builtin');
    let command;
    if (check) {
      command = loadConfig().checks?.[check];
      if (!command) die(`no "${check}" command in devflow.config.json. Add it under "checks".`);
    } else if (builtin) {
      command = `node "${path.join(here, 'scan.mjs')}" ${builtin}`;
    } else if (split !== -1) {
      command = rest.slice(split + 1).join(' ');
    }
    const label = check ?? builtin ?? option(rest, '--label');
    if (!command || !label) die('use: run <step> --check <name> | --builtin <name> | --label <name> -- <command>');

    const tree = treeHash();
    const result = spawnSync(command, { shell: true, cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const exitCode = result.status ?? 1;
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const log = `evidence/${String(entry.step).padStart(2, '0')}-${label}.log`;
    fs.writeFileSync(path.join(base, ledger.task, log), `$ ${command}\n${output}\n[exit ${exitCode}]\n`);
    entry.runs = entry.runs.filter((r) => r.label !== label);
    const expectFail = rest.slice(0, split === -1 ? undefined : split).includes('--expect-fail');
    entry.runs.push({ label, command, exitCode, expectFail, tree, log, at: new Date().toISOString() });
    entry.mark = null;
    save(file, ledger);
    const asExpected = (exitCode !== 0) === expectFail;
    console.log(output.split(/\r?\n/).slice(-40).join('\n'));
    console.log(`devflow: step ${entry.step} "${label}" exited ${exitCode}${expectFail ? (asExpected ? ', failing as expected' : ', but it was expected to fail') : ''}. Log: .devflow/${ledger.task}/${log}`);
    process.exit(asExpected ? 0 : 1);
  },

  record([stepArg, verdict, ...rest]) {
    const { file, ledger } = loadLedger();
    const entry = entryFor(ledger, stepArg);
    if (entry.kind === 'script') die(`step ${entry.step} is decided by a command's exit code. Use: run`);
    if (!['passed', 'failed'].includes(verdict)) die('verdict must be passed or failed');
    const artefact = option(rest, '--artefact');
    if (!artefact || !fs.existsSync(path.resolve(root, artefact))) die('--artefact must point at an existing evidence file');
    entry.verdict = verdict;
    entry.verdictTree = treeHash();
    entry.artefacts = [artefact];
    entry.mark = null;
    save(file, ledger);
    console.log(`Step ${entry.step} recorded as ${verdict}.`);
  },

  mark([stepArg, mark, ...rest]) {
    const { file, ledger } = loadLedger();
    const entry = entryFor(ledger, stepArg);
    const reason = option(rest, '--reason');
    if (!['n/a', 'not-run'].includes(mark)) die('mark must be n/a or not-run');
    if (!reason) die('--reason is required: say why this step does not apply or could not run');
    entry.mark = mark === 'n/a' ? 'n/a' : 'not run';
    entry.reason = reason;
    save(file, ledger);
    console.log(`Step ${entry.step} marked ${entry.mark}.`);
  },

  status(args) {
    const { ledger } = loadLedger();
    const tree = treeHash();
    const config = loadConfig();
    const rows = ledger.entries.map((e) => ({ ...e, state: evaluate(e, tree, config) }));
    console.log(`Task "${ledger.task}", tier ${ledger.tier}`);
    for (const r of rows) {
      console.log(`${String(r.step).padStart(2)}  ${r.name.padEnd(18)} ${r.state}${r.reason ? `  (${r.reason})` : ''}`);
    }
    if (!args.includes('--gate')) return;
    // The gate guards opening a pull request, so by default it looks at the
    // steps up to Ship (24). Preview, promotion and follow-through come after.
    const through = Number(option(args, '--through') ?? 24);
    const blocking = rows.filter((r) => r.step <= through && ['pending', 'failed', 'stale'].includes(r.state));
    const skipped = rows.filter((r) => r.state === 'not run');
    if (skipped.length) console.log(`\nNot run, to be stated in the ship report: ${skipped.map((r) => r.step).join(', ')}`);
    if (!blocking.length) return console.log('\nGate: clean.');
    console.error('\nGate: blocked. Next steps:');
    for (const r of blocking) {
      const fix = { pending: 'run or record it, or mark it with a reason', failed: 'fix the failure and run it again', stale: 'the code changed since it ran, so run it again' }[r.state];
      console.error(`  step ${r.step} ${r.name} is ${r.state}: ${fix}`);
    }
    process.exit(1);
  },
};

const [name, ...args] = process.argv.slice(2);
if (!commands[name]) die(`unknown command "${name ?? ''}". Commands: ${Object.keys(commands).join(', ')}`);
commands[name](args);
