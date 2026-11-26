---
name: repo
description: Set up or repair a repository's rules for AI agents and people, from one policy. Covers branch policy, agent instruction files (AGENTS.md, CLAUDE.md), the contribution flow, the pull request template, a branch-policy workflow and the docs layout. Use when starting a new repo, when the user asks for branch rules, repo rules, agent rules, contribution guidelines, documentation structure or clean organization, or when a repo's written rules have drifted or contradict each other.
---

# Repo rules

Rules for a repo tend to be written several times: in an agent guide, a contributing file, a README, a pull request template. The copies drift. One starts pointing at a file that was deleted, another describes a branch flow that changed a year ago, and nothing enforces any of them.

This skill states each rule once, in a `policy` block, and derives the rest: the files people and agents read are generated from it, hooks enforce it locally, a workflow enforces it on the server, and a check reports when a file disagrees with it.

Scripts live in the plugin: `node "${CLAUDE_PLUGIN_ROOT}/scripts/policy.mjs"` and `node "${CLAUDE_PLUGIN_ROOT}/scripts/scan.mjs" rules`.

## 1. Find out how the repo works today

Read before asking. Look at the default branch and the long-lived branches, recent merged pull requests (where they were aimed, how they were merged), any existing `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, pull request template, CODEOWNERS and workflow files, and the commit history for a message convention.

Then ask the user only what the repo cannot tell you, in one round:

- Is there one main branch, or an integration branch and a release branch?
- How does work reach the release branch: a scheduled promotion, a tag, on demand?
- Who merges, and does anything need an approval first?
- Is there a commit message convention?
- If the repo already follows a shared template or platform, which parts must not be changed here?

That last question matters. If the organization generates some of these files from a shared template, leave those files alone and only write the policy to match them.

## 2. Write the policy

Add a `policy` block to `devflow.config.json`:

```json
{
  "policy": {
    "integrationBranch": "dev",
    "releaseBranch": "main",
    "hotfixPrefix": "hotfix/",
    "branchPrefixes": ["feat/", "fix/", "docs/", "chore/"],
    "commits": "conventional",
    "mergeIntoRelease": "merge",
    "maxDiffLines": 500,
    "agentFile": "AGENTS.md",
    "instructionBudget": 80,
    "docs": ["docs/README.md", "docs/decisions", "docs/operations"]
  }
}
```

Leave out `releaseBranch` for a repo with a single main branch. Set `commits` to `free` if there is no convention. Choose `agentFile` to match what the repo already treats as the main guide.

Show the user the policy and get their agreement before generating anything. Everything else follows from it.

## 3. Generate what is missing

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/policy.mjs"            # shows what would be created
node "${CLAUDE_PLUGIN_ROOT}/scripts/policy.mjs" --write    # creates the missing files
```

It writes an agent guide, a one-line pointer in the other agent file, `CONTRIBUTING.md`, a pull request template, a branch-policy workflow for a two-branch repo, and an index file for each docs entry. It never overwrites a file that exists.

Keep the agent guide short. It holds rules, not explanations of the architecture. Longer instruction files cost more on every session and have not been shown to improve results. Put reference material in `docs/` and link to it.

## 4. Check the files that already existed

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/scan.mjs" rules
```

It reports missing files, references to paths that do not exist, statements that contradict the policy, a second agent file that does not point to the first, instructions over the line budget, and a default branch that differs from the policy.

For each finding, decide with the user which side is right. If the file is wrong, fix the file. If the file describes how the repo really works, change the policy and regenerate. Do not edit a file to silence the check while leaving the disagreement in place.

Some things it cannot see, so read for them yourself: stale names of tools or hosts the repo no longer uses, instructions that send an agent to a document outside the repo, and rules that are sound but that nothing enforces. List the unenforced ones for the user. Each either gets enforcement or is accepted as guidance.

## 5. Make the enforcement real

- **Locally,** the plugin's hooks read the policy and refuse a branch with the wrong name or starting point, a pull request aimed at the wrong branch, a push straight to a protected branch, and a commit subject that breaks the convention.
- **On the server,** the generated workflow fails a pull request aimed at the wrong branch. It only blocks a merge once the repository requires that check, which is a setting the user changes, along with making the integration branch the default.
- **Over time,** add the rules check to CI so that drift is caught when it is introduced.

Tell the user plainly which settings are theirs to change. Do not change repository settings or branch protection yourself.

## 6. Land it as its own change

Rules changes go in their own pull request, separate from feature work, so they can be reviewed for what they are. In the description, list what was generated, what was corrected, and what remains unenforced.
