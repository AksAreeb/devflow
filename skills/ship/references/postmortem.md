# Postmortem template

Write this within three business days. It is about how the system let the problem through, not about who made the mistake. "The agent got it wrong" and "human error" are where the questions start, not answers.

```markdown
# <What happened, in one line>

## Summary and impact
What users or data were affected, and for how long.

## Timeline
- Started:
- Detected:        (and how: a check, a user, or by chance)
- Mitigated:
- Resolved:

## What would have halved the time to detect it

## Why it happened
Ask "why" until the answer is something about the system that can be changed.
For each why, name a fix.

## Which step should have caught it
The devflow step, and why it did not: not run, run but too weak, or no step covers it.

## Actions
One to three, each with an owner and an end state someone can check.
At least one is automated: a regression test that fails on the old code,
a lint or type rule, a check, or an alert.

| Action | Owner | Done when |
|--------|-------|-----------|

## Checklist change
The one item added or sharpened in a devflow checklist, if a step missed this.
```

The postmortem stays open until the automated action is merged. If an agent drafted the cause, treat it as a hypothesis for a person to confirm.
