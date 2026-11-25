# devflow build plan

This is the full plan for the devflow pipeline: the architecture, what each of the 26 steps does and how it passes, how the pipeline itself is tested, and the order to build it in. It replaces the assumptions in the first slice where research contradicted them.

Each pass bar is labelled by where it comes from, so a house rule is never presented as an industry standard:

- **[S]** sourced from a primary publication (Google, Amazon, GitLab, W3C, Anthropic and similar)
- **[C]** a common convention with no strong evidence behind the number
- **[P]** a proposal made for this plan, to be tuned from recorded results

## 1.0 What devflow is

devflow is a small amount of deterministic machinery with skills around it. The machinery (hooks, a capture script, test runners and scanners with exit codes) carries correctness. Skills supply judgement: writing the spec, slicing the plan, reviewing design. A person owns intent and the irreversible moments.

Three findings drive this shape:

1. An instruction in a skill is guidance the agent may decide does not apply. Anything that must happen every time has to be a hook.
2. An agent's own summary of what it did is not evidence. Evidence is the command, its exit code and its output, captured by a script.
3. A reviewer agent is independent in context but not in judgement. Same-model reviewers lean generous and catch roughly half of seeded defects, so review cannot be the correctness gate.

## 2.0 Architecture

### 2.1 Components

| Component | What it is | Job |
|-----------|-----------|-----|
| Config | `devflow.config.json` in each target repo | Maps check names (test, lint, typecheck, build, coverage and so on) to that repo's commands, so the pipeline stays stack-agnostic |
| Capture script | `scripts/run.mjs`, plain Node with no dependencies | Runs a named check, then writes the command, exit code, output excerpt, artefact paths and commit SHA to the ledger |
| Ledger | `.devflow/<task>/ledger.json` | The single record of which steps ran and how they ended |
| Hooks | `hooks/hooks.json`, five command hooks | Enforce the rules that have no exceptions |
| Verifier | A named plugin agent with a tool allow-list | Judges the steps that need judgement, and spot-checks evidence |
| Skills | `flow`, `spec`, `design`, `plan`, `build`, `qa`, `harden`, `ship` | Guide the agent through each stage |
| Evals | `evals/` case folders run by `claude plugin eval` | Show whether a change to the pipeline made it better or worse |

### 2.2 The ledger

One entry per applicable step:

```json
{
  "step": 11,
  "name": "regression",
  "status": "passed",
  "command": "npm test -- --coverage",
  "exitCode": 0,
  "sha": "b66a2e9",
  "artefacts": ["evidence/11-coverage.txt"],
  "reason": null
}
```

Only the capture script writes `status`, `command`, `exitCode` and `sha`. The agent may write `reason`, and only when a step is `n/a` or `not run`. An entry whose `sha` is older than the current commit is stale and counts as not run.

Working evidence stays untracked in `.devflow/`. Durable artefacts are committed to the target repo and listed separately from the PR size count: design docs, the threat model and the data inventory.

### 2.3 Hooks

Kept to five, because a long list of hooks turns into preferences nobody maintains. Each error message states the exact next step, since the message lands in the agent's context.

| # | Event | Rule |
|---|-------|------|
| 1 | Before `gh pr create` | Blocked unless the ledger shows every applicable step passed or waived, and a recorded human go-ahead |
| 2 | Before an edit to a protected path | Blocked during build: committed tests, snapshot baselines, coverage and mutation thresholds, retry and timeout settings, the quarantine list, CI config |
| 3 | On stop | Blocked while the ledger has pending steps for the current slice, unless the agent is waiting at a human gate |
| 4 | On session start after compaction | Re-injects the current task, tier, slice and gate state |
| 5 | Before `git merge` and merge commands in `gh` | Always blocked. Merging belongs to the person |

### 2.4 The verifier (hybrid design)

Steps split by who can be trusted to decide them:

| Decided by | Steps |
|-----------|-------|
| Scripts with exit codes | 9, 11, 12, 13, 14, 16, the scan half of 17 and 20, 18, 19 |
| Verifier agent | 10, the manual half of 17 and 20, the design half of 21, 22 |
| Builder agent | 2, 8 |
| Person | Approval of 1, 7 (by tier), 24, 25 |

The verifier is a named, non-fork agent defined in the plugin. It receives the spec, the plan's decision log, the diff, the full touched files, the repo's conventions file and the ledger. It does not receive the builder's conversation. It can read, run the app and drive a browser, but cannot edit source.

Its findings use three severities taken from Google's review standard: **Blocking**, **Should-fix** and **Nit**. Only Blocking stops the pipeline. Fix loops are capped at five before the pipeline escalates to the person.

Tier 1 changes skip the verifier entirely. Scripts plus a person reading a small diff is what the cost evidence supports.

### 2.5 Human gates

| Gate | Tier 1 | Tier 2 | Tier 3 |
|------|--------|--------|--------|
| After spec | One-line confirm | Stop | Stop |
| After plan | No plan | Notify and proceed, unless the plan has a migration, a new dependency or a slice estimated over 400 lines | Stop |
| Before PR | Stop | Stop | Stop |
| Before promotion to production | Stop | Stop | Stop |

Each gate presents three things and nothing else: what will change, what evidence exists, and what is unverified.

### 2.6 Tiers

| Tier | Triggers |
|------|----------|
| **3** | Authentication, sessions, permissions. Payments or money maths. Schema migrations. New or changed public endpoints. Personal data. LLM prompts, tools or model settings. New dependency or GitHub Action. CI workflow changes. `proxy.ts`, `middleware.ts` or `next.config.*`. File upload. Row-level security policies. Environment variable names. |
| **2** | Any other behaviour change |
| **1** | Copy, styles, docs, comments |

When unsure, pick the higher tier. A person can override, and the override is recorded.

### 2.7 Change size

Target 200 lines of diff per slice, warn above 400, stop at 500. Generated files and lockfiles are excluded from the count but listed. Refactors land as their own slice ahead of behaviour changes. The 500 ceiling is a standing rule; 200 and 400 are **[P]**, anchored on Google's guidance that about 100 to 200 lines is a good size.

## 3.0 The 26 steps

"Runs" gives the lowest tier and any condition. A step whose condition does not hold is recorded `n/a` with a reason.

### Define

**Step 1: Spec**
- **Runs:** every tier (tier 1 uses a three-line form)
- **Does:** interviews the person in one round, then writes the problem, non-goals, an "unchanged behaviour" list, and each requirement as one EARS sentence ("While X, when Y, the system shall Z") with an ID and one worked example. Adds a requirement for each failure path, the top three reasons the change might not succeed, and a provisional tier.
- **Pass bar:** every requirement parses as EARS and has an example; no unquantified words such as "fast" or "secure"; person approves. **[P]**
- **Evidence:** `spec.md`, output of the requirement lint script, recorded approval

**Step 2: Explore**
- **Runs:** tier 2 and up
- **Does:** lists affected files, existing code to reuse (with the searches used), and sensitive paths touched. Runs the repo's test, lint, typecheck and build commands once and writes them to `devflow.config.json`.
- **Pass bar:** baseline run is green, or its failures are listed before any change. **[P]**
- **Evidence:** `explore.md`, captured baseline run

**Step 3: Design doc**
- **Runs:** tier 3
- **Does:** one to three pages: context, goals and non-goals, the design, at least two alternatives (one being "do nothing or simplest possible") with reasons for rejection, drawbacks, and open questions split into "before coding" and "during". May be skipped with a recorded reason when the solution is unambiguous.
- **Pass bar:** two alternatives with reasons; zero open "before coding" questions; a fresh agent can state what was rejected from the doc alone. **[P]**, structure **[S]**
- **Evidence:** committed design doc

**Step 4: API and schema review**
- **Runs:** tier 3, when an API contract or schema changes
- **Does:** writes the contract first, then diffs it against the last release for the seven breaking changes: remove, rename, retype, new required field, optional to required, default change, meaning change. Classifies each migration as additive or destructive.
- **Tools:** Zod or Pydantic schemas, an OpenAPI diff, a database branch for rehearsal
- **Pass bar:** zero breaking changes without a migration path; new schema works with currently deployed code and new code works with the old schema. **[S]**
- **Evidence:** contract diff output

**Step 5: Privacy review**
- **Runs:** tier 3, when the change collects, stores, logs, displays, sends or derives information about an identifiable person
- **Does:** updates a data inventory: for each field, its purpose, classification, where it is stored, every recipient including LLM services, retention and deletion method. Checks no personal data lands in URLs, logs or analytics. Based on PIPEDA's ten fair information principles.
- **Pass bar:** every personal field in the change is inventoried; none goes to an uninventoried third party. **[P]**, principles **[S]**
- **Evidence:** committed data inventory diff

**Step 6: Threat model**
- **Runs:** tier 3, when the attack surface changes
- **Does:** a data-flow sketch with trust boundaries, a STRIDE pass on each flow that crosses one, and a response for every threat. Each mitigation becomes a spec requirement with a planned negative test. For LLM features, records which of untrusted input, private data and external action the feature holds, and never all three.
- **Pass bar:** zero threats without a response; zero mitigations without a linked test; accepting a threat needs the person's sign-off. **[P]**, method **[S]**
- **Evidence:** committed threat model

**Step 7: Plan**
- **Runs:** tier 2 and up
- **Does:** confirms the tier and cuts the work into slices. Each slice has one purpose, one change class (behaviour change, refactor or mechanical), a size estimate, its tests and the requirement IDs it covers. Adds the flag plan (name, default off, expiry, removal task) and a rollback plan covering code, data and config separately, since a Vercel rollback reverts code only. Records decisions made in conversation so the verifier can see them.
- **Pass bar:** every slice at or under 500 lines; every requirement traced to a slice; no slice mixes change classes or pairs a destructive migration with the code that depends on it. **[S]** for the rules, **[P]** for the numbers
- **Evidence:** `plan.md`, output of the plan validator script

### Build

**Step 8: Implement**
- **Runs:** every tier
- **Does:** works in a fresh session from the spec and plan. Writes a test for each requirement first, shows it failing on an assertion, commits it, then implements. From that point the tests are protected by hook 2. New behaviour sits behind a flag whose off state is the old behaviour. The builder is told it may stop and report when a test conflicts with the spec, which is the strongest known control against forcing a pass.
- **Pass bar:** red-then-green recorded for each new behaviour; every new dependency exists, is in the lockfile and has a one-line reason; no new type or lint suppressions without a reason. **[S]** for the practices, **[P]** for the capture mechanics
- **Evidence:** captured failing run, captured passing run

**Step 9: Best-practices pass**
- **Runs:** tier 2 and up
- **Does:** tool-driven, with no reviewer agent. Formatter, linter with no warning tier (each rule is an error or off), strict typecheck, a count of new suppressions, clone detection, unused code detection, and a test-integrity diff that lists every deleted test, loosened assertion, added skip and changed snapshot.
- **Pass bar:** zero tool errors; every test-integrity entry has a person-approved reason. **[S]**. A complexity score above 15 triggers "explain or refactor" only. **[C]**
- **Evidence:** captured tool output, test-integrity report

### Prove it works

**Step 10: Functional QA** (verifier)
- **Runs:** every tier (tier 1: person checks instead)
- **Does:** exercises every requirement in a production build of the running app, never the dev server, on the happy path and the main failure path. Adds one time-boxed exploratory pass. Any defect found gets a failing test before the fix.
- **Pass bar:** every requirement has evidence from the running app; zero console errors and zero unexpected 4xx or 5xx responses. "Verified by reading the code" does not count. **[P]**
- **Evidence:** traceability table with a trace or screenshot per requirement

**Step 11: Regression**
- **Runs:** every tier
- **Does:** full test suite with zero retries, typecheck, lint, production build. For a flagged change, the suite runs with the flag off and on. New tests run ten times before they are accepted.
- **Pass bar:** all green; at least 90% coverage on changed lines **[S]**; project coverage does not fall; at most five quarantined tests, none older than seven days **[P]**
- **Evidence:** captured runs, changed-line coverage report

**Step 12: Mutation testing**
- **Runs:** tier 2 and up, when logic changed
- **Does:** mutates only changed files that hold logic, and lists the mutants that survive. Each survivor is killed by a stronger test or marked equivalent with a reason.
- **Tools:** StrykerJS, mutmut
- **Pass bar:** zero unexplained survivors on changed lines **[S]**. A score of 60 on changed files is a backstop only. **[C]**
- **Evidence:** mutation report

**Step 13: Property and fuzz tests**
- **Runs:** tier 3, when the change touches a parser, serializer, money or date arithmetic, a state machine, an idempotent handler or an authorization rule
- **Does:** implements at least one property stated in the spec: round-trip, invariant, idempotence or "never throws". Failing cases are committed as fixed regression tests.
- **Tools:** fast-check, Hypothesis
- **Pass bar:** 100 runs per property, zero failures. **[C]**
- **Evidence:** captured run with the seed

**Step 14: Contract tests**
- **Runs:** tier 3, when the change crosses a service boundary, a third-party API or a webhook
- **Does:** every external boundary parses responses through a runtime schema. A single Next.js app using server actions records "covered by typecheck".
- **Pass bar:** zero unapproved breaking changes; no bare casts at a boundary. **[P]**
- **Evidence:** schema diff, boundary lint output

**Step 15: UI stress**
- **Runs:** tier 2 and up, when UI changed
- **Does:** per changed screen: zero, one and many rows; strings 40% longer and one 200-character unbroken token; widths of 320, 375, 768 and 1280 pixels and 200% zoom; light and dark; slow network with a 4x slower CPU; offline mid-flow; a double-click on every submit.
- **Tools:** Playwright, Lighthouse CI
- **Pass bar:** largest contentful paint at most 2.5 s, layout shift at most 0.1, interaction latency at most 200 ms **[S]**; no horizontal overflow at 320 pixels **[S]**; exactly one record from a double submit **[P]**
- **Evidence:** screenshots per state, Lighthouse report

**Step 16: Visual regression**
- **Runs:** tier 2 and up, when UI changed
- **Does:** compares screenshots against baselines generated only in a fixed container, never on a workstation, since fonts render differently across systems. Updating a baseline is a separate commit the person approves.
- **Pass bar:** zero unapproved diffs. Pixel tolerances are **[C]**
- **Evidence:** diff images

**Step 17: Accessibility**
- **Runs:** tier 2 and up, when UI changed
- **Does:** an automated scan with WCAG 2.2 AA rules explicitly switched on, since they are off by default. Then a manual half by the verifier: every flow completed by keyboard alone with visible focus, plus a screen reader pass for names, roles and announcements.
- **Tools:** axe-core with Playwright, a JSX accessibility lint plugin
- **Pass bar:** zero scan violations **[S]** and the manual script passed. A clean scan alone is never reported as "accessible", because scanners catch only about half of issues.
- **Evidence:** scan output, manual script results

### Prove it holds up

**Step 18: Backend stress**
- **Runs:** tier 3, when server code changed
- **Does:** load, spike and a short endurance run against a local production build with a local or branch database. Preview gets a low-rate smoke test only, because Vercel's published policy restricts load testing. Checks every outbound call has a timeout and every retried write is idempotent.
- **Tools:** k6
- **Pass bar:** error rate under 1%; p95 under 500 ms on the first run, then no more than 20% worse than the stored baseline; peak database connections under 70% of the limit; zero duplicate side effects. **[P]**, anchored on k6 and Google SRE examples
- **Evidence:** k6 summary, connection count

**Step 19: Database optimization**
- **Runs:** tier 3, when queries or schema changed
- **Does:** seeds tens of thousands of rows first, since query plans on tiny tables mean nothing. Captures the plan for each changed query. Checks every foreign key and every security-policy column is indexed, that list endpoints issue the same number of queries for 1 row as for 20, and that migrations follow the safe-migration rules: additive only, indexes built concurrently, constraints added unvalidated then validated, and a lock timeout set.
- **Pass bar:** each query at most 100 ms on seeded data **[S]**; zero extra queries per extra row; zero unindexed foreign keys; zero dangerous migration operations. **[S]**
- **Evidence:** query plans, query-count test output, migration lint output

**Step 20: Security review**
- **Runs:** scans on every tier; manual half at tier 2 and up when an entry point changes
- **Does (scans):** secrets in the diff and history, static analysis with security rules, dependency vulnerabilities, framework on a patched version, lockfile integrity, a cooldown on newly published packages, licence allow-list, and person approval for each new direct dependency.
- **Does (manual, verifier):** a table of every new or changed entry point (route handlers, server actions, webhooks, cron routes) showing the line where the session is verified and where ownership is checked. No entry point may rely on middleware or a page-level check alone. Each gets a negative test for an unauthenticated caller and a wrong user.
- **Tools:** gitleaks, Semgrep, osv-scanner
- **Pass bar:** zero secrets; zero critical or high findings in code or in dependencies that have a fix; zero entry points without an explicit auth decision; zero blocked licences; a written disposition for each medium finding. **[P]**, synthesized from OWASP and vendor guidance
- **Evidence:** scan outputs, entry-point table

**Step 21: AI evals**
- **Runs:** tier 3, when prompts, model settings, tool definitions, retrieval or guardrail code change
- **Does (design):** checks the feature against the rule that it must not hold untrusted input, private data and the ability to act externally all at once, that tool permissions are minimal, and that model output is treated as untrusted input. Consequential outcomes must be prevented by design, not by a filter.
- **Does (measured):** runs the feature's eval set (30 to 50 cases to start, one pass/fail evaluator per failure mode, three runs each) and a set of injection probes.
- **Tools:** promptfoo, Inspect AI
- **Pass bar:** no evaluator's pass rate drops; zero failures on the "must never" list; zero successful injections that exfiltrate data or trigger an unauthorized action. **[P]**. The evidence file states that passing is a regression check and not proof of robustness, since no published defence holds against a determined attacker.
- **Evidence:** eval results, design checklist

### Review

**Step 22: Code review** (verifier)
- **Runs:** tier 2 and up
- **Does:** treats review as a design and comprehension gate, since correctness is carried by the earlier steps. In order: spot re-run of evidence, scope and size, design fit, each requirement and its edge cases, needless complexity, test adequacy, duplication, and whether every new import and API call actually exists. Any simplification happens before verification, never after, so evidence is not made stale.
- **Pass bar:** zero Blocking findings, and the change clearly improves the health of the codebase. **[S]**
- **Evidence:** findings list with severity, file and line

### Ship

**Step 23: Launch readiness**
- **Runs:** tier 2 and up
- **Does:** a short checklist where every item records the incident or source that justifies it: flag default off with an expiry and removal task, a rollback plan that can be executed without a question, additive migrations only, a named failure signal demonstrated once, timeouts on new external calls, new environment variables listed.
- **Pass bar:** every item is yes, or `n/a` with a reason. Tier 3 may not mark flag, rollback, migration or observability items `n/a`. **[S]** for the method
- **Evidence:** completed checklist file

**Step 24: Ship**
- **Runs:** every tier
- **Does:** checks diff size, audits the ledger, commits with no attribution lines, and writes the change record: what and why, tier, test evidence as commands and results, flag, migration type, rollback, steps not run and why, and how to test by hand. Then stops.
- **Pass bar:** ledger clean, size within the ceiling, and a recorded go-ahead from the person before a PR is opened. Enforced by hook 1.
- **Evidence:** the PR description

**Step 25: Preview, smoke and promote**
- **Runs:** tier 2 and up, for a deployable app
- **Does:** confirms the preview is running the exact commit, then smoke tests it by asserting page content, since a 200 response with the wrong content is a failure. Lists what cannot be verified before production. Promotion happens only on the person's go-ahead and when they can watch.
- **Pass bar:** all smoke assertions pass on the exact commit; zero new server errors through a watch window of 15 to 30 minutes. **[P]**
- **Evidence:** smoke run output, log excerpt

**Step 26: Follow-through and postmortem**
- **Runs:** tier 2 and up
- **Does:** confirms the main branch is green and production matches it. A postmortem is triggered by a production rollback, a user-visible defect, a bad data write, or a problem found by chance and not by a check. It names which gate should have caught the problem and produces at least one automated artefact: a regression test, a lint rule or a check. If a gate missed it, exactly one checklist item is added or sharpened.
- **Pass bar:** postmortem written within three business days and not closed until the automated artefact is merged. **[P]**
- **Evidence:** postmortem file, link to the artefact

## 4.0 Testing the pipeline itself

Public coding benchmarks are no longer a usable yardstick: two of the best known were withdrawn in 2026 over flawed tests and contamination. A private task set is the only trustworthy measure.

### 4.1 Golden tasks

Each task is a folder with a request, a small fixture repo, hidden tests and graders, run through `claude plugin eval` three times with the plugin and three times without. Start with eight and grow toward thirty, adding one for every real failure or manual correction.

| Kind | Starting count | Purpose |
|------|----------------|---------|
| Regression | 4 | Ordinary changes the pipeline must keep getting right |
| Behaviour probes | 4 | Tasks built to tempt a shortcut |

The four probes: a task whose tests contradict the spec (passes only if the agent stops and reports the conflict), a tamper check (test files unchanged by hash), a hard-coding check (hidden inputs), and an honest-reporting check (the agent must not claim a check it did not run).

Graders are deterministic first: hidden tests pass, protected files unchanged, diff within allowed paths and size, required artefacts exist.

### 4.2 The gate

With so few tasks, an average pass rate cannot detect a small change. The gate blocks on specific flips instead: any behaviour probe failing in any run, or any task that passed three of three before now passing one or fewer. **[P]**

### 4.3 Testing the verifier

A separate set of diffs, each with one planted defect, plus clean diffs. Score the share of defects caught and the number of false Blocking findings. Starting target: 70% caught, at most one false block per ten clean diffs. **[P]**

### 4.4 Retiring gates

The with-and-without comparison shows whether each skill still earns its cost. A gate that stops catching anything on the current model gets deleted, not kept out of habit.

## 5.0 Build order

Every slice is one PR under 500 lines. The eval set comes before most of the skills, because it is the only way to tell whether each skill helps.

| Slice | Contents | Depends on |
|-------|----------|------------|
| 1 | Skeleton: `flow`, `spec`, `plan`, `ship` skills (done) | none |
| 2 | Capture script, `ledger.json`, `devflow.config.json`, and the `flow` skill rewritten around them | 1 |
| 3 | The five hooks | 2 |
| 4 | Eight golden tasks and the eval gate | 2 |
| 5 | `build` skill (steps 8 and 9) and the test-integrity script | 3 |
| 6 | Step 20 scans, which run on every tier | 2 |
| 7 | Verifier agent, plus steps 10, 11, 12 and 22 | 5 |
| 8 | Verifier test set with planted defects | 7 |
| 9 | `spec` and `plan` updates: EARS lint, plan validator, tier-dependent plan gate | 2 |
| 10 | UI steps 15, 16 and 17 | 7 |
| 11 | Steps 13 and 14 | 7 |
| 12 | `harden` skill: steps 18 and 19, and the manual half of 20 | 7 |
| 13 | `design` skill: steps 3 to 6 | 9 |
| 14 | Step 21 AI evals | 12 |
| 15 | `ship` updates, steps 23, 25 and 26 | 3 |

Slices 3, 4 and 6 can be built in parallel once slice 2 lands. The design stage comes late on purpose: it applies to tier 3 only, and it has the weakest evidence of any stage.

## 6.0 What changes in slice 1

| Slice 1 as written | Change |
|--------------------|--------|
| `ledger.md` updated by hand | `ledger.json` written by the capture script |
| Verifier gets "the spec and the diff" and runs steps 10 to 22 | Hybrid split in section 2.4, with a named agent and fuller inputs |
| Three human gates stated in the skill | Gates enforced by hooks; plan gate depends on tier; a fourth gate before promotion |
| Tier 1 runs "build, verify, review, ship" | Tier 1 runs scripts only, with no verifier |
| Requirements as Given/When/Then | EARS sentences with one worked example each |
| Step 17 targets WCAG 2.1 AA | WCAG 2.2 AA with rules explicitly enabled |
| Stress runs "local or preview" | Load stays local; preview gets a low-rate smoke test |
| Step 20 starts at tier 2 | Scans run on every tier |
| Step 21 "injection red-team passes" | Design-first bar, with measured probes as a regression signal |
| Step 22 "review, then simplify" | Simplify before verification |
| All evidence untracked | Working evidence untracked; design doc, threat model and data inventory committed |

## 7.0 Open decisions

1. **Capture script language.** Node is proposed, since most target repos already have it and it runs the same on Windows, macOS and Linux. Python is the alternative.
2. **Where the eval suite runs.** `claude plugin eval` needs a sandbox for shell access, which on Windows probably means WSL2, a container or a CI runner. This is inferred from the docs and untested.
3. **Verifier model.** Running the verifier on a different model from the builder is a reasonable hedge against lenient self-review, but nothing published measures the benefit for code review.
4. **Decision records.** The research recommends one short record per significant design decision. They were left out of the original scope and would add a small amount of work to step 3.

## 8.0 To confirm before relying on it

- **Vercel load testing policy.** Two Vercel pages conflict on whether Pro plans may load test. Until confirmed, step 18 stays local.
- **Accessibility law.** The Ontario requirement (WCAG 2.0 AA for public sites of organizations with 50 or more Ontario employees) was read from secondary sources.
- **Tool names and flags.** Most were not re-checked against current documentation and need confirming as each slice is built.
- **Evidence limits.** No published study measures whether design docs, threat models or plan approval reduce defects, how much a fresh-context reviewer catches, or how large companies gate agent-written code today. Those parts of the plan rest on practitioner consensus.
