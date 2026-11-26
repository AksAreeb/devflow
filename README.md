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
| `devflow:flow` | Orchestrator: tiers, ledger, gates | Slice 1 |
| `devflow:spec` | 1 to 2 | Slice 1 |
| `devflow:plan` | 7 | Slice 1 |
| `devflow:ship` | 23 to 24 | Slice 1 |
| `devflow:build` | 8 to 9 | Built |
| `devflow:design` | 3 to 6 | Slice 2, not built |
| `devflow:qa` | 10, 11, 12, 22 | Built (13 to 17 not built) |
| `devflow:verifier` agent | Judges 10 and 22 | Built |
| `devflow:harden` | 18 to 21 | Slice 4, not built |
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
| `deps` | 20 | `npm audit`, `pnpm audit` or `pip-audit` reports a high or critical vulnerability |
| `newdeps` | 20 | A new direct dependency is not in `approvedDependencies`, or dependencies changed with no lockfile change |
| `spec` | 1 | A requirement lacks a single `shall`, an explicit trigger or an example, uses a word that cannot be checked, or a section is missing |
| `plan` | 7 | A slice has no size, is over 500 lines or mixes kinds of change, or a requirement is not covered by any slice |
| `integrity` | 11 | A test was deleted, skipped or had assertions changed, a snapshot changed, or a lint or type suppression was added |

## Developing devflow

The scripts need Node 20 or later and have no dependencies. Run the tests with:

```
node --test scripts/run.test.mjs scripts/scan.test.mjs hooks/guard.test.mjs
```

## Hard stops

Five rules are enforced by hooks, so they hold even if an agent ignores the skills:

| Rule | Behaviour |
|------|-----------|
| Opening a pull request | Refused until the ledger is clean, then asks you to confirm |
| Recording the spec as approved, or the plan at tier 3 | Asks you to confirm |
| Merging | Always refused, locally and through `gh` |
| Editing a committed test, snapshot, CI workflow or `devflow.config.json` during a task | Asks you first |
| Editing `ledger.json` by hand | Always refused |

A repo can protect more paths by adding a `protected` list of globs to `devflow.config.json`. Stopping with failed or stale steps gets one reminder, and after the conversation is compacted the ledger state is put back in context.

Limits to know about: the file protection covers the editing tools, not shell commands such as `sed`, and whether the confirmation prompt still appears in permission-bypass mode has not been tested.
