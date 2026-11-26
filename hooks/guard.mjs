#!/usr/bin/env node
// devflow hooks. One script handles every hook event, reading the event as JSON
// on stdin. These are the rules with no exceptions, so they live here and not
// in skill text, which an agent may decide does not apply.
//
// If anything unexpected goes wrong the hook stays silent and exits 0, so a
// bug here can never lock a session.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runScript = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'run.mjs');

// Committed files matching these are protected while a task is active. A test
// the builder has just written can still be edited until it is committed.
const PROTECTED = [
  '**/*.test.*', '**/*.spec.*', '**/__snapshots__/**', '**/__tests__/**',
  'test/**', 'tests/**', '.github/workflows/**', 'devflow.config.json',
];

const GIT_OPTIONS = String.raw`(?:\s+-[cC]\s+\S+|\s+--[\w-]+(?:=\S+)?)*`;
const MERGE = [
  new RegExp(String.raw`\bgit${GIT_OPTIONS}\s+merge(?:\s+(?!--abort)|$)`),
  /\bgh\s+pr\s+merge\b/,
  /\bgh\s+api\b.*\/merge\b/,
];
const PR_CREATE = /\bgh\s+pr\s+create\b/;

function decide(permissionDecision, permissionDecisionReason) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason } }));
  process.exit(0);
}

function repoRoot(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function activeTask(root) {
  const pointer = root && path.join(root, '.devflow', 'current');
  return pointer && fs.existsSync(pointer) ? fs.readFileSync(pointer, 'utf8').trim() : null;
}

function ledgerStatus(root, ...flags) {
  const r = spawnSync(process.execPath, [runScript, 'status', ...flags], { cwd: root, encoding: 'utf8' });
  return { clean: r.status === 0, text: `${r.stdout}${r.stderr}`.trim() };
}

function globToRegExp(glob) {
  const body = glob.replace(/\*\*\/|\*\*|\*|[.+^${}()|[\]\\?]/g, (token) => (
    { '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*' }[token] ?? `\\${token}`
  ));
  return new RegExp(`^${body}$`);
}

// Canonical path, even for a file that does not exist yet. Needed because the
// same folder can be spelled two ways (short and long names on Windows, links).
function real(target) {
  try {
    return fs.realpathSync.native(target);
  } catch {
    const parent = path.dirname(target);
    return parent === target ? target : path.join(real(parent), path.basename(target));
  }
}

function isCommitted(root, relative) {
  return spawnSync('git', ['cat-file', '-e', `HEAD:${relative}`], { cwd: root, stdio: 'ignore' }).status === 0;
}

const handlers = {
  PreToolUse(event, root) {
    const input = event.tool_input ?? {};
    if (typeof input.command === 'string') return shellCommand(input.command, root);
    const file = input.file_path ?? input.notebook_path;
    if (file) return fileEdit(file, root);
  },

  // One nudge, not a wall: failed or stale steps are worth a second look, but
  // the agent may be stopping to ask the person something.
  Stop(event, root) {
    if (event.stop_hook_active || !activeTask(root)) return;
    const { text } = ledgerStatus(root);
    const broken = text.split(/\r?\n/).filter((line) => /\s(failed|stale)(\s|$)/.test(line));
    if (!broken.length) return;
    console.log(JSON.stringify({
      decision: 'block',
      reason: `devflow: these steps are failed or stale:\n${broken.join('\n')}\nFix and re-run them now. If you are waiting on the person, say exactly what you need from them, then stop.`,
    }));
  },

  // After the conversation is compacted the agent may have lost track of the
  // task, so put the ledger back in front of it.
  SessionStart(event, root) {
    const task = activeTask(root);
    if (!task) return;
    console.log(`devflow: task "${task}" is in progress in this repo. Ledger state:\n${ledgerStatus(root).text}\nContinue from the first pending step. Working files are in .devflow/${task}/.`);
  },
};

// The repo's branch policy, from the "policy" block in devflow.config.json.
// These apply whether or not a task is active, since they are rules of the
// repo and not of one piece of work.
function branchPolicy(command, root) {
  const configFile = root && path.join(root, 'devflow.config.json');
  const policy = configFile && fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')).policy : null;
  if (!policy) return;
  const integration = policy.integrationBranch ?? 'main';
  const release = policy.releaseBranch ?? integration;
  const hotfix = policy.hotfixPrefix ?? 'hotfix/';
  const current = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const strip = (ref) => (ref ?? '').replace(/^origin\//, '');

  const created = /\bgit\s+(?:switch\s+(?:-c|--create)|checkout\s+-b)\s+["']?([\w./-]+)["']?(?:\s+["']?([\w./-]+))?/.exec(command);
  if (created) {
    const [, name, start] = created;
    const from = strip(start) || current;
    const prefixes = [...(policy.branchPrefixes ?? []), hotfix];
    if (policy.branchPrefixes && !prefixes.some((prefix) => name.startsWith(prefix))) {
      decide('deny', `devflow: branch names in this repo start with one of: ${prefixes.join(', ')}. Rename "${name}".`);
    }
    if (release !== integration && from === release && !name.startsWith(hotfix)) {
      decide('deny', `devflow: work branches from ${integration}, not ${release}. Use: git switch -c ${name} origin/${integration}`);
    }
  }

  const base = /\bgh\s+pr\s+create\b[^|;&\n]*?(?:--base|-B)[=\s]+["']?([\w./-]+)/.exec(command)?.[1];
  if (base && base !== integration && !(base === release && (current === integration || current.startsWith(hotfix)))) {
    decide('deny', `devflow: pull requests in this repo target ${integration}. Only ${integration} and ${hotfix}* branches go to ${release}. Use: --base ${integration}`);
  }

  const pushed = new RegExp(`\\bgit\\s+push\\b[^|;&\\n]*(?:\\s|:|:refs/heads/)(${[release, integration].join('|')})(?=\\s|$)`).exec(command);
  if (pushed) {
    decide('deny', `devflow: ${pushed[1]} is a protected branch here. Push your work branch and open a pull request into ${integration}.`);
  }

  const message = /\bgit\s+commit\b[^|;&\n]*?\s-m\s+(["'])([\s\S]+?)\1/.exec(command)?.[2];
  if (message && policy.commits === 'conventional') {
    const subject = message.split('\n')[0];
    if (!/^(feat|fix|docs|chore|refactor|perf|test|build|ci|style|revert)(\([\w./-]+\))?!?: \S/.test(subject)) {
      decide('deny', `devflow: this repo uses Conventional Commits. Start the subject with a type, for example "fix: ${subject.slice(0, 40)}".`);
    }
  }
}

function shellCommand(command, root) {
  if (MERGE.some((pattern) => pattern.test(command))) {
    decide('deny', 'devflow: merging belongs to the person, not the agent. Do not merge locally or on GitHub. Report that the branch is ready and stop.');
  }
  branchPolicy(command, root);
  // Approving the spec or the plan is the person's call, so recording either as
  // passed puts the question in front of them.
  const approval = /run\.mjs["']?\s+record\s+(1|7)\s+passed\b/.exec(command);
  const task = approval && activeTask(root);
  if (task) {
    // The spec always needs the person. The plan needs them at tier 3; at tier 2
    // the plan skill decides whether to stop, from what the plan check reports.
    const tier = JSON.parse(fs.readFileSync(path.join(root, '.devflow', task, 'ledger.json'), 'utf8')).tier;
    const what = approval[1] === '1' ? 'the spec' : 'the plan';
    if (approval[1] === '1' || tier === 3) {
      decide('ask', `devflow: this records ${what} as approved. Approve only if you have read it and agree with it.`);
    }
  }
  if (!PR_CREATE.test(command)) return;
  if (!activeTask(root)) decide('ask', 'devflow: opening a pull request needs the person\'s go-ahead.');
  const gate = ledgerStatus(root, '--gate');
  if (!gate.clean) {
    decide('deny', `devflow: the ledger is not clean, so no pull request yet.\n${gate.text}\nFinish those steps, then report what to test and wait for a go-ahead.`);
  }
  decide('ask', `devflow: the ledger is clean. Opening a pull request still needs the person's go-ahead.\n${gate.text}`);
}

function fileEdit(file, root) {
  if (!root || !activeTask(root)) return;
  const relative = path.relative(real(root), real(path.resolve(root, file))).split(path.sep).join('/');
  if (relative.startsWith('..')) return;
  if (relative.startsWith('.devflow/') && relative.endsWith('ledger.json')) {
    decide('deny', 'devflow: the ledger is written only by the capture script. Use its run, record or mark commands.');
  }
  const configFile = path.join(root, 'devflow.config.json');
  const extra = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')).protected ?? [] : [];
  const hit = [...PROTECTED, ...extra].find((glob) => globToRegExp(glob).test(relative));
  if (hit && isCommitted(root, relative)) {
    decide('ask', `devflow: ${relative} is a committed, protected file (${hit}). Changing a test, snapshot, threshold or CI setting to get a pass is not allowed. If the spec really requires this edit, the person must approve it.`);
  }
}

try {
  const event = JSON.parse(fs.readFileSync(0, 'utf8'));
  handlers[event.hook_event_name]?.(event, repoRoot(event.cwd ?? process.cwd()));
} catch {
  // Stay out of the way.
}
