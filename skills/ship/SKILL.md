---
name: ship
description: Take a verified slice to a review-ready branch, then through preview, promotion and follow-up. Audits the evidence ledger, runs the launch readiness checklist, checks the diff is under 500 lines, commits, reports exactly what to test, and stops for the user's go-ahead before any pull request or promotion. Use whenever work is done and the user says ship, wrap up, commit, push, open or prepare a PR, deploy or promote, or when the devflow pipeline reaches steps 23 to 26.
---

# Ship (steps 23 to 26)

Shipping is where shortcuts hide. This stage audits what the earlier steps claimed, hands the user a branch they can test with the gaps stated plainly, and then sees the change safely into production. The user decides whether a pull request is opened, performs every merge, and decides when anything is promoted.

Commands go through the capture script, `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs"`, shown below as `devflow`.

## Step 23: launch readiness (tier 2 and up)

Work through `references/launch-checklist.md` and write the answers to `.devflow/<task>/evidence/23-launch-readiness.md`. Every item is answered yes, or `n/a` with a reason. A blank is not an answer, and at tier 3 the flag, rollback, migration and observability items cannot be `n/a`.

The list is short on purpose. Each item is there because skipping it has caused a real failure, and the checklist says which. Do not pad it.

```
devflow record 23 passed --artefact .devflow/<task>/evidence/23-launch-readiness.md
```

Record `failed` if any answer is no, and fix that before going further.

## Step 24: ship

**1. Check the size.**

```
git diff --shortstat <base-branch>...HEAD
```

Insertions plus deletions must be 500 or fewer. If the slice is over, do not open one oversized pull request and do not trim tests to fit: propose where to split it. If generated files such as a lockfile are what push it over, report the number with and without them and let the user decide.

**2. Commit** on the feature branch, never on the default branch. Write a short imperative subject and a body saying why the change exists. Add no attribution lines of any kind.

**3. Write the report** to `.devflow/<task>/evidence/24-ship-report.md`, in this order:

1. **What changed**, in two or three sentences, and which requirements it covers.
2. **How to test it**: exact commands, URLs and clicks, plus the flag to turn on.
3. **Evidence**: each step that passed, as the command and its result.
4. **Not run**: every step marked not run or n/a, with its reason. Say "none" if there are none. Never leave this section out.
5. **Risks and rollback**, including anything that cannot be undone.
6. **Cost**, against the cost line in the plan.
7. **Diff size** against the base branch.

```
devflow record 24 passed --artefact .devflow/<task>/evidence/24-ship-report.md
devflow status --gate
```

The gate must be clean. If it lists a step, that step is pending, failed or stale: go back and settle it. Committing does not make evidence stale, but any edit after a check does.

**4. Show the user the report and stop.** Approval of the work is not approval to open a pull request, so wait for an explicit go-ahead.

**5. Open the pull request** only after that go-ahead, with `gh pr create` and a description built from the report. A hook refuses the command while the gate is not clean, and asks the user to confirm when it is. Then stop again. Do not merge, do not enable auto-merge, and do not merge the branch locally.

## Step 25: preview, smoke and promote (tier 2 and up, deployable apps)

Run this once a preview deployment of the branch exists.

**1. Confirm what is deployed.** Check that the preview is serving the exact commit at the head of the pull request, from a version or health route or the host's deployment details. Testing the wrong build proves nothing.

**2. Smoke test it** through the capture script, using the repo's `smoke` check if it has one:

```
devflow run 25 --check smoke
```

A smoke test asserts content, not status codes: a page that returns 200 with the wrong content is a failure. Cover the home page, a sign-in round trip with a test account, one read and one write, and the changed feature with its flag on and off. Use test modes for anything with side effects, such as payments or email. Keep the load light. This is a smoke test, not a load test.

**3. Say what cannot be verified before production,** and how preview differs from it.

**4. Stop for the user's go-ahead to promote.** Promote only when they can watch. After promotion, repeat the read-only part of the smoke test against production, confirm the commit, and watch errors for 15 to 30 minutes.

**5. If something goes wrong,** turn the flag off or roll back first and diagnose second. Rolling back a deployment does not undo a migration or an environment variable. On Vercel, a rollback also stops later merges from going live until a deployment is promoted again, so note that and restore it.

An infrastructure change is treated the same way. Capture the planned changes, point out anything that destroys or replaces a resource, and apply nothing without the user's go-ahead.

## Step 26: follow-through (tier 2 and up)

After the change is live:

- Confirm the main branch is green and production matches it.
- Confirm the task to remove the feature flag has a date.

Write a postmortem, using `references/postmortem.md`, if any of these happened: a production rollback or an emergency flag-off, a defect a user could see, a bad data write, a problem found by a user or by chance instead of by a check, or a hotfix made outside the pipeline. For a near miss caught at preview that an earlier step should have caught, a few lines are enough.

A postmortem is not finished until it has produced one automated thing that would catch the problem next time: a regression test, a lint rule or a check. If a devflow step should have caught it, also add or sharpen exactly one checklist item, and cite the postmortem beside it.

```
devflow record 26 passed --artefact .devflow/<task>/evidence/26-follow-through.md
```
