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
| `devflow:design` | 3 to 6 | Slice 2, not built |
| `devflow:qa` | 10 to 17 | Slice 3, not built |
| `devflow:harden` | 18 to 21 | Slice 4, not built |
| Hooks and golden-task evals | Hard stops, workflow evals | Slice 5, not built |

Until a stage skill exists, the orchestrator falls back to the general skills named in the pipeline table, or records the step as not run. It never reports an unbuilt step as passed.

## Layout

```
.claude-plugin/plugin.json   plugin manifest
skills/<name>/SKILL.md       one folder per skill
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
