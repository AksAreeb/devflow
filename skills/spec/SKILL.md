---
name: spec
description: Turn a request for a code change into a short spec with testable requirements, non-goals, a list of behaviour that must not change and a risk tier, then explore the codebase for the patterns and files it touches. Use at the start of any feature, fix or change before writing code, whenever the user describes something they want built, or when the devflow pipeline calls for steps 1 and 2.
---

# Spec and explore (steps 1 and 2)

Most bad agent work traces back to a vague ask, not bad code. The spec fixes the target before anything is built, and it becomes the standard the independent verifier measures against. So write it for a reader who never saw this conversation.

Commands go through the capture script, `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs"`, shown below as `devflow`.

## 1. Interview

Read the request and list what is unclear. Ask the user about anything that would change what gets built: who uses it, what happens when it fails, what must stay as it is. Put all the questions in one round, and offer choices where you can. Do not ask about things you can find in the code, and do not guess at things only the user knows.

## 2. Write `.devflow/<task-slug>/spec.md`

```markdown
# <Task title>

## Problem
Two or three sentences: what is wrong or missing today, and for whom.

## Requirements
- R1: When <trigger>, the system shall <response>.
  - Example: Given <state>, when <action>, then <what can be observed>.
- R2: If <unwanted condition>, then the system shall <response>.
  - Example: ...

## Non-goals
- What a reasonable person might expect that this change will not do.

## Unchanged behaviour
- What works today and must work the same way afterwards.

## Why this might not work
The three most likely reasons this change fails or disappoints.

## Surfaces touched
UI / API / database / auth / personal data / LLM / infrastructure / none of these

## Provisional tier
Tier N, because <the trigger from pipeline.md>.

## Open questions
- Anything unresolved, and who can answer it.
```

**How to write a requirement.** One sentence, one `shall`, starting with the condition that triggers it:

| Starts with | Use it for |
|-------------|-----------|
| The | Something always true: "The system shall store amounts in cents." |
| When | A response to an event |
| While | Behaviour that holds during a state |
| Where | Behaviour that applies only if a feature is present |
| If ..., then | An unwanted condition: bad input, no permission, not found, a failed upstream call |

Write an `If` requirement for every failure path, since those are the ones that get forgotten. Replace words that cannot be checked (fast, secure, easy) with a number or a concrete condition. "Search is fast" fails; "When the tenant submits a query against 10,000 listings, the system shall show results within 500 ms" passes.

Each requirement gets one worked example whose outcome someone could see from outside: on the screen, in a response, or in a stored record.

Keep the spec to one page. If it will not fit, the task is probably several tasks, so say that and propose the split.

### Tier 1 changes

For a cosmetic change, three lines are enough:

```markdown
Form: short
Change: what is being changed.
Unchanged: what must stay as it is.
Check: how to confirm it worked.
```

## 3. Start the ledger and check the spec

First make sure the work starts from the current base. Run `git fetch`, then create the branch from the remote copy of the base branch, for example `git switch -c fix/thing origin/dev`. A local copy of that branch can be weeks old, and work cut from it is checked against old code and old dependencies. `init` warns when the branch is behind.

```
devflow init <task-slug> --tier <n>
devflow run 1 --builtin spec
```

The check confirms that every requirement has one `shall`, an explicit trigger, an example and no uncheckable words, and that the sections are present. Fix what it reports and run it again. It cannot tell whether the requirements are the right ones. That part is the user's.

## 4. Explore (tier 2 and up)

Before asking for approval, look at the code so the spec reflects what exists. Find:

- how similar features are already built here, so the change follows them
- the files and modules this will touch, and any sensitive paths among them (auth, payments, migrations, CI)
- existing code the change should reuse, noting what you searched for
- the repo's test, lint, typecheck and build commands. Run each once, and write them to `devflow.config.json` under `checks`, using `null` for any the repo does not have.

Write the findings to `.devflow/<task-slug>/evidence/02-explore.md` with file paths, then record the step:

```
devflow record 2 passed --artefact .devflow/<task-slug>/evidence/02-explore.md
```

If the baseline tests fail before you have changed anything, list the failures there. If exploring changes the picture (the feature half-exists, or a requirement conflicts with current behaviour), update the spec, run the check again, and tell the user what changed.

## 5. Stop for approval

Show the user three things: what will change, what will not, and the provisional tier with its reason. Then wait. Every later step is measured against the spec, so an error here is the most expensive kind.

When they approve:

```
devflow record 1 passed --artefact .devflow/<task-slug>/spec.md
```

This command asks the user to confirm, by design. Do not run it before they have read the spec.
