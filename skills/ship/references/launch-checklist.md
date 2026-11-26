# Launch readiness checklist

Version 2026-11-26. Answer each item yes, or `n/a` with a reason. Each item lists why it is here. When a postmortem shows a gap, add or sharpen one item and cite the postmortem beside it. Remove an item that has stopped earning its place.

| # | Item | Why it is here |
|---|------|----------------|
| 1 | New behaviour is behind a flag that defaults to off, and the suite passes with the flag off and with it on. | Turning a flag off takes seconds; rolling back takes minutes. An untested off path is not a safety net. |
| 2 | The flag has an owner, an expiry date and a task to remove it. | Flags that are never removed pile up into code paths nobody tests. |
| 3 | The rollback plan can be carried out without asking anyone a question, and it covers code, data and config separately. | Rolling back a deployment does not undo a migration or an environment variable. |
| 4 | Every migration in this release only adds. Nothing is dropped or renamed in the same release as the code that stops using it. | During a deploy the old code and the new schema run together. Rollback most often fails because the new version wrote data the old one cannot read. |
| 5 | The failure of the new behaviour would be visible: a named log line, metric or alert, shown working once. | A feature that fails silently is found by users. |
| 6 | Every new call to another service has a timeout, a bounded retry and a defined behaviour when that service is down. | A missing timeout turns someone else's outage into yours. |
| 7 | Every new environment variable is listed, with the environments that need it. | A variable set in preview and missing in production is a common cause of a failed launch. |
| 8 | The repo has the `lint` and `typecheck` scripts its deploy checks expect. | Some hosts skip a check silently when its script is missing. |
| 9 | Docs, a one-line release note and a "how to turn it off" note are written. | The person dealing with a problem at an awkward hour may not be the one who built it. |
| 10 | The cost of what was built matches the cost line in the plan. | Usage-priced services and LLM calls can cost far more than planned without any error appearing. |
