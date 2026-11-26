---
name: design
description: Write the design for a high-risk change before any plan or code exists. Produces a short design doc that weighs at least two alternatives, then the reviews that apply, which are an API and schema compatibility review, a privacy review with a data inventory, and a threat model. Use for any tier 3 change, whenever the user asks for a design doc, an RFC, alternatives, a schema or API review, a privacy review or a threat model, or when the devflow pipeline reaches steps 3 to 6.
---

# Design (steps 3 to 6, tier 3)

A tier 3 change is one where a wrong decision is expensive to undo: a schema, a public contract, personal data, auth, money or infrastructure. Code is the costly place to discover that the approach was wrong, so these four steps settle the approach on paper, where changing it costs minutes.

Commands go through the capture script, `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs"`, shown below as `devflow`. Inputs are the approved `spec.md` and `evidence/02-explore.md`. Working files go in `.devflow/<task>/`.

Steps 4, 5 and 6 each apply only when their trigger is met. When one does not apply, say so and move on:

```
devflow mark 5 n/a --reason "no information about an identifiable person is touched"
```

## Step 3: design doc

Write `.devflow/<task>/design.md`, one to three pages:

```markdown
# <Title>

## Context
What exists today and why it is not enough. Link the spec, do not repeat it.

## Goals
## Non-goals

## Design
How it will work: the parts, what talks to what, what is stored and where. A diagram or a table where it is clearer than prose.

## Alternatives
### Do nothing
What happens if this is not built.
Rejected because: ...

### <Another real option>
Rejected because: ...

## Drawbacks
What this design makes worse or harder, stated plainly.

## Open questions
### Before coding
- None.
### During
- Questions the build can start without.
```

The alternatives are the point of the document. One of them is always "Do nothing" or "Simplest possible", because the usual design mistake is building more than the problem needs. Give each a real reason for rejection, one that names a cost or a requirement it fails. "Less flexible" is not a reason. If the simplest option turns out to meet every requirement, choose it and say so.

A "Before coding" question is one whose answer would change the design. Take each to the user and write the answer into the doc. The check fails while any remain.

```
devflow run 3 --builtin design
```

The check confirms the sections, at least two alternatives each with a rejection reason, a do-nothing or simplest option, no open "Before coding" questions and the length. It cannot tell whether the design is right. Send the doc to a fresh `devflow:verifier` with one question: from the document alone, what was rejected and why? If it cannot answer, the doc is not clear enough. Then record:

```
devflow record 3 passed --artefact .devflow/<task>/design.md
```

If the solution is unambiguous and there is nothing to weigh, skip the step with the reason: `devflow mark 3 n/a --reason "..."`. Do not write a design doc to justify a decision already made.

## Step 4: API and schema review

Applies when a contract other code depends on changes: an HTTP API, a server action's inputs, an event payload, an exported type or a database schema.

Write the new contract first, as a schema (Zod, Pydantic, OpenAPI, SQL), before the code that implements it. Then compare it with what is deployed and look for the seven breaking changes:

| Breaking change | Example |
|-----------------|---------|
| Remove | a field, a route or a column is gone |
| Rename | `name` becomes `fullName` |
| Retype | a string becomes a number, or a column changes type |
| New required field | callers that do not send it now fail |
| Optional to required | the same, for a field that already existed |
| Default change | callers relying on the old default behave differently |
| Meaning change | same name and type, different units or semantics |

Each one found needs a migration path: a new version beside the old, or expand and contract, where the new shape is added, both are served, callers move, and the old one is removed in a later change. Classify each database change as additive or destructive. The test is that the new schema works with the code deployed today and the new code works with the old schema, since a deploy runs both for a time.

Capture a real diff where a tool exists, then write the findings:

```
devflow run 4 --label contract-diff -- <the repo's schema or OpenAPI diff command>
devflow record 4 passed --artefact .devflow/<task>/evidence/04-contract-review.md
```

Record `failed` while any breaking change has no migration path. Where no diff tool exists, compare by hand, run a label that prints the two versions, and say in the evidence file that the comparison was manual.

## Step 5: privacy review

Applies when the change collects, stores, logs, displays, sends or derives information about an identifiable person. That includes an email address in a log line and a name sent to an LLM.

Keep a data inventory in the repo, by default `docs/data-inventory.md`, and update it in this change. One row for each personal field:

| Field | Purpose | Classification | Stored in | Sent to | Kept for | Deleted by |
|-------|---------|----------------|-----------|---------|----------|------------|

Then check the change against these, which follow the fair information principles in Canada's PIPEDA:

- **Purpose.** Each field has a stated use, and nothing is collected in case it is useful later.
- **Consent.** The person was told about this use where they gave the data.
- **Limits.** The data is used only for that purpose and kept only as long as the row says.
- **Recipients.** Every third party that receives it is in the inventory, including analytics, error tracking, email and LLM services.
- **Leaks.** No personal data in URLs, query strings, logs, analytics events or error messages.
- **Access and deletion.** There is a way to export and delete one person's data, and this change does not break it.

Write the answers to `evidence/05-privacy-review.md` and record the step. It fails if any personal field in the change is missing from the inventory, or goes to a recipient that is not listed.

## Step 6: threat model

Applies when the attack surface changes: a new entry point, a new trust boundary, a new integration, a change to auth, or an LLM feature that reads untrusted text.

1. **Sketch the data flow.** List what talks to what, and mark each trust boundary, the points where data passes between parties that do not fully trust each other: browser to server, server to database, your code to a third party, user content to an LLM.
2. **Walk STRIDE on each flow that crosses a boundary.** Spoofing (pretending to be someone else), Tampering (changing data in transit or at rest), Repudiation (denying an action with no record to show otherwise), Information disclosure, Denial of service, Elevation of privilege.
3. **Give every threat a response:** mitigate, remove the feature that creates it, or accept it. Accepting a threat is the user's decision, never yours, so ask.
4. **Turn each mitigation into a spec requirement with a negative test,** one that attempts the attack and expects refusal. A mitigation with no test is a hope.

For an LLM feature, record which of these three it holds: reads untrusted content, has access to private data, can act or send data outside. A feature holding all three can be made to leak data by anyone who can put text in front of it, and no prompt wording prevents that. Remove one of the three.

Write the model to `evidence/06-threat-model.md` as a table of threat, flow, response and linked test, then record the step. It fails with any threat lacking a response or any mitigation lacking a test.

## Afterwards

New requirements from steps 4 to 6 go back into `spec.md`. Run `devflow run 1 --builtin spec` again, and tell the user what was added, since they approved the earlier version. Then continue to the plan (`devflow:plan`), which links the design doc instead of repeating it.
