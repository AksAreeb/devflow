---
name: flow
description: Run a code change through the devflow quality pipeline (spec, plan, build, verify, harden, review, ship) with risk tiers and evidence at every gate. Use this whenever the user asks to build, implement, add, fix or change something in a codebase that is more than a trivial one-line edit, or says "devflow", "run the pipeline", "do this properly" or "full workflow", even if they do not name the pipeline.
---

# devflow orchestrator

You are running a change through a gated pipeline. The pipeline exists because an agent working alone tends to declare victory once tests pass. The gates force the questions that get skipped: is the ask clear, is the change small enough to review, does it hold up under abuse, and can someone else confirm it without taking your word for it.

Read [references/pipeline.md](references/pipeline.md) now. It holds the 26 steps, the tier rules, and which skill runs each step.

## The ledger

All working files live in `.devflow/<task-slug>/` in the target repo:

```
.devflow/<task-slug>/
├── ledger.json    written by the capture script, never by hand
├── spec.md
├── plan.md
└── evidence/      one log per captured command, plus screenshots and notes
```

The ledger is kept by the plugin's capture script, `scripts/run.mjs`, so that it records what happened and not what you believe happened. Do not edit `ledger.json` directly. Call the script as `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs" <command>`:

| Command | Use it to |
|---------|-----------|
| `init <task-slug> --tier <1\|2\|3>` | Create the ledger once the tier is set. Also keeps `.devflow/` out of commits. |
| `run <step> --check <name>` | Run a check named in the repo's `devflow.config.json` (for example `test`, `lint`, `typecheck`, `build`) and record its exit code and output. |
| `run <step> --builtin <name>` | Run one of devflow's own checks: `secrets`, `deps` and `newdeps` for step 20, `integrity` for step 11. |
| `run <step> --label <name> -- <command>` | Run and record any other command for a step. |
| `record <step> <passed\|failed> --artefact <path>` | Give the verdict for a step that needs judgement, pointing at the evidence file. |
| `mark <step> <n/a\|not-run> --reason "<why>"` | Say a step does not apply, or could not run. |
| `status` | Show where every step stands. Add `--gate` to check whether the slice is ready to ship. |

Steps 11 and 20 run on every tier and each owes several checks: step 11 needs `test`, `lint`, `typecheck`, `build` and `integrity`, and step 20 needs `secrets`, `deps` and `newdeps`. A repo that has no linter or build declares that with `null` in its config. A new dependency passes only once the user has approved it by name in `approvedDependencies`.

A step's state is worked out from exit codes, not typed in. A captured run only counts for the exact code it ran against: edit any file afterwards and the step shows as `stale` until it is run again. That is deliberate, since a test run from before a change says nothing about the change.

If `.devflow/current` already points at this task, resume from `status` instead of starting over.

## Running order

1. **Spec** (`devflow:spec`). Ends with a provisional tier. Stop for the user's approval.
2. **Plan** (`devflow:plan`), tier 2 and up. Confirms the tier and slices the work. Stop for approval.
3. **Build** one slice at a time. Write tests alongside the code, not after.
4. **Verify, harden and review** the slice, following the verifier rule below.
5. **Ship** the slice (`devflow:ship`). Stop before opening a PR.
6. Repeat 3 to 5 for the next slice.

Tier 1 changes skip Plan: confirm the spec in one line, build, verify, review, ship.

## Three rules that make the gates real

**Evidence, or it did not happen.** A step passes only when the capture script recorded it: a command that exited zero, or a verdict tied to an evidence file such as a screenshot, a query plan or a number against a budget. Run checks through the script, not directly, or they leave no record. "Looks fine" is not evidence. This matters because a later reader, human or agent, cannot tell a check that passed from a check that was skipped unless the proof is attached.

**The builder does not grade its own work.** Run steps 10 to 22 in a fresh subagent. Give it the spec, the diff and the applicable step list, and nothing about how you built it or what you think works. A verifier that has seen your reasoning tends to confirm it. When the verifier reports a failure, fix it in the main session, then send the fix back for a fresh check rather than marking it passed yourself.

**Never round up.** If a step could not run (no staging environment, skill not built yet, tool missing), mark it `not-run` with the reason and carry it into the ship report. A pipeline that quietly skips steps is worse than no pipeline, because the user believes they are covered.

## Steps whose skill is not built yet

`pipeline.md` names a fallback for most steps: a general skill that covers similar ground. Use the fallback and say in the evidence file that it was a fallback. Where there is no fallback, do the check by hand if the pass bar in the table is clear enough to follow, otherwise mark it `not run`.

## Human gates

Stop and wait for the user at three points: after the spec, after the plan, and before a PR is opened. Approval at one gate does not carry to the next. Between gates, keep working without checking in.

Four rules are enforced by the plugin's hooks, whatever this skill says, so plan around them instead of trying them:

- `gh pr create` is refused while `status --gate` is not clean. Once clean, it asks the user.
- Merging is always refused, locally and on GitHub.
- Editing a committed test, snapshot, CI workflow or `devflow.config.json` during a task asks the user first. If a test conflicts with the spec, stop and report the conflict; do not change the test to get a pass.
- `ledger.json` cannot be edited directly.

The user can override the tier or waive a step at any time. Record the override and who made it in the ledger, then follow it.
