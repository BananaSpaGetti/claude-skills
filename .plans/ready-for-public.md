---
slug: ready-for-public
created: 2026-09-12
status: reviewing
branch: anvil2
---

# Get claude-skills ready to be made public, and stop one step short of flipping it

## Goal

The repository is private and its documentation has drifted from what is actually true: the
Known gaps section predates the first end-to-end `anvil2` run, the GitHub repo description still
names a plugin that was renamed and a skill count that is wrong, and the two copies of the
`patimakorn` description disagree. This plan closes those, records the exact procedure for going
public so it is not improvised later, merges the `anvil2` branch into `main` and pushes. It
deliberately stops before `gh repo edit --visibility public` — flipping that is the user's own
keystroke, because a fork or clone taken while public cannot be recalled.

## Context

Repo: `C:\Users\<user>\Claude\Projects\claude-skills`, a Claude Code plugin marketplace.
No build, no runtime — the deliverable is the files themselves.

- `README.md` — documents the plugins for someone installing them. Its `## Known gaps` section
  (currently lines 210-250) is the single home for verified/unverified claims; nothing else in
  the file may make status claims.
- `CLAUDE.md` — orientation for an agent changing this repo. Carries the version-bump rule and
  the validate-before-commit rule.
- `.claude-plugin/marketplace.json` — the marketplace manifest, 5 plugin entries.
- `plugins/patimakorn/.claude-plugin/plugin.json` — that plugin's own manifest.
- `plugins/patimakorn/commands/anvil2.md` — the command this run is exercising.
- `plugins/patimakorn/workflows/execute.workflow.js` — anvil2's phase 5 dispatcher.
- `plugins/patimakorn/workflows/execute.workflow.test.js` — its test, 22 assertions, stubs the
  agent, needs no network.

Facts established before this plan was written:

- **The repository is PRIVATE.** `gh repo view --json visibility` returns `PRIVATE`.
- **Anonymous access baseline, taken while private:** both
  `curl -s -o /dev/null -w "%{http_code}" https://raw.githubusercontent.com/BananaSpaGetti/claude-skills/main/.claude-plugin/marketplace.json`
  and the same against `https://api.github.com/repos/BananaSpaGetti/claude-skills` return **404**.
  After the repo is made public both must return **200**. This is the logged-out test; it needs no
  `gh auth logout`.
- **The GitHub repo description is stale.** It currently reads: "Small, composable Claude Code
  plugins: anvil (a one-command interview-plan-execute-review pipeline), an adversarial
  five-advisor council, six vendored engineering skills, and a game save-file reverse-engineering
  method." The plugin was renamed `anvil` -> `patimakorn` on 2026-08-30, and there are **nine**
  vendored engineering skills, not six.
- **Actual counts:** 5 directories under `plugins/`, 5 entries in the marketplace `plugins` array,
  9 directories under `plugins/engineering-kit/skills/`.
- **The two `patimakorn` descriptions disagree.** Both manifests are at version `0.8.0`, but
  `.claude-plugin/marketplace.json` carries one extra sentence that `plugin.json` does not:
  "The interview argues with the decisions you arrived holding, and writes the ones that outlive
  the plan out as ADRs so they survive the worklist."
- **`git log`:** branch `anvil2` is 8 commits ahead of `origin/main`; `origin` has only `main`.
- **This plan's own run is the first end-to-end `anvil2` run.** Whatever it demonstrates is the
  evidence that closes the "never been run end to end" gap.

## Decisions

Settled with the user in the interview:

1. **Merge `anvil2` into `main` before pushing**, rather than pushing the branch alone or opening
   a PR. Rejected: pushing the branch only — a stranger installing from a public repo gets the
   default branch, so `anvil2` sitting unmerged means the published plugin has no `anvil2`
   command. Rejected: opening a PR — no second reviewer exists, so the PR would only add a step.
2. **`${CLAUDE_PLUGIN_ROOT}` must be tested before the repo goes public**, not after. Rejected:
   going public first and leaving it as a Known gap — phase 5 of `anvil2` resolves its script
   through that variable, so if it does not expand, every stranger's `anvil2` run breaks at the
   execute phase, and publishing the one thing that might be broken is the avoidable risk.
   Rejected: abandoning the variable for an inline `script` parameter — that would work, but it
   inlines ~220 lines into the command file and is a change worth making only if the test fails.
   **This test cannot run inside this plan**: plugins load at session start, so it needs a push,
   a `claude plugin update`, and a fresh session. It is recorded as a follow-up, not a task.
3. **The logged-out install test is `curl` with no token**, not `gh auth logout`. Rejected:
   logging out — it is the more faithful test but it would have to log back in afterwards and the
   git credential helper keeps a separate copy in the Windows keyring, so the blast radius is
   larger than the test is worth. The 404 baseline above is already recorded; the same commands
   returning 200 is the pass condition.
4. **This run ends at push.** `gh repo edit --visibility public` is not run. Rejected: flipping in
   this run — a fork or clone taken while the repo is public cannot be recalled, so that keystroke
   stays with the user.
5. **The stale GitHub repo description is fixed in this run** (it is repo metadata, not a file),
   but by the main loop rather than an executor, because it mutates remote state.

## Tasks

### Task 1 — Rewrite README's Known gaps against what this run actually proved
- state: done
- blocked-by: none
- commit: b0049ec
- risk: none
- change: In `README.md`, rewrite the `## Known gaps` section. Replace the bullet
  "`anvil2` has never been run end to end" with a `[x]` bullet recording that it ran on this
  repository on 2026-09-12 under plan `ready-for-public`, and state plainly which parts the run
  exercised and which it did not. Keep the `${CLAUDE_PLUGIN_ROOT}` bullet `[ ]` and sharpen it to
  say the test requires a push, a `claude plugin update` and a fresh session, and that it is now
  a blocker on going public rather than a loose end. Keep the "repository is private" bullet `[ ]`
  and add the exact anonymous-access commands and their current 404 result as the baseline, so the
  person who flips the switch knows what to re-run and what a pass looks like. Do not touch any
  other bullet. Do not add status claims anywhere else in the file — that section is the single
  home for them.
- done-when: `## Known gaps` contains a `[x]` bullet for the anvil2 end-to-end run naming this
  plan's slug and the date; the `${CLAUDE_PLUGIN_ROOT}` bullet is still `[ ]` and names the
  three steps its test needs; the private-repo bullet is still `[ ]` and quotes both curl
  commands and the 404 baseline.
- verify: `grep -n "ready-for-public\|CLAUDE_PLUGIN_ROOT\|404" README.md` shows all three, and
  `sed -n '/## Known gaps/,/## License/p' README.md` reads correctly end to end.

### Task 2 — Record the go-public procedure in CLAUDE.md
- state: done
- blocked-by: none
- commit: 8dc159a
- risk: none
- change: Add a section to `CLAUDE.md` titled "Making this repository public" giving the ordered
  procedure: the `${CLAUDE_PLUGIN_ROOT}` test must pass first; then `gh repo edit
  BananaSpaGetti/claude-skills --visibility public`; then re-run both anonymous curl commands and
  confirm they return 200 where they returned 404; then tick the private-repo box in README's
  Known gaps. State that the visibility flip is the user's keystroke and an agent must not run it
  unasked, because a fork or clone taken while public cannot be recalled. Keep it short — this
  file is instructions for an agent, not prose.
- done-when: `CLAUDE.md` has that section, the four steps are in order, and it says an agent does
  not run the flip unasked.
- verify: `grep -n -A20 "Making this repository public" CLAUDE.md` shows the four ordered steps
  and the do-not-flip sentence.

### Task 3 — Reconcile the two patimakorn descriptions and bump the version
- state: done
- blocked-by: none
- commit: 086904a
- risk: none
- change: The `patimakorn` description in `.claude-plugin/marketplace.json` carries a sentence
  that `plugins/patimakorn/.claude-plugin/plugin.json` does not: "The interview argues with the
  decisions you arrived holding, and writes the ones that outlive the plan out as ADRs so they
  survive the worklist." Add that sentence to `plugin.json`'s description, in the same position
  it occupies in the marketplace entry, so the two read identically. Then raise `version` from
  `0.8.0` to `0.9.0` in **both** files. Do not reformat either JSON file beyond the fields being
  changed — keep 2-space indent and the existing key order.
- done-when: the two descriptions are byte-identical, both files say `"version": "0.9.0"`, and
  `git diff --stat` shows only those two files with a small line count.
- verify: `python -c "import json;a=json.load(open('.claude-plugin/marketplace.json',encoding='utf-8'));b=json.load(open('plugins/patimakorn/.claude-plugin/plugin.json',encoding='utf-8'));p=[x for x in a['plugins'] if x['name']=='patimakorn'][0];print('desc match:',p['description']==b['description']);print('versions:',p['version'],b['version'])"`
  prints `desc match: True` and `versions: 0.9.0 0.9.0`.

### Task 4 — Fix the stale GitHub repo description
- state: done
- blocked-by: none
- commit:
- risk: judgement-call
- change: Run `gh repo edit BananaSpaGetti/claude-skills --description "<new>"` with a description
  that names `patimakorn` rather than `anvil`, says nine vendored engineering skills rather than
  six, and mentions that `patimakorn` ships two commands. Mutates remote state, so it stays in the
  main loop.
- done-when: `gh repo view --json description` returns the new text with no mention of the old
  plugin name and no "six".
- verify: `gh repo view BananaSpaGetti/claude-skills --json description` — read the output and
  confirm it names patimakorn and nine.

### Task 5 — Merge anvil2 into main and push
- state: todo
- blocked-by: 1, 2, 3
- commit:
- risk: judgement-call
- change: `git checkout main`, `git merge anvil2` (fast-forward expected — `main` has not moved),
  then `git push origin main`. Git writes, so this is main-loop work by construction; executors
  are forbidden every git write command.
- done-when: `origin/main` contains every commit from this plan and `git status` is clean.
- verify: `git log --oneline origin/main -3` shows this plan's commits, and
  `git log --oneline origin/main..HEAD` is empty.

## Out of scope

- **Making the repository public.** Decision 4. The command is written down in task 2 for the
  user to run themselves.
- **Testing `${CLAUDE_PLUGIN_ROOT}`.** Decision 2 — it needs a fresh session after a
  `claude plugin update`, which no task in this plan can produce.
- **Renaming the `patimakorn` plugin.** The user settled on 2026-09-03 that the name stays.
- **Running the eval suite.** `claude plugin eval` is still in early access and prints a notice
  rather than running.
- **`council.workflow.js`'s own `${CLAUDE_PLUGIN_ROOT}` path.** Same unproven variable, but
  proving it for `anvil2` proves it for `council` too, so it needs no separate task.

## Risks

- **Task 5 pushes to `main` on a repository that is about to be made public.** Anything committed
  is then one visibility flip away from being permanent. Mitigation: the repo was audited for
  secrets and personal paths on 2026-09-03 — tracked files and full git history both came back
  clean — and this plan adds no new file types. The push itself is reversible while the repo is
  private.
- **Tasks 1 and 2 both write documentation that makes claims.** A claim written here that this run
  did not actually demonstrate is exactly the failure mode this repo keeps having. Mitigation:
  task 1's `done-when` ties each claim to evidence from this run, and phase 6's review reads them
  against the diff.
- **No task edits the same file as another.** Task 1 owns `README.md`, task 2 owns `CLAUDE.md`,
  task 3 owns the two manifests. This is deliberate: concurrent executors editing one file would
  race.

## Log

- 2026-09-12 — plan written. First end-to-end `anvil2` run.
- 2026-09-12 — tasks 1-3 dispatched to `execute.workflow.js` as three concurrent executors on
  three disjoint files; all three returned `passed: true` with real verify stdout. Each verify was
  re-run in the main loop before its commit. Committed b0049ec, 8dc159a, 086904a.
- 2026-09-12 — task 4 done in the main loop. First attempt failed:
  `HTTP 422: description cannot be more than 350 characters`. Re-run at 297 characters, accepted.
  No file changed — the description lives in GitHub repo metadata, so task 4's `commit:` field is
  correctly empty and it has no revert handle. The previous description is preserved in this
  plan's Context above; that is the only record of it.
- 2026-09-12 — review round 1, `xhigh`, returned 15 findings, all against this plan's own output.
  Ten were fixed. Three could not be fixed retroactively and are recorded here instead:
  **(a)** task 1's `verify:` was vacuous — `grep "ready-for-public\|CLAUDE_PLUGIN_ROOT\|404"`
  matched strings that were already in `README.md` before the task ran, so it returned 0 whether
  the edit happened or not. The executor's `passed: true` rested on a check that could not fail.
  The `done-when` was precise; the `verify:` did not test it. **A verify that cannot fail is not a
  verify, and writing one is a planning defect, not an executor defect.**
  **(b)** task 3 edited both plugin manifests but its `verify:` omitted the two
  `claude plugin validate` commands this repo mandates before any commit under `.claude-plugin/`
  or `plugins/`. Both pass at HEAD when run by hand, so nothing shipped broken — but the plan's
  gate did not include the repo's own gate.
  **(c)** `status:` was left at `executing` through the start of phase 6. A resume in that window
  would have read the plan as mid-phase-5, seen task 5 unblocked, and pushed to `main` with the
  review never having run.
