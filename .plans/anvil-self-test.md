---
slug: anvil-self-test
created: 2026-08-26
status: approved
branch: test/anvil-run-1
---

# Anvil self-test: close the repo's real gaps while exercising every phase

## Goal

This repository publishes Claude Code plugins but has never been through its own pipeline.
Originally scoped as four gaps across two waves. **The user cut it to one task before
approval** — this run is a smoke test, not a full exercise. What remains is the single gap the
user asked for directly: `anvil`'s interview makes the user type answers when the questions are
discrete choices, and it should offer clickable options instead.

What this reduced run therefore does **not** test: subagent dispatch, wave grouping, parallel
executors, and resume from disk. It does test the risk-class refusal to delegate, the per-task
commit, and the capped review loop.

## Context

- `plugins/anvil/commands/anvil.md` — the command under test; seven phases, resumable. Task 1
  edits this file.
- `plugins/anvil/.claude-plugin/plugin.json` — `anvil` v0.1.0.
- `plugins/engineering-kit/` — six skills vendored from `mattpocock/skills` under MIT; see its
  `NOTICE`. `anvil` names them as optional and works without them.
- `plugins/council/`, `plugins/game-save-re/` — the other two published plugins.
- `.claude-plugin/marketplace.json` — lists all four plugins; every entry carries
  `version: "0.1.0"` and a `source` of the form `./plugins/<name>`.
- `README.md` — has a "Before publishing" checklist, left stale by this run.
- `drafts/` — `thai-deliverable` and `viral-promo-clip`, deliberately not wired into the
  marketplace. Out of scope here.
- `LICENSE` — MIT, copyright `BananaSpaGetti`.

Facts established during the interview:

- `claude plugin validate` passes on the marketplace manifest and on all four plugins.
- `claude plugin eval` reports `plugin eval is currently in early access`. An eval suite can be
  authored, but running it may be unavailable on this account — so no task may use "the eval
  run passes" as its verification.
- `claude plugin details` requires an installed plugin; it cannot inspect a plugin from a path.
- The repo has no remote. Nothing here has been published.
- A `/anvil` command exists both at `~/.claude/commands/anvil.md` (user scope) and inside the
  plugin. The user chose to leave both in place and observe which one wins on install. That
  observation happens outside this plan.

## Decisions

- **One task.** The plan was written with four tasks across two waves specifically to exercise
  wave grouping; the user reduced it to one at approval, accepting that dispatch, waves,
  parallelism and resume go untested this run.
- **The one remaining task is not delegated.** It rewrites the instructions the running command is executing.
  Judging how to phrase agent instructions is exactly the `judgement-call` risk class, so the
  main loop does it. This still tests the "some work is deliberately not delegated" path.
- **`drafts/` stays untouched.** Deciding whether those two skills ship is its own interview.

## Tasks

### Task 1 — Teach anvil's interview to offer clickable options
- state: done
- blocked-by: none
- commit: d5b55ff
- risk: judgement-call
- change: In `plugins/anvil/commands/anvil.md`, phase 2, add a rule: when a round's questions
  are discrete choices, put them to the user with the `AskUserQuestion` tool so they can click
  rather than type, and keep the numbered-text format for open-ended questions or when more
  than four questions are on the frontier at once. Keep the existing design-tree and frontier
  rules unchanged.
- done-when: phase 2 states the rule, names `AskUserQuestion`, and says when the text format is
  still correct.
- verify: `grep -c AskUserQuestion plugins/anvil/commands/anvil.md` returns at least 1, and
  `claude plugin validate plugins/anvil | tail -1` still passes.

## Out of scope

- **Cut from this run at approval time**, still real gaps in the repo:
  - a repo-level `CLAUDE.md` orienting an agent that has just cloned this repo
  - an eval suite under `plugins/anvil/evals/`
  - bringing the README's "Before publishing" checklist up to date
- Deciding whether `drafts/thai-deliverable` and `drafts/viral-promo-clip` ship.
- Creating a GitHub remote or pushing anything.
- Installing this marketplace locally, or resolving the duplicate `/anvil` command.
- Disabling `mattpocock-skills` in the user's settings.

## Risks

- **This task edits the command currently executing.** The instructions already in context are
  unaffected, but a bad edit degrades every future run. Mitigation: not delegated, and the file
  is under version control with a clean baseline at `619276c`, so `git checkout` restores it.
- Recoverable with `git revert` of its own commit.

## Log

- 2026-08-26 — plan written on branch `test/anvil-run-1` off `619276c`.
- 2026-08-26 — scope cut from four tasks to one at approval; three tasks moved to Out of scope.
- 2026-08-26 — task 1 done in the main loop (not delegated, risk: judgement-call), commit `d5b55ff`. Verification: `grep -c AskUserQuestion` returned 1; `claude plugin validate plugins/anvil` passed.
