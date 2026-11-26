# devflow

A gated quality pipeline for agentic coding, packaged as a Claude Code plugin.

Three ideas hold it together:

1. **Risk tiers.** A copy tweak and a schema migration do not get the same scrutiny. The tier decides which of the 26 steps run.
2. **Evidence over claims.** Every step writes an artefact (test output, screenshot, query plan). A step with no artefact counts as not run.
3. **Independent verifier.** The agent that wrote the code never grades it. Verification runs in a fresh subagent that sees only the spec and the diff.

The full step list and tier rules live in [skills/flow/references/pipeline.md](skills/flow/references/pipeline.md).

## Skills

| Skill | Steps | Status |
|-------|-------|--------|
| `devflow:flow` | Orchestrator: tiers, ledger, gates | Built |
| `devflow:spec` | 1 to 2 | Built |
| `devflow:plan` | 7 | Built |
| `devflow:ship` | 23 to 26 | Built |
| `devflow:build` | 8 to 9 | Built |
| `devflow:design` | 3 to 6 | Built |
| `devflow:qa` | 10 to 14, 22 | Built |
| `devflow:ui` | 15 to 17 | Built |
| `devflow:repo` | Repo rules: policy, agent files, branch policy, docs layout | Built |
| `devflow:verifier` agent | Judges 10 and 22 | Built |
| `devflow:harden` | 18 to 20 | Built (21 not built) |
| Hooks | Hard stops | Built |
| Golden-task evals | Workflow evals | Not built |

Until a stage skill exists, the orchestrator falls back to the general skills named in the pipeline table, or records the step as not run. It never reports an unbuilt step as passed.

## Layout

```
.claude-plugin/plugin.json   plugin manifest
skills/<name>/SKILL.md       one folder per skill
agents/verifier.md           the independent verifier agent
hooks/hooks.json             hook registration
hooks/guard.mjs              the hard stops: PR gate, no merges, protected files
scripts/run.mjs              capture script: runs checks and writes the ledger
scripts/scan.mjs             built-in checks: secrets, dependencies, test integrity
scripts/policy.mjs           generates agent guide, contributing file and branch workflow from the policy
scripts/steps.json           the 26 steps, their minimum tier and how each is decided
docs/plan.md                 the full build plan
hooks/                       hard stops (slice 5)
evals/                       golden tasks for testing the workflow itself (slice 5)
```

## Trying it locally

Load the plugin for one session from the repo you want to work in:

```
claude --plugin-dir C:\Users\<you>\Documents\GitHub\devflow
```

Then ask for a change and mention devflow, or invoke `/devflow:flow` directly.

## Working files in target repos

The pipeline writes its spec, plan and evidence to `.devflow/<task-slug>/` in the repo being changed. That folder is added to `.git/info/exclude`, so it never lands in a commit or counts toward PR size.

Each target repo also gets a `devflow.config.json` naming its own commands, which keeps the pipeline independent of the stack:

```json
{
  "checks": { "test": "npm test", "lint": "npm run lint", "typecheck": "npx tsc --noEmit", "build": "npm run build" },
  "approvedDependencies": ["zod"],
  "protected": ["src/billing/**"]
}
```

Set a check to `null` when the repo has no such thing, for example `"build": null`.

## Built-in checks

These need no setup and compare the working tree against the base branch:

| Check | Step | Fails when |
|-------|------|------------|
| `secrets` | 20 | An added line looks like a credential. Basic patterns only; add gitleaks as a config check for depth |
| `deps` | 20 | A production dependency has a high or critical vulnerability. Findings in development-only dependencies are listed but do not block, unless the config sets `"audit": "all"` |
| `newdeps` | 20 | A new direct dependency is not in `approvedDependencies`, or dependencies changed with no lockfile change |
| `spec` | 1 | A requirement lacks a single `shall`, an explicit trigger or an example, uses a word that cannot be checked, or a section is missing |
| `plan` | 7 | A slice has no size, is over 500 lines or mixes kinds of change, or a requirement is not covered by any slice |
| `entrypoints` | 20 | An entry point in the task's table has a blank or placeholder cell for where auth, ownership or input validation happens |
| `integrity` | 11 | A test was deleted, skipped or had assertions changed, a snapshot changed, or a lint or type suppression was added |

## Developing devflow

The scripts need Node 20 or later and have no dependencies. Run the tests with:

```
node --test scripts/run.test.mjs scripts/scan.test.mjs scripts/rules.test.mjs scripts/policy.test.mjs scripts/trial.test.mjs scripts/lessons.test.mjs hooks/guard.test.mjs hooks/policy.test.mjs
```

## Repo rules

A repo can state its branch policy once, in a `policy` block in `devflow.config.json`:

```json
{
  "policy": {
    "integrationBranch": "dev",
    "releaseBranch": "main",
    "hotfixPrefix": "hotfix/",
    "branchPrefixes": ["feat/", "fix/", "docs/", "chore/"],
    "commits": "conventional",
    "mergeIntoRelease": "merge",
    "agentFile": "AGENTS.md",
    "instructionBudget": 80,
    "docs": ["docs/README.md"]
  }
}
```

The hooks then enforce it for any agent working in the repo:

| Rule | Behaviour |
|------|-----------|
| A new branch | Refused if its name lacks an allowed prefix, or if it starts from the release branch and is not a hotfix |
| A pull request | Refused unless it targets the integration branch. Only the integration branch and hotfixes may target the release branch |
| A push straight to the integration or release branch | Refused |
| A commit subject | Refused if the policy names Conventional Commits and the subject does not follow them |

The files people and agents read are generated from the same policy. Existing files are never overwritten:

```
node scripts/policy.mjs            # shows what would be created
node scripts/policy.mjs --write    # creates the missing files
```

And the written rules can be checked against the policy, in CI or by hand:

```
node scripts/scan.mjs rules
```

It reports files the policy expects that are missing, references in the rule files to paths that do not exist, statements that contradict the policy (for example a README that says to branch from the release branch), a second agent instruction file that does not point to the first, agent instructions over the line budget, and a remote default branch that differs from the policy.

Limits: a commit message passed in a file or a heredoc is not checked, and the contradiction check matches common phrasings only.

## Hard stops

Five rules are enforced by hooks, so they hold even if an agent ignores the skills:

| Rule | Behaviour |
|------|-----------|
| Opening a pull request | Refused until the ledger is clean, then asks you to confirm |
| Recording the spec as approved, or the plan at tier 3 | Asks you to confirm |
| Merging | Always refused, locally and through `gh` |
| Editing a committed test, snapshot, CI workflow or `devflow.config.json` during a task | Asks you first |
| Editing `ledger.json` by hand | Always refused |
| Marking a step that has failed as n/a or not run | Asks you to confirm, since it waives a check that found something |

A repo can protect more paths by adding a `protected` list of globs to `devflow.config.json`. Stopping with failed or stale steps gets one reminder, and after the conversation is compacted the ledger state is put back in context.

Limits to know about: the file protection covers the editing tools, not shell commands such as `sed`, and whether the confirmation prompt still appears in permission-bypass mode has not been tested.
