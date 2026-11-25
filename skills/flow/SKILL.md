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
├── ledger.md      one row per applicable step: status and evidence path
├── spec.md
├── plan.md
└── evidence/      NN-step-name.md plus any screenshots or raw output
```

On first use in a repo, add `.devflow/` to `.git/info/exclude` so these files stay out of commits and out of the PR size count.

Create `ledger.md` when the tier is set, with one row for every step that applies. Each row has a status: `pending`, `passed`, `failed`, `not run` (with the reason) or `n/a` (with the reason). Update it as you go, because the ledger is what the user reads to know where things stand and what the Ship step audits.

If a `.devflow/<task-slug>/` folder already exists for this task, resume from its ledger instead of starting over.

## Running order

1. **Spec** (`devflow:spec`). Ends with a provisional tier. Stop for the user's approval.
2. **Plan** (`devflow:plan`), tier 2 and up. Confirms the tier and slices the work. Stop for approval.
3. **Build** one slice at a time. Write tests alongside the code, not after.
4. **Verify, harden and review** the slice, following the verifier rule below.
5. **Ship** the slice (`devflow:ship`). Stop before opening a PR.
6. Repeat 3 to 5 for the next slice.

Tier 1 changes skip Plan: confirm the spec in one line, build, verify, review, ship.

## Three rules that make the gates real

**Evidence, or it did not happen.** A step passes only when its evidence file exists and shows the check actually ran: the command and its output, a screenshot, a query plan, a number against a budget. "Looks fine" is not evidence. This matters because a later reader, human or agent, cannot tell a check that passed from a check that was skipped unless the proof is attached.

**The builder does not grade its own work.** Run steps 10 to 22 in a fresh subagent. Give it the spec, the diff and the applicable step list, and nothing about how you built it or what you think works. A verifier that has seen your reasoning tends to confirm it. When the verifier reports a failure, fix it in the main session, then send the fix back for a fresh check rather than marking it passed yourself.

**Never round up.** If a step could not run (no staging environment, skill not built yet, tool missing), record `not run` with the reason and carry it into the ship report. A pipeline that quietly skips steps is worse than no pipeline, because the user believes they are covered.

## Steps whose skill is not built yet

`pipeline.md` names a fallback for most steps: a general skill that covers similar ground. Use the fallback and say in the evidence file that it was a fallback. Where there is no fallback, do the check by hand if the pass bar in the table is clear enough to follow, otherwise mark it `not run`.

## Human gates

Stop and wait for the user at three points: after the spec, after the plan, and before a PR is opened. Approval at one gate does not carry to the next. Between gates, keep working without checking in.

The user can override the tier or waive a step at any time. Record the override and who made it in the ledger, then follow it.
