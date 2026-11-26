---
name: plan
description: Turn an approved spec into an implementation plan with a confirmed risk tier, reviewable slices under 500 lines of diff each, a test strategy, a feature flag plan, a rollback plan and a cost line. Use after a spec is approved and before writing code, whenever the user asks how to break up, slice, sequence or plan a change, or when the devflow pipeline calls for step 7.
---

# Plan (step 7)

The plan decides two things that are hard to fix later: how the work is cut into reviewable pieces, and which checks it owes. A change that grows past the size ceiling mid-build has to be untangled by hand, so the split happens here, before any code exists.

Inputs: `.devflow/<task-slug>/spec.md` and `evidence/02-explore.md`. For tier 3, also the design doc from step 3.

Commands go through the capture script, `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs"`, shown below as `devflow`.

## 1. Confirm the tier

Check the provisional tier against `pipeline.md` now that you know which files change. Raise it if exploring revealed a tier 3 trigger. Lowering it needs the user's agreement. If the tier changes, tell the user, since the ledger was created for the earlier one.

## 2. Slice the work

Each slice becomes one pull request. A good slice:

- stays under 500 lines of diff, tests included. Estimates run low, so aim for 200 and treat 500 as the ceiling.
- does one kind of thing: a behaviour change, a refactor that preserves behaviour, or a mechanical change such as a rename. Mixing them makes each unreviewable.
- leaves the app working when merged alone, with unfinished behaviour behind a flag
- can be reverted without reverting its neighbours
- covers named requirement IDs, so progress is measurable

A default order that keeps every slice safe to merge: refactors that make room, then schema additions, then backend, then UI behind a flag, then turning the flag on, then removing old columns and code. A schema change that removes or renames something never shares a slice with the code that stops using it, because during a deploy the old code and the new schema run at the same time.

## 3. Write `.devflow/<task-slug>/plan.md`

```markdown
# Plan: <task title>

## Tier
Tier N (confirmed), because <trigger>.

## Approach
A short paragraph. For tier 3, link the design doc instead of repeating it.

## Slices
| # | Goal | Class | Files | Est. lines | Requirements | Depends on |
|---|------|-------|-------|-----------|--------------|------------|
| 1 | ... | behaviour | ... | 180 | R1, R2 | none |

## Test strategy
Which levels (unit, integration, end to end) cover which requirements, and what will be mutation, property or contract tested.

## Data changes
Tables, columns and indexes affected, in the order they will be applied. "None." if none.

## Budgets
Numbers the change must stay within: p95 latency, bundle size, query time. Take them from the repo if it defines any, otherwise propose them.

## Feature flag
Flag name, default (off), who owns it, when it expires, and the task to remove it.

## Rollback
For each slice, how to undo it in production, in this order: flag off, roll back the deploy, revert. Cover code, data and config separately, since rolling back a deploy does not undo a migration or an environment variable. Say what cannot be undone.

## Cost
New paid resources, expected usage, and the cost per request of any LLM call. "No new cost." if none.

## Decisions
Choices made in conversation that the code will reflect, each with its reason. The verifier reads this, so a decision recorded here will not be reported as a defect.

## Steps owed
The rows from pipeline.md that apply at this tier, each marked run or n/a with a reason.
```

## 4. Check the plan

```
devflow run 7 --builtin plan
```

The check confirms every slice has a size at or under 500 and a single class, that every requirement in the spec is covered by a slice, and that the sections are present. Fix what it reports and run it again.

It also prints whether a tier 2 plan needs the user's approval.

## 5. The plan gate

| Tier | What happens |
|------|--------------|
| 3 | Stop and wait for the user's approval. |
| 2, approval needed | Stop and wait. The check says this when a slice is estimated over 400 lines, data or schema changes, or a dependency is added. |
| 2, approval not needed | Tell the user the plan in a few lines and carry on. They can stop you. |

When you stop, show the user the tier, the slice table, the cost line, and anything in the rollback section that cannot be undone.

Then record the step:

```
devflow record 7 passed --artefact .devflow/<task-slug>/plan.md
```

At tier 3 this command asks the user to confirm, by design.
