---
name: qa
description: Verify a built slice with scripted checks and an independent verifier agent. Runs regression, changed-line coverage and mutation testing by exit code, then hands functional QA and code review to a verifier that has not seen how the code was built. Use after a slice is implemented, whenever the user says verify, QA, test it, review it or check the slice, or when the devflow pipeline reaches steps 10 to 14 and 22.
---

# Verify a slice (steps 10 to 14 and 22)

Verification is split by who can be trusted to decide. Scripts decide whether the code is correct, because an exit code cannot be talked round. A separate verifier agent judges what scripts cannot: whether the running app does what the spec says, and whether the design is sound. You, the session that built the code, decide nothing here. Your job is to run things and fix what they find.

Commands go through the capture script, `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs"`, shown below as `devflow`.

## Before starting

If anything needs simplifying or tidying, do it now. Every edit after this point turns earlier evidence stale, including the verifier's verdicts, so cleanup after review means running it all again.

## Step 11: regression (every tier)

Run each check the step owes. A repo declares a check it does not have as `null` in `devflow.config.json`.

```
devflow run 11 --check test
devflow run 11 --check lint
devflow run 11 --check typecheck
devflow run 11 --check build
devflow run 11 --builtin integrity
devflow run 11 --check coverage      # if configured
```

- **No retries.** A test that fails and then passes is flaky, not passing. Report it; do not run it again until it goes green.
- **For a flagged change,** run the suite with the flag off and again with it on.
- **Coverage** is judged on the lines this slice changed: at least 90%, and overall coverage must not fall. High coverage with weak assertions proves little, which is what step 12 is for.
- **If `integrity` flags something,** undo it. If the spec truly requires changing an existing test, stop and ask the user; do not mark the step yourself.

## Step 12: mutation testing (tier 2 and up, when logic changed)

```
devflow run 12 --check mutation
```

Mutation testing makes small breaking changes to the code and checks that a test notices. Run it only on the files this slice changed that hold logic, not on markup, config or generated code. Every mutant that survives on a changed line is either killed by strengthening a test, or explained in `.devflow/<task>/evidence/12-survivors.md` as equivalent (the mutation does not change behaviour). Do not chase a score: the list of survivors is the point.

If the repo has no mutation tool configured, mark the step `not-run` with that reason. Do not substitute a guess about test quality.

## Step 13: property and fuzz tests (tier 3, for certain kinds of code)

An ordinary test checks the examples someone thought of. A property test states a rule that must hold for every input and lets the tool hunt for a counterexample. It applies when the slice touches one of these, and is `n/a` otherwise:

| The code is | A property worth stating |
|-------------|--------------------------|
| A parser or serializer | Writing a value out and reading it back gives the same value |
| Money or date arithmetic | Totals equal the sum of their parts; rounding never creates or loses a cent |
| A state machine | No sequence of valid actions reaches an invalid state |
| A handler that may be retried | Doing it twice has the same effect as doing it once |
| An authorization rule | No input lets a user act on something they do not own |
| Anything that takes outside input | It never throws on any input, only returns an error |

The property should already be stated in words in the spec. If it is not, add it there first.

```
devflow run 13 --check property
```

Run at least 100 generated cases per property. When the tool finds a failing input, it shrinks it to the smallest one: commit that as an ordinary regression test and keep the seed in the log. A property whose assertion repeats the code under test proves nothing, so state the rule independently. Do not write filler properties to tick the step.

## Step 14: contract tests (tier 3, when the slice crosses a boundary)

A boundary is anywhere this code exchanges data with something deployed separately: another service, a third-party API, a webhook, a queue.

- **Parse at the boundary.** Every response from outside goes through a runtime schema. A type assertion is a claim, not a check, and it fails silently when the other side changes.
- **Diff the contract.** Compare the API description or schema against the last release, and treat a removed or renamed field, a changed type, or a newly required field as breaking unless a version bump was approved.
- **Check third parties on a schedule, not in the gate.** Recorded fixtures drift from the real service. Re-check them against the provider's sandbox periodically, so an outage on their side does not block a release but a change in their responses is noticed.

```
devflow run 14 --check contract
```

A single app whose front end and back end are type-checked together has no boundary of this kind. Mark the step `n/a` with "covered by typecheck".

## Steps 10 and 22: the verifier (tier 2 and up)

Hand these to the `devflow:verifier` agent as a fresh subagent, not a fork of this conversation. A fork inherits everything you have said and thought, and a reviewer that has seen the builder's reasoning tends to confirm it.

Keep the brief to facts it needs to find the work:

```
Verify task <task-slug>, slice <n>, in this repo.
Judge steps: 10, 22.
Base branch: <base>.
Start the app with: <command>   (production build)
Test account, if needed: <where the seed credentials are>
```

Leave out how you built it, what you are confident about, and which parts you think are risky. That commentary is exactly what the verifier is meant to work without.

The verifier writes its evidence under `.devflow/<task>/evidence/` and records its own verdicts.

At tier 1 there is no verifier. The user checks the change by hand, and you record step 10 from what they report.

## Acting on findings

| Severity | What you do |
|----------|-------------|
| **Blocking** | Fix it. Then re-run every check that went stale, and send the slice back to a new verifier for a fresh verdict. Do not record the pass yourself. |
| **Should-fix** | Fix it, or note in the evidence file why it is deferred |
| **Nit** | Your call |

If you believe a Blocking finding is wrong, say so to the user with your reasoning and let them decide. Do not argue it down with the verifier or drop it.

After five rounds on the same failure, stop and tell the user what is blocking you. More attempts past that point usually make things worse.

## Done

Run `devflow status`. Steps 10 to 14 and 22 should each show `passed`, `n/a` or `not run` with a reason. Anything `stale` means the code changed after it was checked, so run it again.
