---
name: spec
description: Turn a request for a code change into a short spec with testable acceptance criteria, an out-of-scope list and a risk tier, then explore the codebase for the patterns and files it touches. Use at the start of any feature, fix or change before writing code, whenever the user describes something they want built, or when the devflow pipeline calls for steps 1 and 2.
---

# Spec and explore (steps 1 and 2)

Most bad agent work traces back to a vague ask, not bad code. The spec fixes the target before anything is built, and it becomes the only thing the independent verifier is told. So write it for a reader who never saw this conversation.

## 1. Clarify

Read the request and list what is ambiguous. Ask the user about anything that would change what gets built: who uses it, what happens on failure, what must not change. Batch the questions into one round. Do not ask about things you can find in the code, and do not guess at things only the user knows.

## 2. Write `.devflow/<task-slug>/spec.md`

Use this template:

```markdown
# <Task title>

## Problem
Two or three sentences: what is wrong or missing today, and for whom.

## Acceptance criteria
1. Given <state>, when <action>, then <observable result>.
2. ...

## Out of scope
- Things a reasonable person might expect that this change will not do.

## Surfaces touched
UI / API / database / auth / personal data / LLM / none of these

## Provisional tier
Tier N, because <the trigger from pipeline.md>.

## Open questions
- Anything still unresolved, and who can answer it.
```

A criterion is good when someone could check it without asking you what you meant. "Search is fast" fails that test. "Given 10,000 listings, when the user types a query, results render within 500 ms" passes it. Include failure paths (bad input, no permission, empty state), since those are the criteria that get forgotten.

Keep it to one page. If it will not fit, the task is probably several tasks, so say that and propose the split.

## 3. Explore (tier 2 and up)

Before the user approves the spec, look at the code so the spec reflects what exists. Find:

- how similar features are already built here (follow those patterns instead of inventing new ones)
- the files and modules this will touch
- existing tests, and how they are run
- constraints the spec must respect, such as shared components, schema, feature flag setup and deploy targets

Write the findings to `.devflow/<task-slug>/evidence/02-explore.md` with file paths. If exploring changes the picture, for example the feature half-exists or a criterion conflicts with current behaviour, update the spec and tell the user what changed.

## 4. Stop for approval

Show the user the spec and the provisional tier, and wait. Do not start planning or building on an unapproved spec: every later step is measured against it, so an error here is the most expensive kind.

Once approved, mark steps 1 and 2 in the ledger with their evidence paths.
