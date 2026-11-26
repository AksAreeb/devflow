---
name: ui
description: Stress test a changed screen with realistic worst-case data, check it against visual baselines, and verify accessibility. Maps every rendered field to its limit, builds one worst-case fixture, captures screenshots at phone to desktop widths in light and dark, and has an independent verifier read them. Use when a slice changes UI, whenever the user says stress test, break it, edge cases, worst case, responsive, visual regression or accessibility, or when the devflow pipeline reaches steps 15, 16 and 17.
---

# UI stress, visual regression and accessibility (steps 15 to 17)

Screens are built and demoed with tidy data: short names, three rows, a square photo. Real data is not tidy. These steps put the worst realistic data on the screen before a user does, and keep it there as a permanent test.

They apply at tier 2 and up when a slice changes UI. For a small change to an existing screen, reuse that screen's fixture and add only the cases the change introduces. Build a new surface map and fixture when a screen or component is added.

Commands go through the capture script, `node "${CLAUDE_PLUGIN_ROOT}/scripts/run.mjs"`, shown below as `devflow`.

## Step 15: UI stress

### 1. Map the surface

For each changed screen, list every piece of data it renders in `.devflow/<task>/evidence/15-surface-map.md`:

| Field | Where it comes from | Type | Can be missing? | Limit in validation | Limit in database |
|-------|---------------------|------|-----------------|---------------------|-------------------|

Find the limits in the code, not from memory: the validation schema, the form's `maxLength`, and the column definition in the migrations.

Two results are findings in their own right, before any screenshot:

- **No limit anywhere.** The screen has to cope with any length, and usually cannot. Raise it with the user: it becomes a new requirement in the spec, or a recorded decision to accept it.
- **The two limits disagree.** One side will reject what the other accepts.

### 2. Build one worst-case fixture

Using `references/worst-case-catalogue.md`, write a single fixture of realistic worst-case data for the screen, next to the app's existing demo or seed data. Keep every value inside the limits from the surface map, since data the system would reject proves nothing. Spread the cases across rows so that one screenshot shows many of them. Include the empty, single-item and very large collection states as separate variants.

Make the app able to load the fixture in development and test builds only, selected by something that lives in the URL so a screenshot can be reproduced. Commit the fixture: it stays as a regression test.

Change the data, not the markup. The point of this step is to see what the existing screen does.

### 3. Capture it

Copy `references/ui-stress.spec.template.ts` into the repo's end-to-end tests, fill in the screens, and add the hand-written cases it lists at the bottom. Check its API calls against the versions the repo uses, since the template is not run by devflow's own tests. Then:

```
devflow run 15 --check ui-stress
```

It captures each screen at 320, 375, 768 and 1280 pixels, at 200% zoom, in light and dark, and fails on horizontal overflow or console errors. Add a slow-network run and the double-submit and offline cases for any form.

Three rules for any capture, learned from a trial where a capture passed and proved nothing:

- **It must be able to fail on the code before the change.** Write the values it expects by hand. A capture that works out its expected values with the same formula as the code agrees with the code whatever the code does. If the real data cannot reach the case the change is about, such as a tenth item in a list of eight, the capture needs a fixture that does, and without one it is only a record that the old cases still look the same. Say which of the two it is in the evidence.
- **A page-level overflow check does not see fixed panels.** An open menu or a dialog that locks scrolling can cut text off at the edge while the page reports no sideways scroll. Measure the panel's own content, or capture it and have the verifier read the screenshot.
- **Stop what you start.** A script that starts a server waits for it to stop and confirms the port is free before it exits.

### 4. Have the verifier read the screenshots

Send the `devflow:verifier` agent step 15 with the screenshots, the surface map and `references/failure-signatures.md`. It reports each break with its severity, the field and value that caused it, what happens, and the likely cause. It records the verdict.

A finding judged from the code without a screenshot is not evidence. If screenshots could not be captured, mark the step `not-run` and say why.

Some findings are choices, such as whether a long title truncates or wraps. Put those to the user with a recommendation. Do not settle them yourself.

### 5. Fix, then capture again

Fix Blocking findings, re-run the capture, and check the tidy demo data as well as the fixture, since a fix for long text can break short text.

Performance belongs here too. With the fixture loaded, largest contentful paint should be at most 2.5 seconds, layout shift at most 0.1, and interaction latency at most 200 milliseconds on a throttled run. A miss in a lab run means investigate, since lab conditions are harsher than real use.

## Step 16: visual regression

```
devflow run 16 --check visual
```

The worst-case screenshots from step 15 are baselines, alongside the screen's normal states. Three rules keep baselines trustworthy:

- **Create and compare them in one fixed environment,** such as the test runner's container. Fonts render differently across operating systems, so a baseline made on a laptop fails everywhere else.
- **Make the page still before capturing:** animations off, clock frozen, data seeded, changing regions masked.
- **A baseline changes only in its own commit, which the user approves** after looking at the image diff. Never update snapshots to turn a failure green. The hooks protect committed snapshot files for this reason.

## Step 17: accessibility

**Automated half.**

```
devflow run 17 --check a11y
```

The scan must list the WCAG 2.2 tags explicitly, as the template does. Scanners leave those rules off by default, so a default scan checks an older standard.

**Manual half,** by the verifier, because a scan finds only about half of real problems:

- Complete every flow in the spec using the keyboard alone. Focus is always visible, moves in a sensible order, and is never trapped.
- Use a screen reader on the changed screens. Controls announce a name, a role and a state. Changes that happen without a page load, such as a saved message or new results, are announced.
- Check the screen at 200% zoom and at 320 pixels wide.
- Check that touch targets are at least 24 by 24 pixels, and that errors are stated in text and tied to their fields.

A clean scan is never reported as "accessible" on its own. If the manual half was not done, the step is `not run`, and the ship report says so.

For sites in Ontario, public websites of organizations with 50 or more employees must meet WCAG 2.0 AA under provincial law. Building to WCAG 2.2 AA exceeds that. Confirm the organization's obligations with a qualified source before treating this step as optional.
