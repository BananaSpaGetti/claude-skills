---
slug: close-repo-gaps
created: 2026-08-26
status: executing
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
- state: doing
- blocked-by: none
- commit:
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
- state: doing
- blocked-by: none
- commit:
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
- state: todo
- blocked-by: 1, 2
- commit:
- risk: none
- change: In `README.md`: tick the marketplace-install checklist item, citing that
  `anvil@claude-skills` installed from a local-directory marketplace and unpacked complete;
  tick the `/anvil` end-to-end item only for what the first run actually covered, and say in
  the same line that dispatch, waves, parallelism and resume were proven separately by this
  run; leave the `council.workflow.js` item unticked, since it has still never been executed;
  update the repo layout section to include `CLAUDE.md`, `.plans/` and
  `plugins/anvil/evals/`; and add a short note recording the open question of whether a bare
  `/anvil` resolves to the plugin for someone with no user-scope command of that name.
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
