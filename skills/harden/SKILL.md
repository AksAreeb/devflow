---
name: harden
description: Prove a change holds up under load, bad data and attack. Covers backend stress testing against latency and error budgets, database query plans, catalogue checks and safe migrations, and the manual half of the security review including an entry-point table and infrastructure checks. Use for tier 3 changes, whenever the user says stress test the backend, load test, optimize the database, check the queries, review the migration, security review or harden, or when the devflow pipeline reaches steps 18, 19 and 20.
---

# Harden (steps 18, 19 and 20)

The earlier steps show the change works. These show it keeps working when traffic rises, when tables are large, and when someone goes looking for a way in. They apply at tier 3, each only when its trigger holds.

Commands go through the capture script, `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs"`, shown below as `devflow`.

## Step 18: backend stress (when server code changed)

**Where it runs.** Against a local production build with a local database or a database branch. Never production. Do not load test a hosted preview either unless the user has confirmed the host allows it: some hosts restrict load testing to certain plans and block the source of an unannounced test. A preview can take a light smoke run only.

**Before testing:**
- Seed realistic data. An empty database makes everything look fast.
- Point third-party calls at a sandbox or a stub.
- Note the database's connection limit.

**The runs,** each through `devflow run 18 --check <name>` if the repo configures it, or `--label <name> -- <command>`:

| Run | Shape | What it shows |
|-----|-------|---------------|
| `load` | The expected peak, held for a few minutes | Whether the budgets hold on a normal busy day |
| `stress` | One and a half to two times the peak | Where it starts to fail, and how |
| `spike` | A sudden jump, then back to normal | Whether it recovers without help |
| `soak` | Normal load for 30 to 60 minutes, before a release | Leaks and slow exhaustion |

Use the tool's own thresholds so a miss exits non-zero and is recorded as a failure. Do not judge the numbers by eye.

**Pass bar.** These are starting defaults, not industry standards. After the first run, store the result as the baseline and judge later runs against it.

- Error rate under 1% at expected peak
- 95th percentile latency under 500 ms on the first run, then no more than 20% worse than the baseline
- Peak database connections under 70% of the limit
- No duplicate records or side effects when requests are retried

**What to check in the code,** since these cause most failures under load:
- Every call to another service has a timeout shorter than the request's own limit.
- Retries happen at one layer only, with a cap and a random delay. Retries stacked across layers multiply load at the worst moment.
- Anything that can be retried is safe to repeat: an idempotency key or a unique constraint.
- Serverless functions reuse one pooled database connection and do not open one per request.
- When a dependency is slow or down, the route returns a clear degraded response, not a hang.

## Step 19: database (when queries or schema changed)

**1. Seed first.** Load tens of thousands of rows with a realistic spread, for example a few tenants with most of the data. A query plan on a small table says nothing about a large one, because the planner chooses differently.

**2. Read the plan for each new or changed query.**

```
devflow run 19 --label plans -- <command that runs EXPLAIN (ANALYZE, BUFFERS) for each query>
```

Each should run in at most 100 ms on the seeded data. Look for a scan of the whole table that throws most rows away, a sort feeding a limit, estimated row counts far from the actual ones, and a nested loop that runs its inner side thousands of times.

**3. Check for queries in a loop.** Write a test that counts the queries a list endpoint issues with 1 row and with 20. The counts must be the same.

**4. Run the catalogue checks.**

```
devflow run 19 --label catalogue -- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "${CLAUDE_PLUGIN_ROOT}/skills/harden/references/catalogue-checks.sql"
```

They return rows only when something is wrong: tables with no primary key, foreign keys with no index, exposed tables without row-level security, security on with no policy, policies that name no role, auth functions that run once per row, names that need quoting, and invalid indexes. The script has not been run against a live database by devflow's own tests, so check its output on a schema you know.

**5. Check each migration** against the rules for changing a live database:

| Rule | Why |
|------|-----|
| Only add in this release. Drop or rename in a later one. | Old code and the new schema run together during a deploy. |
| Build indexes concurrently, outside a transaction. | A normal index build blocks writes to the table. |
| Add a foreign key or check as not valid, then validate it. | Validating in one step locks the table while it scans. |
| Set a lock timeout. | A migration waiting on a lock blocks everything queued behind it. |
| Backfill in batches, outside the schema change. | One large update locks rows and bloats the table. |
| State how to undo it. | Some changes cannot be undone, and that should be known beforehand. |

**6. The verifier reviews what a query cannot decide:** column types that fit the data, transactions held open across a network call, locks taken in a consistent order, rows written one at a time in a loop, and whether the app connects through the pooler with settings that suit it. If a Postgres practices skill is installed, it is a good reference here.

## Step 20: security, the manual half

The scans (`secrets`, `deps`, `newdeps`) run on every tier through the `qa` flow. This half needs judgement and applies when an entry point changed.

**Entry-point table.** Write `.devflow/<task>/evidence/20-entry-points.md` listing every new or changed way into the server: route handlers, server actions, webhooks, scheduled routes, database functions callable by clients.

| Entry point | File and line | Where the caller is identified | Where ownership or role is checked | Input validated by |
|-------------|---------------|-------------------------------|-----------------------------------|--------------------|

The rule is that every row has an answer in every column. A check in middleware, a layout or a page does not count for a server action or a route handler, since those can be called directly. Then run:

```
devflow run 20 --builtin entrypoints
```

It fails on any blank or placeholder cell. It cannot tell whether an answer is true, so the verifier opens each file and line and confirms the check is really there.

Then, for each entry point:
- A test proves an unauthenticated caller is refused, and another proves a signed-in user cannot reach someone else's data.
- Inputs are validated against a schema on the server.
- Errors fail closed and do not leak internals.
- Webhooks verify the sender's signature.
- No secret reaches the browser bundle, and no service-level database key is used where a user-level one would do.
- Anything that sends messages, costs money or calls an LLM is rate limited.

**Infrastructure,** when infrastructure-as-code changed. Run the tool's own validation and a scanner through the capture script, and capture the planned changes:

```
devflow run 20 --label iac-validate -- <terraform validate, az bicep build, or the tool's equivalent>
devflow run 20 --label iac-scan -- <the repo's infrastructure scanner>
devflow run 20 --label iac-plan -- <terraform plan, what-if, or the tool's equivalent>
```

The verifier reads the plan against this list: no public access on data stores, managed identity in place of keys and connection strings, no secrets in templates, encryption and a minimum TLS version set, deletion protection on anything holding data, logging switched on. Anything the plan destroys or replaces is called out for the user, and nothing is applied without their go-ahead.

**Pass bar for step 20:** zero secrets, zero critical or high findings in code or in dependencies that have a fix, zero entry points without an explicit decision in every column, and a written reason for each medium finding left open.
