---
name: build
description: Implement one planned slice of a change test-first, then run the automated best-practices pass. Use when a spec and plan are approved and it is time to write code, whenever the user says build, implement, code it or start the slice, or when the devflow pipeline reaches steps 8 and 9.
---

# Implement and best-practices pass (steps 8 and 9)

Build one slice from the plan. The order below exists because of a measured habit: when a test and the code disagree, coding agents often make the test agree. Writing the tests first, showing them fail, and then locking them removes that option, so a green result at the end means the code works.

All commands go through the capture script, `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs"`, shown below as `devflow`.

## Before writing anything

Read `.devflow/<task>/spec.md` and `plan.md`, and work only on the current slice. If this session also wrote the spec or plan, treat the files as the source of truth, not your memory of the conversation: the verifier will only see the files.

Then look for what already exists. Search for a utility, component or pattern that does what you are about to write, and note what you searched for. Duplicated code is the most common defect in agent-written changes, and it comes from skipping this search.

## Step 8: implement

**1. Write the tests for this slice first.** One test per requirement ID the slice covers, plus the failure paths the spec names. Test behaviour through the public interface, not internals.

**2. Show them failing.**

```
devflow run 8 --label red --expect-fail -- <command that runs only the new tests>
```

Read the output. The failure has to be an assertion failing because the behaviour does not exist yet. A test that fails on an import error or a typo proves nothing, and a new test that passes before the code exists is not testing the new behaviour. Fix the test until it fails for the right reason.

**3. Commit the tests.** From this point they are protected: a hook asks the user before any committed test is edited.

**4. Write the code to make them pass.** Keep to the slice:

- One kind of change. If you find a refactor is needed, stop and say so; it belongs in its own slice.
- Nothing the spec does not ask for: no extra options, abstractions or files.
- New behaviour goes behind the flag named in the plan, with the flag's off state giving the old behaviour at every entry point.
- Errors are handled or deliberately passed up. No empty `catch`, and no catch that only logs.
- A failure in the new code should be visible: log it with enough context to find it, and say which log line or metric would show the feature breaking.

**5. Show them passing.**

```
devflow run 8 --label green -- <the same command>
```

### When a test and the spec disagree

Stop and report the conflict to the user. Do not change the test to match the code, special-case the test's inputs, or skip it. Stopping here is a correct outcome, not a failure: a wrong test or a wrong spec is exactly what the pipeline is meant to surface, and it is cheap to fix now.

### Dependencies

Before adding a package, check that the registry has one under exactly that name, that it is the project you mean, and look at its age, repository and licence. Models sometimes recommend packages that do not exist, and attackers register those names. Then ask the user to approve it. Step 20 fails on any new dependency the user has not listed in `approvedDependencies`.

### Type and lint escapes

Do not add `any`, `as`, `!`, `@ts-ignore`, `eslint-disable`, `# type: ignore` or `# noqa` to get past a check. If one is truly needed, put the reason in a comment beside it. The integrity check in step 11 lists every new one.

## Step 9: best-practices pass (tier 2 and up)

This step is done by tools, not by rereading your own code. Run whichever of these the repo's `devflow.config.json` defines, each through `devflow run 9 --check <name>`:

| Check | What it enforces |
|-------|------------------|
| `format` | The formatter leaves no diff. Required. |
| `clones` | No new duplicated blocks |
| `unused` | No unused exports, files or dependencies |
| `complexity` | No function over the repo's complexity limit |

When the slice changes UI, the repo's linter should also enforce the interface rules a machine can decide. `references/interface-lint.md` lists them. If the repo's lint config is missing some, say so to the user and propose adding them as their own slice; do not widen this one.

Fix what they report. For a complexity or length warning, either simplify the function or explain in a comment why it has to be that way; do not suppress the rule.

Then clean up by hand what tools miss: debug output, commented-out code, TODOs with no owner, and docs that the change made wrong.

If you made the same mistake twice in this slice and a lint rule could have caught it, tell the user. A rule fixes it for good; another line of instructions does not.

## Finishing

Stop fixing after five rounds on the same failure and report what is blocking you. Past that point more attempts usually dig the hole deeper.

When step 8 shows green and step 9's checks pass, run `devflow status` and hand over to verification. Do not report the slice as done yourself: that is the ledger's job.
