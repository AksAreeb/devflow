---
name: plan
description: Turn an approved spec into an implementation plan with a confirmed risk tier, reviewable slices under 500 lines of diff each, a test strategy, a feature flag plan and a rollback plan. Use after a spec is approved and before writing code, whenever the user asks how to break up, slice, sequence or plan a change, or when the devflow pipeline calls for step 7.
---

# Plan (step 7)

The plan decides two things that are hard to fix later: how the work is cut into reviewable pieces, and which checks it owes. A change that grows past the size ceiling mid-build has to be untangled by hand, so the split happens here, before any code exists.

Inputs: `.devflow/<task-slug>/spec.md` and `evidence/02-explore.md`. For tier 3, also the design doc from step 3.

## 1. Confirm the tier

Re-check the provisional tier against `pipeline.md` now that you know which files change. Raise it if exploring revealed a tier 3 trigger. Lowering it needs the user's agreement.

## 2. Slice the work

Each slice becomes one PR. A good slice:

- stays under 500 lines of diff, tests included. Estimates run low, so aim for 300 and treat 500 as the ceiling.
- leaves the app working when merged alone, with unfinished behaviour behind a flag
- can be reverted without reverting its neighbours
- covers named acceptance criteria, so progress is measurable

A default order that keeps every slice safe to merge: schema additions first (expand), then backend, then UI behind a flag, then turning the flag on, then removing old columns and code (contract). Refactors needed to make room go in their own slice ahead of the feature, because mixing a refactor with a behaviour change makes both unreviewable.

## 3. Write `.devflow/<task-slug>/plan.md`

```markdown
# Plan: <task title>

## Tier
Tier N (confirmed), because <trigger>.

## Approach
A short paragraph. For tier 3, link the design doc instead of repeating it.

## Slices
| # | Goal | Files | Est. lines | Criteria covered | Depends on |
|---|------|-------|-----------|------------------|------------|

## Test strategy
Which levels (unit, integration, end to end) cover which criteria, and what will be mutation, property or contract tested.

## Data changes
Tables, columns and indexes affected, in expand/contract order. "None" if none.

## Budgets
Numbers the change must stay within: p95 latency, bundle size, query time. Take them from the repo if it defines any, otherwise propose them.

## Feature flag
Flag name, default (off), and what turns it on.

## Rollback
How to undo each slice in production, and what cannot be undone.

## Steps owed
The rows from pipeline.md that apply at this tier, each marked run or n/a with a reason.
```

## 4. Create the ledger and stop

Write `ledger.md` from the "Steps owed" list with every row `pending` or `n/a`. Then show the user the tier, the slice table and anything in the rollback section that cannot be undone, and wait for approval before building.
