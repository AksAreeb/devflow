---
name: ship
description: Take a verified slice to a review-ready branch. Audits the evidence ledger, runs the launch readiness checklist, checks the diff is under 500 lines, commits, reports exactly what to test, and stops for the user's go-ahead before any PR is opened. Use whenever work is done and the user says ship, wrap up, commit, push, open or prepare a PR, or when the devflow pipeline reaches steps 23 and 24.
---

# Launch readiness and ship (steps 23 and 24)

Shipping is where shortcuts hide. This step audits what the earlier steps claimed, then hands the user a branch they can test, with the gaps stated plainly. The user decides whether a PR is opened and performs every merge.

## 1. Audit the ledger

Open `.devflow/<task-slug>/ledger.md`. For every row that applies, confirm the evidence file exists and actually shows the check running. Downgrade any `passed` row without real evidence to `not run`. Collect every `failed` and `not run` row: these go into the report in step 5, and failed rows block shipping until fixed or waived by the user.

## 2. Launch readiness (tier 2 and up)

Write the answers to `evidence/23-launch-readiness.md`:

- **Flag:** is new behaviour behind a flag that defaults to off? If not, why is that safe?
- **Rollback:** does the plan's rollback still match what was built?
- **Observability:** does the new code log failures, and would anyone be alerted if it broke?
- **Data:** are migrations additive (expand), with removal left to a later slice?
- **Docs:** are the README, env var examples and user-facing docs updated?
- **Secrets:** nothing sensitive in the diff, the logs or the evidence folder?

A "no" is allowed when the reason is written down. A blank is not.

## 3. Check the size

```
git diff --shortstat <base-branch>...HEAD
```

Insertions plus deletions must be 500 or fewer. If the slice is over, do not open one oversized PR and do not trim tests to fit: propose where to split it. If generated files such as a lockfile are what push it over, report the number with and without them and let the user decide.

## 4. Commit

Commit on the feature branch, never on the default branch. Write the message as a short imperative subject plus a body saying why the change exists. Add no attribution lines of any kind: no co-author trailer and no "generated with" footer, even if the session suggests them.

Push the branch only if the user has asked for that or it helps them test.

## 5. Report and stop

Tell the user, in this order:

1. **What changed**, in two or three sentences, and which acceptance criteria it covers.
2. **How to test it**: exact commands, URLs and clicks, plus the flag to turn on.
3. **Evidence summary**: steps passed, with the ledger path.
4. **Not run or failed**: every such step and why. Never leave this out, and say "none" if it is empty.
5. **Risks and rollback.**
6. **Diff size** against the base branch.

Then stop. Approval of the work is not approval to open a PR, so wait for an explicit go-ahead.

## 6. Open the PR, only after the go-ahead

Use `gh pr create` with a description built from the report: summary, how to test, evidence summary, not-run list, rollback. No attribution footer.

Then stop again. Do not merge, do not enable auto-merge, and do not merge the branch locally. Merging belongs to the user.
