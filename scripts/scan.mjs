#!/usr/bin/env node
// devflow built-in checks. Each one inspects what changed against the base
// branch and exits 1 when it finds something a person needs to look at.
// They are run through the capture script: run <step> --builtin <name>
//
//   secrets    credentials in added lines (basic patterns; add gitleaks for depth)
//   deps       known vulnerabilities, using the package manager's own audit
//   newdeps    new direct dependencies nobody has approved, and lockfile drift
//   integrity  weakened tests and new lint or type suppressions
//   rules      the repo's written rules agree with the policy in devflow.config.json
//   entrypoints  every changed entry point states its auth and ownership checks
//   spec       the active task's spec.md is in a checkable form
//   plan       the active task's plan.md has sized, traceable slices
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const git = (...args) => execFileSync('git', ['-c', 'core.quotepath=off', ...args], {
  encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
});
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };

const root = git('rev-parse', '--show-toplevel').trim();
process.chdir(root);
const configFile = path.join(root, 'devflow.config.json');
const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};

// The commit this work branched from. Everything after it is "the change".
function baseCommit() {
  // Ask git which branch the remote treats as its default before guessing, since
  // many repos integrate on a branch other than main.
  const remoteDefault = tryGit('symbolic-ref', '--short', 'refs/remotes/origin/HEAD')?.trim();
  for (const ref of [config.base, remoteDefault, 'origin/main', 'main', 'origin/master', 'master'].filter(Boolean)) {
    const base = tryGit('merge-base', 'HEAD', ref);
    if (base) return base.trim();
  }
  return 'HEAD';
}

// Added and removed lines since the base, including uncommitted and new files.
function changes() {
  const base = baseCommit();
  const added = [];
  const removed = [];
  const status = new Map();
  for (const line of git('diff', '--name-status', '--no-renames', base).split('\n').filter(Boolean)) {
    const [code, file] = line.split('\t');
    status.set(file, code);
  }
  let file = null;
  let lineNo = 0;
  for (const line of git('diff', '--unified=0', '--no-color', '--no-renames', base).split('\n')) {
    if (line.startsWith('diff --git ')) file = line.slice(line.indexOf(' b/') + 3);
    else if (line.startsWith('@@')) lineNo = Number(/\+(\d+)/.exec(line)[1]);
    else if (line.startsWith('+++') || line.startsWith('---')) continue;
    else if (line.startsWith('+')) added.push({ file, line: lineNo++, text: line.slice(1) });
    else if (line.startsWith('-')) removed.push({ file, text: line.slice(1) });
  }
  for (const untracked of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) {
    const content = fs.readFileSync(untracked, 'utf8');
    if (content.includes('\0')) continue;
    status.set(untracked, 'A');
    content.split(/\r?\n/).forEach((text, i) => added.push({ file: untracked, line: i + 1, text }));
  }
  return { base, added, removed, status };
}

// The active task's working file, for the checks that read the spec or plan.
function taskFile(name) {
  const pointer = path.join(root, '.devflow', 'current');
  if (!fs.existsSync(pointer)) {
    console.error('devflow scan: no active task. Start one with: init <task> --tier <n>');
    process.exit(2);
  }
  const dir = path.join(root, '.devflow', fs.readFileSync(pointer, 'utf8').trim());
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    console.error(`devflow scan: ${path.relative(root, file)} does not exist yet`);
    process.exit(1);
  }
  // A file saved on Windows ends its lines with \r\n, and a stray \r stops the
  // patterns below from matching a single line.
  return { text: fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), dir };
}

// Requirements are list items of the form "- R1: text", each with an indented "Example:" line.
function parseRequirements(text) {
  const requirements = [];
  for (const line of text.split(/\r?\n/)) {
    const requirement = /^\s*[-*]\s*\*{0,2}(R\d+)\*{0,2}[:.]\s*(.+)$/.exec(line);
    if (requirement) requirements.push({ id: requirement[1], text: requirement[2].trim(), example: false });
    else if (/^\s+[-*]\s*\*{0,2}Example\*{0,2}:/i.test(line) && requirements.length) requirements[requirements.length - 1].example = true;
  }
  return requirements;
}
const VAGUE = /\b(fast|quick|quickly|slow|easy|easily|simple|secure|securely|robust|efficient|user-friendly|intuitive|seamless|appropriate|reasonable|scalable|reliable|properly)\b/i;

function report(title, findings, advice) {
  if (!findings.length) {
    console.log(`${title}: nothing found.`);
    return 0;
  }
  console.log(`${title}: ${findings.length} finding(s)`);
  for (const finding of findings) console.log(`  ${finding}`);
  console.log(advice);
  return 1;
}

// npm's own report runs to pages, and a reader who sees only the end of it can
// miss a critical finding near the top. This prints a short summary, worst
// first, that separates what ships to users from what only runs in development.
function npmAudit() {
  const load = (fixture, flags) => {
    const raw = process.env[fixture]
      ? fs.readFileSync(process.env[fixture], 'utf8')
      : spawnSync(`npm audit --json ${flags}`, { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout;
    try { return Object.values(JSON.parse(raw).vulnerabilities ?? {}); } catch { return null; }
  };
  const all = load('DEVFLOW_AUDIT_ALL', '');
  const production = load('DEVFLOW_AUDIT_PRODUCTION', '--omit=dev');
  if (!all || !production) {
    console.log('Dependencies (npm): the audit returned no result. Check the network, then run it again. Do not treat this as a pass.');
    return 1;
  }
  const rank = { critical: 0, high: 1, moderate: 2, low: 3 };
  const serious = (list) => list.filter((v) => rank[v.severity] <= 1).sort((a, b) => rank[a.severity] - rank[b.severity]);
  const tally = (list) => ['critical', 'high', 'moderate', 'low'].map((s) => [list.filter((v) => v.severity === s).length, s])
    .filter(([n]) => n).map(([n, s]) => `${n} ${s}`).join(', ') || 'none';
  const fix = (v) => (v.fixAvailable === true ? 'fix: npm audit fix' : v.fixAvailable ? 'fix needs a breaking upgrade' : 'no fix published yet');
  const shipped = new Set(production.map((v) => v.name));
  const blocking = serious(config.audit === 'all' ? all : production);
  const devOnly = serious(all).filter((v) => !blocking.includes(v) && !shipped.has(v.name));

  console.log(`Dependencies (npm), whole tree, whether or not this change touched it:`);
  console.log(`  production: ${tally(production)}`);
  console.log(`  development only: ${tally(all.filter((v) => !shipped.has(v.name)))}`);
  for (const v of blocking) console.log(`  BLOCKING  ${v.severity.padEnd(8)} ${v.name}  (${fix(v)})`);
  for (const v of devOnly) console.log(`  not blocking, development only  ${v.severity.padEnd(8)} ${v.name}  (${fix(v)})`);
  if (blocking.length) {
    console.log('A high or critical finding in a production dependency is a real exposure for users, whoever introduced it. Fix it in its own change. Report the worst severity exactly as listed here, and do not offer to waive it.');
    return 1;
  }
  if (devOnly.length) console.log('Nothing blocking. Tell the person about the development-only findings and suggest fixing them in a separate change.');
  return 0;
}

const SECRETS = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['Stripe live key', /\b[sr]k_live_[A-Za-z0-9]{20,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['LLM provider key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{40,}/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ['secret exposed to the browser', /\bNEXT_PUBLIC_\w*(?:SECRET|PRIVATE|SERVICE_ROLE)\w*/],
  ['hard-coded credential', /(?:api[_-]?key|secret|token|passw(?:or)?d)["']?\s*[:=]\s*["'][^"'\s]{16,}["']/i],
];
const PLACEHOLDER = /example|placeholder|changeme|your[_-]|xxxx|<[^>]+>|\$\{|process\.env|os\.environ/i;
const LOCKFILES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|uv\.lock)$/;
const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[^/]+$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$/;
const SNAPSHOT = /(^|\/)__snapshots__\/|\.snap$|-snapshots\//;
const ASSERTION = /\b(?:expect|assert\w*|should)\b/;
const SKIPPED = /\b(?:it|test|describe)\.(?:skip|only|todo)\b|\bx(?:it|describe)\(|@pytest\.mark\.(?:skip|xfail)|@unittest\.skip/;
const SUPPRESSION = /@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable|#\s*type:\s*ignore|#\s*noqa|\bas any\b/;

const checks = {
  secrets() {
    const findings = [];
    for (const { file, line, text } of changes().added) {
      if (LOCKFILES.test(file) || PLACEHOLDER.test(text)) continue;
      const hit = SECRETS.find(([, pattern]) => pattern.test(text));
      if (hit) findings.push(`${file}:${line}  ${hit[0]}`);
    }
    return report('Secrets', findings, 'Remove each one and load it from the environment. A real credential that was committed or pushed must also be rotated.');
  },

  deps() {
    if (fs.existsSync('package-lock.json')) return npmAudit();
    const audits = [
      ['pnpm-lock.yaml', 'pnpm audit --audit-level high'],
      ['requirements.txt', 'pip-audit -r requirements.txt'],
      ['poetry.lock', 'pip-audit'],
      ['uv.lock', 'pip-audit'],
    ].filter(([lockfile]) => fs.existsSync(lockfile));
    if (!audits.length) {
      console.log('Dependencies: no supported lockfile found, nothing to audit.');
      return 0;
    }
    let worst = 0;
    for (const [lockfile, command] of audits) {
      console.log(`$ ${command}   (${lockfile})`);
      const result = spawnSync(command, { shell: true, stdio: 'inherit' });
      worst = Math.max(worst, result.status ?? 1);
    }
    return worst === 0 ? 0 : 1;
  },

  newdeps() {
    const { base, status } = changes();
    const approved = new Set(config.approvedDependencies ?? []);
    const findings = [];
    const manifests = [...status.keys()].filter((f) => /(^|\/)package\.json$/.test(f) && !f.includes('node_modules/') && status.get(f) !== 'D');
    const names = (json) => {
      const pkg = json ? JSON.parse(json) : {};
      return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
    };
    for (const manifest of manifests) {
      const before = new Set(names(tryGit('show', `${base}:${manifest}`)));
      const fresh = names(fs.readFileSync(manifest, 'utf8')).filter((name) => !before.has(name));
      for (const name of fresh) if (!approved.has(name)) findings.push(`${manifest}: new dependency "${name}" is not approved`);
      if (fresh.length && ![...status.keys()].some((f) => LOCKFILES.test(f))) findings.push(`${manifest}: dependencies changed but no lockfile changed`);
    }
    return report('New dependencies', findings, 'For each new dependency, confirm it exists in the registry under exactly this name, check its age, repository and licence, then ask the person to approve it. Approval is recorded by adding the name to "approvedDependencies" in devflow.config.json.');
  },

  integrity() {
    const { added, removed, status } = changes();
    const findings = [];
    for (const [file, code] of status) {
      if (code === 'D' && TEST_FILE.test(file)) findings.push(`${file}: test file deleted`);
      if (code !== 'A' && SNAPSHOT.test(file)) findings.push(`${file}: snapshot ${code === 'D' ? 'deleted' : 'changed'}`);
    }
    const existing = (file) => status.get(file) === 'M' && TEST_FILE.test(file);
    const count = (lines, file) => lines.filter((l) => l.file === file && ASSERTION.test(l.text)).length;
    for (const file of new Set(removed.filter((l) => existing(l.file) && ASSERTION.test(l.text)).map((l) => l.file))) {
      findings.push(`${file}: ${count(removed, file)} assertion line(s) removed or changed, ${count(added, file)} added`);
    }
    for (const { file, line, text } of added) {
      if (SKIPPED.test(text)) findings.push(`${file}:${line}  test skipped or focused: ${text.trim()}`);
      else if (SUPPRESSION.test(text)) findings.push(`${file}:${line}  new suppression: ${text.trim()}`);
    }
    return report('Test integrity', findings, 'Each of these weakens a check. Undo it, or if the spec truly requires it, mark the step not-run with the reason so the person sees it before a pull request.');
  },

  // Repo rules. A rule written in several files drifts, so the policy block in
  // devflow.config.json is the one statement of it, and the files people and
  // agents read are checked against that.
  rules() {
    const policy = config.policy;
    if (!policy) {
      console.log('Repo rules: no "policy" block in devflow.config.json, so there is nothing to check against.');
      return 1;
    }
    const exists = (file) => fs.existsSync(path.join(root, file));
    const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
    const integration = policy.integrationBranch ?? 'main';
    const release = policy.releaseBranch ?? integration;
    const agentFile = policy.agentFile ?? 'AGENTS.md';
    const otherFile = agentFile === 'AGENTS.md' ? 'CLAUDE.md' : 'AGENTS.md';
    const findings = [];

    for (const file of [agentFile, 'CONTRIBUTING.md', '.github/pull_request_template.md', ...(policy.docs ?? [])]) {
      if (!exists(file)) findings.push(`${file}: missing`);
    }
    if (exists(agentFile) && exists(otherFile) && !read(otherFile).includes(agentFile)) {
      findings.push(`${otherFile}: does not point to ${agentFile}, so the two can drift apart. Make it a short pointer.`);
    }
    const budget = policy.instructionBudget ?? 80;
    const lines = [agentFile, otherFile].filter(exists).reduce((total, file) => total + read(file).trimEnd().split('\n').length, 0);
    if (lines > budget) findings.push(`agent instructions total ${lines} lines; the budget is ${budget}. Move reference material into docs and link to it.`);

    const remoteDefault = tryGit('symbolic-ref', '--short', 'refs/remotes/origin/HEAD')?.trim().replace(/^origin\//, '');
    if (remoteDefault && remoteDefault !== integration) findings.push(`the remote's default branch is ${remoteDefault}, but the policy integrates on ${integration}`);
    if (release !== integration && policy.enforcement !== 'hooks-only' && !exists('.github/workflows/branch-policy.yml')) {
      findings.push('.github/workflows/branch-policy.yml: missing, so nothing on the server checks where a pull request is aimed');
    }

    // Statements that disagree with the policy. Lines that are clearly about an
    // exception (never, only, hotfix, release) are left alone.
    const b = release.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const claims = release === integration ? [] : [
      [new RegExp(`branch(es|ing)?\\s+(off|from)\\s+\`?(origin/)?${b}\\b`, 'i'), `says to branch from ${release}; the policy branches from ${integration}`],
      [new RegExp(`(PRs?|pull requests?)\\s+(target|go to|into|against)\\s+\`?${b}\\b`, 'i'), `says pull requests target ${release}; the policy targets ${integration}`],
      [/trunk-based/i, `describes trunk-based development; the policy integrates on ${integration} and releases from ${release}`],
      ...(policy.mergeIntoRelease === 'merge' ? [[new RegExp(`squash[- ]merg\\w*\\s+(in)?to\\s+\`?${b}\\b`, 'i'), `says to squash into ${release}; the policy uses a merge commit`]] : []),
    ];
    // A template name such as docs/adr/NNNN-title.md is a pattern, not a pointer.
    const isPath = (ref) => !/[*<>{}$|@:]/.test(ref) && !/N{3,}|X{3,}|Y{4}/.test(ref)
      && (/\/.*\.\w{1,5}$/.test(ref) || /^[A-Z_]+\.md$/.test(ref));
    // Guides often name a file by the end of its path ("eval/run.ts" for
    // apps/server/eval/run.ts), and point at files each person creates for
    // themselves, such as .env. Neither is a broken pointer. Being gitignored is
    // not enough on its own to excuse a missing file: a whole docs folder can be
    // ignored and still be expected to exist.
    const tracked = (tryGit('ls-files') ?? '').split('\n');
    const resolves = (file, ref) => {
      const short = ref.replace(/^\.\//, '');
      return [path.resolve(root, ref), path.resolve(root, path.dirname(file), ref)].some((candidate) => fs.existsSync(candidate))
        || tracked.some((entry) => entry.endsWith(`/${short}`))
        || /^\.env(\.|$)|\.local\./.test(path.basename(short));
    };

    for (const file of [agentFile, otherFile, 'CONTRIBUTING.md', '.github/pull_request_template.md', 'README.md'].filter(exists)) {
      read(file).split('\n').forEach((line, i) => {
        for (const match of line.matchAll(/`([^`\s]+)`|\]\(([^)\s#]+)/g)) {
          const ref = match[1] ?? match[2];
          if (!isPath(ref)) continue;
          if (!resolves(file, ref)) findings.push(`${file}:${i + 1}  points to ${ref}, which does not exist`);
        }
        if (/\b(never|not|don't|except|only|hotfix|release|promot)/i.test(line)) return;
        for (const [pattern, problem] of claims) if (pattern.test(line)) findings.push(`${file}:${i + 1}  ${problem}`);
      });
    }
    return report('Repo rules', findings, 'The policy block in devflow.config.json is the source of truth. Fix the file, or change the policy if the file is right.');
  },

  // Step 20. Missing authorization at the real entry point is the most common
  // serious flaw in this kind of app, so every entry point must state where
  // the caller is identified and where ownership is checked.
  entrypoints() {
    const { text } = taskFile(path.join('evidence', '20-entry-points.md'));
    const rows = text.split('\n').filter((line) => line.trim().startsWith('|'))
      .map((line) => line.trim().split('|').slice(1, -1).map((cell) => cell.trim()));
    const header = rows.find((cells) => cells.some((c) => /entry point/i.test(c)));
    const entries = header ? rows.slice(rows.indexOf(header) + 1).filter((cells) => !cells.every((c) => /^:?-+:?$/.test(c))) : [];
    const findings = [];
    if (!header) findings.push('no entry-point table found');
    else if (!entries.length) findings.push('the table has no rows. If no entry point changed, mark the step instead of leaving the table empty.');
    for (const cells of entries) {
      header.forEach((column, i) => {
        if (!cells[i] || /^(none|n\/a|na|-|\?|todo|tbd|unknown)$/i.test(cells[i])) findings.push(`${cells[0] || 'unnamed entry point'}: no answer for "${column}"`);
      });
    }
    return report('Entry points', findings, 'Every entry point needs an answer in every column. A check in middleware, a layout or a page does not count for a route handler or a server action.');
  },

  // Step 1. A requirement the verifier cannot check is the most expensive kind
  // of mistake, so the spec has to be in a form a machine can at least parse.
  spec() {
    const { text } = taskFile('spec.md');
    const findings = [];
    if (/^Form:\s*short/im.test(text)) {
      for (const line of ['Change', 'Unchanged', 'Check']) {
        if (!new RegExp(`^${line}:\\s*\\S`, 'm').test(text)) findings.push(`short form is missing a "${line}:" line`);
      }
      return report('Spec', findings, 'A short-form spec needs three lines: Change, Unchanged and Check.');
    }
    const sections = { Problem: 'Problem', Requirements: 'Requirements', 'Non-goals': 'Non-goals', 'Unchanged behaviour': 'Unchanged behaviou?r', 'Provisional tier': 'Provisional tier' };
    for (const [label, pattern] of Object.entries(sections)) {
      if (!new RegExp(`^##\\s+${pattern}`, 'im').test(text)) findings.push(`missing section "## ${label}"`);
    }
    const requirements = parseRequirements(text);
    if (!requirements.length) findings.push('no requirements found. Write each as "- R1: ... the system shall ..."');
    for (const r of requirements) {
      const shalls = (r.text.match(/\bshall\b/gi) ?? []).length;
      if (shalls !== 1) findings.push(`${r.id}: needs exactly one "shall", found ${shalls}. Split it or rewrite it.`);
      if (!/^(the|when|while|where|if)\b/i.test(r.text)) findings.push(`${r.id}: start with The, When, While, Where or If, so the trigger is explicit`);
      const vague = r.text.match(VAGUE);
      if (vague && !/\d/.test(r.text)) findings.push(`${r.id}: "${vague[0]}" cannot be checked. Give a number or a concrete condition.`);
      if (!r.example) findings.push(`${r.id}: no "Example:" line under it`);
    }
    return report('Spec', findings, [
      'Fix each line, then run this check again before asking for approval. The expected shape is:',
      '  ## Problem',
      '  ## Requirements',
      '  - R1: When <trigger>, the system shall <response>.',
      '    - Example: Given <state>, when <action>, then <what can be observed>.',
      '  ## Non-goals',
      '  ## Unchanged behaviour',
      '  ## Provisional tier',
      'A tier 1 change can use the short form instead: a line "Form: short", then "Change:", "Unchanged:" and "Check:" lines.',
      'The spec skill (devflow:spec) has the full template.',
    ].join('\n'));
  },

  // Step 3. The value of a design doc is in what was weighed and turned down,
  // so the check looks for the alternatives and for questions left open.
  design() {
    const text = taskFile('design.md').text.replace(/\r\n/g, '\n');
    const findings = [];
    const section = (name) => {
      const match = new RegExp(`^##\\s+${name}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'im').exec(text);
      return match ? match[1] : null;
    };
    for (const name of ['Context', 'Goals', 'Non-goals', 'Design', 'Alternatives', 'Drawbacks', 'Open questions']) {
      if (section(name) === null) findings.push(`missing section "## ${name}"`);
      else if (!section(name).trim()) findings.push(`section "## ${name}" is empty`);
    }
    const alternatives = (section('Alternatives') ?? '').split(/^###\s+/m).slice(1);
    if (alternatives.length < 2) findings.push(`needs at least two alternatives, each under its own "### " heading, found ${alternatives.length}`);
    for (const alternative of alternatives) {
      const title = alternative.split('\n')[0].trim();
      if (!/^\s*\*{0,2}Rejected because\*{0,2}:?\s*\S/im.test(alternative)) findings.push(`alternative "${title}" has no "Rejected because" line`);
    }
    if (alternatives.length && !alternatives.some((a) => /do nothing|simplest/i.test(a.split('\n')[0]))) {
      findings.push('one alternative must be "Do nothing" or "Simplest possible", so the cost of the design is weighed against not building it');
    }
    const open = section('Open questions') ?? '';
    const before = /^###\s+Before coding[^\n]*\n([\s\S]*?)(?=^###\s|(?![\s\S]))/im.exec(open);
    if (!before) findings.push('"## Open questions" needs a "### Before coding" part and a "### During" part');
    else if (before[1].split('\n').some((line) => /^\s*[-*]\s+(?!none\b)\S/i.test(line))) {
      findings.push('a "Before coding" question is still open. Answer it with the person, or move it to "During" if the build can start without it.');
    }
    const pages = text.split(/\s+/).length / 500;
    if (pages > 3) findings.push(`about ${Math.ceil(pages)} pages long. Keep it to three, or the task is several designs.`);
    return report('Design doc', findings, 'Fix each line, then run this check again. The design skill (devflow:design) has the template.');
  },

  // Step 7. Sizes and traceability are checked before any code exists, because
  // an oversized slice found mid-build has to be untangled by hand.
  plan() {
    const { text, dir } = taskFile('plan.md');
    const findings = [];
    for (const section of ['Slices', 'Test strategy', 'Feature flag', 'Rollback', 'Cost']) {
      if (!new RegExp(`^##\\s+${section}`, 'im').test(text)) findings.push(`missing section "## ${section}"`);
    }
    const rows = text.split('\n').filter((line) => line.trim().startsWith('|'))
      .map((line) => line.trim().split('|').slice(1, -1).map((cell) => cell.trim()));
    const header = rows.find((cells) => cells.some((c) => /est/i.test(c)) && cells.some((c) => /class/i.test(c)));
    const slices = header ? rows.filter((cells) => /^\d+$/.test(cells[0])) : [];
    if (!header) findings.push('no slice table found. It needs "Class", "Est. lines" and "Requirements" columns.');
    else if (!slices.length) findings.push('the slice table has no rows');
    const cell = (cells, pattern) => cells[header.findIndex((c) => pattern.test(c))] ?? '';
    const covered = new Set();
    const reasons = [];
    for (const cells of slices) {
      const id = cells[0];
      const estimate = Number(cell(cells, /est/i));
      if (!Number.isFinite(estimate) || estimate <= 0) findings.push(`slice ${id}: no line estimate`);
      else if (estimate > 500) findings.push(`slice ${id}: estimated at ${estimate} lines. The ceiling is 500, so split it.`);
      else if (estimate > 400) reasons.push(`slice ${id} is estimated at ${estimate} lines`);
      if (!/^(behaviou?r|refactor|mechanical)/i.test(cell(cells, /class/i))) findings.push(`slice ${id}: class must be behaviour, refactor or mechanical, one per slice`);
      for (const ref of cell(cells, /require/i).match(/R\d+/g) ?? []) covered.add(ref);
    }
    const specFile = path.join(dir, 'spec.md');
    if (fs.existsSync(specFile)) {
      for (const r of parseRequirements(fs.readFileSync(specFile, 'utf8'))) {
        if (!covered.has(r.id)) findings.push(`${r.id} from the spec is not covered by any slice`);
      }
    }
    const data = /^##\s+Data changes[^\n]*\n+([^\n#]*)/im.exec(text)?.[1].trim();
    if (data && !/^none\b/i.test(data)) reasons.push('it changes data or schema');
    if (/new dependenc/i.test(text) && !/no new dependenc/i.test(text)) reasons.push('it adds a dependency');
    console.log(reasons.length
      ? `Plan approval at tier 2: needed, because ${reasons.join(' and ')}.`
      : 'Plan approval at tier 2: not needed. Tell the person the plan and proceed.');
    return report('Plan', findings, 'Fix each line, then run this check again.');
  },
};

const name = process.argv[2];
if (!checks[name]) {
  console.error(`devflow scan: unknown check "${name ?? ''}". Checks: ${Object.keys(checks).join(', ')}`);
  process.exit(2);
}
process.exit(checks[name]());
