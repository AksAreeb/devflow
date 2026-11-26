# Pipeline reference

## Tiers

Assign the highest tier that any part of the change triggers. When unsure between two tiers, pick the higher one: an unneeded check costs minutes, a missed one can cost an incident.

| Tier | Triggers |
|------|----------|
| **3, high risk** | Authentication, sessions or permissions. Payments or money maths. Schema migrations. New or changed public endpoints. Personal data collected, stored or exposed. LLM prompts, tools or model settings. Security-relevant configuration. |
| **2, standard** | Any behaviour change that does not trigger tier 3. |
| **1, cosmetic** | Copy, styles, docs, comments, config with no behaviour change. |

## Steps

"Min tier" is the lowest tier at which the step runs. "When" narrows it further: a step runs only if the tier is high enough and the condition holds. Otherwise record it as `n/a` with the reason.

| # | Step | Min tier | When | Pass bar | Skill (fallback until built) |
|---|------|----------|------|----------|------------------------------|
| 1 | Spec | 1 | always | Acceptance criteria a stranger could check | `devflow:spec` |
| 2 | Explore | 2 | always | Existing patterns and affected files named | `devflow:spec` |
| 3 | Design doc | 3 | always | At least two alternatives weighed, choice justified | `devflow:design` (`engineering:architecture`) |
| 4 | API and schema review | 3 | API or schema changes | Backward compatible, or a migration path for consumers | `devflow:design` (`engineering:system-design`) |
| 5 | Privacy review | 3 | personal data touched | Data, purpose, storage, retention and access listed | `devflow:design` (none) |
| 6 | Threat model | 3 | new surface or trust boundary | Abuse cases listed with mitigations | `devflow:design` (`threat-modeling:model-threats`) |
| 7 | Plan | 2 | always | Slices under 500 lines, flag and rollback plans | `devflow:plan` |
| 8 | Implement | 1 | always | New tests shown failing, then passing; flagged if incomplete | `devflow:build` |
| 9 | Best-practices pass | 2 | always | Formatter clean; clone, unused-code and complexity checks pass where configured | `devflow:build` |
| 10 | Functional QA | 1 | always | Every acceptance criterion checked in the running app | `devflow:qa`, judged by `devflow:verifier` |
| 11 | Regression | 1 | always | Tests, lint, types and build pass; changed lines covered; flaky tests quarantined and logged, never retried silently | `devflow:qa` |
| 12 | Mutation testing | 2 | logic changed | Mutants in changed code are killed, survivors explained | `devflow:qa` |
| 13 | Property and fuzz tests | 3 | parsers, validators, money maths | Properties stated and exercised | `devflow:qa` (none) |
| 14 | Contract tests | 3 | change crosses a service boundary | Consumer and provider agree | `devflow:qa` (none) |
| 15 | UI stress | 2 | UI changed | Survives long text, empty and huge data, slow network, rapid input, narrow widths, dark mode | `devflow:qa` (none) |
| 16 | Visual regression | 2 | UI changed | Screenshot diffs reviewed against baseline | `devflow:qa` (none) |
| 17 | Accessibility | 2 | UI changed | WCAG 2.1 AA: keyboard, contrast, screen reader | `devflow:qa` (`accessibility-testing:wcag-audit`) |
| 18 | Backend stress | 3 | server code changed | p95 latency and error rate within budget under load and spike | `devflow:harden` (`performance-testing:load-test-design`) |
| 19 | Database optimisation | 3 | queries or schema changed | Query plans reviewed, indexes cover new queries, no N+1, expand/contract migration | `devflow:harden` (none) |
| 20 | Security review | 2 | always | No new vulnerabilities; authorisation on every route; dependency, secret and licence scans clean | `devflow:harden` (`security-review`) |
| 21 | AI evals | 3 | LLM features touched | Eval set score holds; injection red-team passes | `devflow:harden` (none) |
| 22 | Code review | 2 | always | Zero Blocking findings; the change leaves the codebase healthier | `devflow:qa`, judged by `devflow:verifier` |
| 23 | Launch readiness | 2 | always | Checklist in `devflow:ship` complete | `devflow:ship` |
| 24 | Ship | 1 | always | Size checked, committed, test steps reported, stopped for go-ahead | `devflow:ship` |
| 25 | Preview and smoke | 2 | deployable app | Preview deploy smoke-tested before promotion | (none) |
| 26 | Follow-through | 2 | always | CI green, review comments answered, postmortem if anything escaped | (`debugging:write-postmortem`) |

Scripted steps are decided by exit code. Steps 10 and 22, and the judgement halves of 15, 17, 20 and 21, are decided by the independent verifier. Stress steps (15, 18) run against a local or preview environment only, never production.
