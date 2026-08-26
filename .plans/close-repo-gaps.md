---
slug: close-repo-gaps
created: 2026-08-26
status: done
branch: test/anvil-run-2
---

# Close the three gaps the first anvil run cut, and exercise what it left untested

## Goal

The first `anvil` run (`.plans/anvil-self-test.md`) was cut to a single main-loop task at
approval, so subagent dispatch, wave grouping, parallel executors and resume-from-disk were
never proven. This run closes the three real gaps that were cut — the repo has no `CLAUDE.md`
of its own, `anvil` has no eval suite, and the README's publishing checklist is stale — and is
shaped so that closing them exercises exactly the machinery the first run skipped: two
executors running concurrently in wave 1, then a dependent task in wave 2, with a deliberate
stop in between so the user can prove resume works from the plan file alone.

## Context

- `.plans/anvil-self-test.md` — the first run's plan, `status: done`. Its "Out of scope"
  section is where these three tasks came from.
- `plugins/anvil/commands/anvil.md` — the command under test. Phase 2 now prefers the
  `AskUserQuestion` tool for discrete choices, added by the first run.
- `plugins/anvil/.claude-plugin/plugin.json` — `anvil` v0.1.0.
- `plugins/engineering-kit/` — six skills vendored from `mattpocock/skills` under MIT. Its
  `NOTICE` records provenance and the one edit made to a skill body.
- `plugins/council/`, `plugins/game-save-re/` — the other two published plugins.
- `.claude-plugin/marketplace.json` — four plugins, each `version: "0.1.0"`, each
  `source: "./plugins/<name>"`.
- `README.md` — has a "Before publishing" checklist that no longer matches reality.
- `drafts/` — two Thai-language skills, deliberately not wired into the marketplace.

Facts established before planning:

- **The marketplace install works.** `claude plugin marketplace add <local path>` succeeded,
  `claude plugin install anvil@claude-skills` succeeded, and the plugin unpacked complete to
  `~/.claude/plugins/cache/claude-skills/anvil/0.1.0/`. So `source: "./plugins/<name>"`
  resolves, and the other three plugins use the identical pattern.
- **Token cost, measured.** `claude plugin details anvil` reports ~129 tokens always-on
  (executor ~80, anvil ~50) and ~4.1k on-invoke for the command, ~810 for the agent.
- **A plugin command does not shadow a user-scope command of the same name.** With both
  installed, the session lists `anvil` (user scope) and `anvil:anvil` (plugin). Whether a bare
  `/anvil` resolves to the plugin when no user-scope command exists is **not known**.
- **`claude plugin eval` and `claude plugin eval init` are both gated**: each prints
  `plugin eval is currently in early access`. No template can be generated locally, and no eval
  can be run to prove an authored suite is well-formed.
- `claude plugin validate` passes on the marketplace and on all four plugins.
- The repo has no remote. Nothing has been published.

## Decisions

- **Three tasks, two waves, with a stop between them.** Wave 1 is two independent tasks so two
  executors run concurrently; wave 2 depends on both, so it cannot start early. The stop after
  wave 1 is the resume test — the user runs `/anvil` with no arguments and the state must come
  back off disk, not out of conversation memory.
- **The eval suite uses `prompt.md` + `graders/*.md`, not `case.yaml`.** The runner's help
  documents both layouts, but with the runner gated there is no way to check a hand-written
  `case.yaml` against its schema. The prose layout needs almost no schema guessed. Rejected:
  authoring `case.yaml` from the flag names in `--help`, which would be unverifiable guesswork
  presented as working config.
- **The eval case targets the dirty-tree refusal.** Of everything `anvil` does, silently
  stashing or committing around a dirty working tree is the failure that would cost a user real
  work, and it is a single-turn behaviour a grader can judge. Rejected: an end-to-end case
  covering all seven phases — too long to grade reliably and too slow to run.
- **No task ticks the marketplace-install checklist item by assumption.** It is now genuinely
  verified, so task 3 ticks it *because* of the evidence recorded in Context above.
- **The `/anvil:anvil` stutter is left alone.** Renaming would touch the marketplace manifest,
  the plugin manifest, the README and the user's own command file, and the decision depends on
  whether a bare `/anvil` resolves for someone without a user-scope copy — which is unknown.
  Recorded as an open question in the README instead.
- **`drafts/` stays untouched.** Whether those two skills ship is its own interview.

## Tasks

### Task 1 — Add a repo-level CLAUDE.md
- state: done
- blocked-by: none
- commit: a8293e3
- risk: none
- change: Create `CLAUDE.md` at the repo root, orienting an agent that has just cloned this
  repo. Cover: what the repo is (a Claude Code plugin marketplace, not an application); the
  layout — `.claude-plugin/marketplace.json` at the root, one directory per plugin under
  `plugins/`, each with its own `.claude-plugin/plugin.json`; the rule that a plugin's
  `version` must match its marketplace entry, or `claude plugin validate` fails; the rule that
  `claude plugin validate .` and `claude plugin validate plugins/<name>` must both pass before
  any commit; that `drafts/` is deliberately unpublished and must not be wired into the
  marketplace without a decision; and that `plugins/engineering-kit/` is vendored third-party
  code under MIT whose `NOTICE` must stay accurate whenever one of its skill bodies changes.
  Write in English. Do not restate `README.md` — that file is for users installing the
  plugins, this one is for agents changing the repo.
- done-when: `CLAUDE.md` exists at the repo root, covers every point above, and contradicts
  nothing in `README.md`.
- verify: `test -f CLAUDE.md && claude plugin validate . | tail -1`

### Task 2 — Author an eval suite for anvil
- state: done
- blocked-by: none
- commit: 1eb51d5
- risk: none
- change: Create `plugins/anvil/evals/` holding one case, in the `prompt.md` +
  `graders/*.md` layout. The case puts the agent in a repo with a dirty working tree and asks
  it to run the `anvil` workflow; the graders check that it reported the dirty tree and stopped,
  and that it did **not** run `git stash`, `git commit`, `git checkout` or any other command
  that would move the user's uncommitted work. Add `plugins/anvil/evals/README.md` stating that
  `claude plugin eval` is in early access, that this suite has therefore never been executed,
  and what to run once it is available (`claude plugin eval anvil`).
- done-when: the eval directory holds one complete case plus the README, and the README is
  explicit that the suite is unrun.
- verify: `ls -R plugins/anvil/evals && claude plugin validate plugins/anvil | tail -1`

### Task 3 — Bring the README's publishing checklist up to date
- state: done
- blocked-by: 1, 2
- commit: d4604df
- risk: none
- change: In `README.md`: tick the marketplace-install checklist item, citing that
  `anvil@claude-skills` installed from a local-directory marketplace and unpacked complete;
  tick the `/anvil` end-to-end item only for what the first run actually covered, and say in
  the same line that dispatch, waves, parallelism and resume were proven separately by this
  run; leave the `council.workflow.js` item unticked, since it has still never been executed;
  update the repo layout section to include `CLAUDE.md`, `.plans/` and
  `plugins/anvil/evals/`; and add a short note recording the open question of whether a bare
  `/anvil` resolves to the plugin for someone with no user-scope command of that name. Also fix
  the stale plugin count: `README.md:7` and `README.md:92` both say "five plugins", left behind
  when `spec-build` was removed; the marketplace and `plugins/` both hold four.
- done-when: no ticked line claims something unverified, and the layout section matches disk.
- verify: `grep -A14 'Before publishing' README.md` — read it and confirm each ticked line
  maps to evidence recorded in this plan's Context or Log.

## Out of scope

- Renaming the `anvil` command or plugin to remove the `/anvil:anvil` stutter.
- Deciding whether `drafts/thai-deliverable` and `drafts/viral-promo-clip` ship.
- Creating a GitHub remote or pushing anything.
- Running the eval suite, or the council workflow.
- Any change to the user's `settings.json`, installed plugins, or MCP connectors.

## Risks

- All three tasks are additive or edit tracked markdown. Nothing here is destructive, and each
  task is recoverable with `git revert` of its own commit.
- The branch is cut from `4f86c83` on `main`, which is clean and validated, so abandoning the
  whole run costs one `git checkout main` and a branch delete.

## Log

- 2026-08-26 — plan written on branch `test/anvil-run-2` off `4f86c83`.
- 2026-08-26 — wave 1: two executors ran concurrently. Task 1 -> `a8293e3`, task 2 -> `1eb51d5`.
  Both verify commands re-run by the main loop: `claude plugin validate .` and
  `claude plugin validate plugins/anvil` both printed `✔ Validation passed`; `ls -R` listed
  the four eval files. Executors ran no git commands; the main loop committed sequentially.
- 2026-08-26 — task 2's executor flagged two places it had to guess, both recorded in the eval
  files themselves: how a `prompt.md` case receives its git fixture, and the grader file format
  beyond the single documented `tool_used` key. Both written as prose, no invented config keys.
- 2026-08-26 — task 1's executor noticed `README.md` still claims "five plugins" while the
  marketplace and `plugins/` hold four, stale since `spec-build` was dropped. Added to task 3's
  change spec rather than fixed out of band.
- 2026-08-26 — **resume proven.** A later session ran `/anvil` with no arguments, carrying no
  conversation memory of the first two tasks. It listed `.plans/*.md`, read `status: executing`
  off this file, found tasks 1 and 2 already `state: done` with `commit:` shas, and picked up at
  task 3 as the only task whose blockers were satisfied. No task was re-run. This is the
  citation behind the second ticked line of the README's "Before publishing" list.
- 2026-08-26 — wave 2: task 3 done in the main loop, not delegated — its `verify:` is a
  judgement call ("read it and confirm each ticked line maps to evidence"). `README.md` -> `d4604df`.
  Verify re-run: `grep -A14 'Before publishing' README.md` printed the three checklist items;
  read and confirmed each ticked line cites evidence recorded in this plan's Context or Log, and
  that `council.workflow.js` stays unticked. The status blockquote at the top of `README.md` was
  corrected in the same task — it still said "nothing has been installed through a marketplace
  end to end", which the newly ticked install line directly contradicts.
- 2026-08-26 — review round 1 (Standards + Spec axes, in parallel over `18cef3c...HEAD`).
  Five findings, all fixed in `8b035b5`. The load-bearing one: **task 1's change spec above is
  wrong.** It told the executor to write "the rule that a plugin's `version` must match its
  marketplace entry, or `claude plugin validate` fails". It does not fail. Measured on a scratch
  copy of the tree with `anvil` set to `9.9.9`: `claude plugin validate .` printed
  `⚠ Found 1 warning … ✔ Validation passed with warnings` and **exited 0**, and
  `claude plugin validate plugins/anvil` printed a clean pass, since per-plugin validation never
  compares against the marketplace. `CLAUDE.md` now documents the real behaviour and tells the
  agent to treat any warning as a failure. The task spec is left as written — it is the record
  of what was asked for, and this line is the correction. The other four: `CLAUDE.md`'s layout
  block had already drifted from `README.md`'s inside wave 1; both eval files claimed
  `claude plugin eval --help` documents no fixture mechanism when it documents `--scaffold` /
  `scaffold_script`; `CLAUDE.md` said "published" where `README.md` says "not published yet";
  and `README.md`'s Install block gave a remote that does not exist.
- 2026-08-26 — review round 2 confirmed all five round-1 fixes and raised five more, fixed in
  `d42e1e9`: the install-time warning said the marketplace *entry* is ignored when only its
  *version* is; the Install block still led with the non-working remote; `CLAUDE.md`'s layout
  tree omitted `CLAUDE.md` itself; and `.claude-plugin/marketplace.json`'s top-level
  `description` still advertised "a two-command spec-then-build pipeline" — stale from the same
  `spec-build` removal that left the "five plugins" counts behind, and omitting `anvil` and
  `engineering-kit` entirely. Manifest descriptions are not schema-checked, so validation never
  caught it.
- 2026-08-26 — review round 3 (the cap) confirmed all five round-2 fixes and raised three more,
  fixed in `7c4e8c2`. One was self-inflicted: round 2's Install rewrite claimed the `/plugin`
  slash form "has actually been tested" when what was tested is the `claude plugin ...` CLI
  equivalent. The other two are counting errors the earlier rounds walked past:
  `plugins/anvil/commands/anvil.md` has **eight** `## Phase` headings (0 through 7), but
  `README.md` said "Seven phases" and omitted close-out, and the newly ticked checklist line had
  inherited the same undercount; and `README.md` said `anvil` "stops and waits in exactly two
  places" when Phase 0 also offers to branch off `main` and waits, Phase 0 offers `git init`,
  and Phase 5 step 6 puts three options to the user on a failed task.
- 2026-08-26 — **surviving, not fixed:** `plugins/anvil/commands/anvil.md:11` carries the same
  false "two places still stop and wait" claim that was corrected in `README.md`. Left alone
  deliberately — that file is the command being exercised by this very run, and editing it
  mid-run is outside every task in this plan. It is a one-line fix for a separate change.
- 2026-08-26 — closed out. 3/3 tasks done: tasks 1 and 2 by concurrent executors in wave 1,
  task 3 in the main loop because its `verify:` is a judgement call. 3 review rounds run,
  13 findings fixed across them.
