# claude-skills

Small, composable plugins for [Claude Code](https://claude.com/claude-code). Each one is
independent — install only the ones you want.

> **Status: v0.1.0, not published yet.** `claude plugin validate` passes on the marketplace
> manifest and on all four plugins, and `anvil` has been installed end to end from a
> local-directory marketplace — but this repo has no remote, so nothing is installable by
> anyone else. See [Before publishing](#before-publishing).

## Install

```
/plugin marketplace add BananaSpaGetti/claude-skills
/plugin install anvil
```

Plugins load at session start, so restart Claude Code after installing.

## Plugins

### `anvil` — one command for a large piece of work

```
/anvil <what you want built>   start
/anvil                         resume an in-progress plan
```

Seven phases in one conversation: preflight, orient, interview, plan, approve, execute, review.
It stops and waits in exactly two places — the interview rounds and the single plan approval.
Everywhere else it runs.

- **Interview as a design tree.** The frontier is every decision whose prerequisites are settled;
  it asks that whole frontier in one numbered round, each question with a recommended answer, then
  waits. Facts are never your job — those go to subagents.
- **The plan lives in the repo**, at `.plans/<slug>.md`, and gets committed. Each task carries its
  own `state:`, `blocked-by:`, `risk:` and `commit:` fields.
- **Parallel waves.** One `executor` subagent per task, all dispatched together. Executors are
  forbidden from running git commands — concurrent ones would race on `.git/index.lock` — so the
  main loop commits each task sequentially instead. You keep `git revert <sha>` per task.
- **Review loop, capped at 3 rounds.** It runs until the review comes back clean, then says
  plainly what is still unresolved rather than declaring victory at the cap.
- **Resumable.** Run `/anvil` with no arguments after a session ends: it reads the per-task state
  out of the plan file and picks up at the first unstarted task. A dirty tree is expected after a
  mid-wave failure, so resume asks what to do rather than refusing to run.

Some work is deliberately *not* delegated: anything the plan marks `risk: destructive`,
`risk: binary-format`, or `risk: judgement-call` stays in the main conversation.

### `engineering-kit` — six disciplines the agent reaches for on its own

Model-invoked skills, so you never type them: `diagnosing-bugs`, `tdd`, `research`,
`domain-modeling`, `codebase-design`, `resolving-merge-conflicts`.

`anvil` uses them when they are present and works without them when they are not — it declares no
hard dependency on this plugin.

Derived from [Matt Pocock's skills](https://github.com/mattpocock/skills) under MIT. See
[NOTICE](./plugins/engineering-kit/NOTICE) for exactly what was taken and what was changed. If you
want them as their author ships them, with his updates, install `mattpocock-skills` instead —
do not install both.


### `council` — five advisors who are supposed to disagree

For decisions that are expensive to reverse: architecture, schema, framework choice, migration
strategy, build-vs-buy. Five lenses argue, peer-review each other anonymously, and a debate
round is forced when the agreement looks like groupthink. The verdict preserves the minority
view rather than averaging it away.

Costs 11–13 subagents. The skill itself tells you when *not* to convene one.

### `game-save-re` — reverse-engineer a save file

An ordered method rather than a tool: look for prior art first, identify the container before
editing bytes, back up to a timestamped copy, re-sign checksums and re-write length prefixes,
then verify in-game. Engine-agnostic — Unity, Godot, Ren'Py, RPG Maker, custom binary.

Use it on your own single-player saves.

## Repo layout

```
CLAUDE.md                         orientation for an agent changing this repo
.claude-plugin/marketplace.json   the marketplace manifest
.plans/                           plan files written by `anvil`, one per run
plugins/<name>/                   one directory per plugin
  .claude-plugin/plugin.json
  commands/ | agents/ | skills/
  evals/                          `anvil` only, so far — see below
drafts/                           not published yet — see below
```

`plugins/anvil/evals/` holds one case for `claude plugin eval`. That runner is in early access
and prints `plugin eval is currently in early access` rather than running, so the suite has
never been executed — see [its README](./plugins/anvil/evals/README.md).

**Open question.** This repo's `anvil` command is installed as `/anvil:anvil` in a session that
also has a user-scope `/anvil` of its own; the two coexist and the user-scope one wins the bare
name. Whether a bare `/anvil` resolves to the plugin for someone with *no* user-scope command of
that name has not been tested, so the `/anvil:anvil` stutter is left as-is until it is.

## Before publishing

- [x] `claude plugin validate` passes on the marketplace and all four plugins
- [x] Test `/plugin marketplace add` against this repo end to end — `claude plugin marketplace
      add <local path>` and `claude plugin install anvil@claude-skills` both succeeded, and the
      plugin unpacked complete to `~/.claude/plugins/cache/claude-skills/anvil/0.1.0/`. Only the
      local-directory form is proven; there is no remote to add by name yet.
- [x] Run `/anvil` on a real repo, start to finish — the first run
      (`.plans/anvil-self-test.md`) went through all seven phases, but was cut to one main-loop
      task at approval, so it proved nothing about dispatch. The second run
      (`.plans/close-repo-gaps.md`) proved the rest separately: two `executor` subagents
      dispatched concurrently in wave 1, wave 2 held until both were `done`, a commit per task,
      and resume reconstructing per-task state from the plan file on disk in a later session.
- [ ] `council.workflow.js` is syntax-checked only — run it once for real
- [ ] Decide whether `drafts/thai-deliverable` and `drafts/viral-promo-clip` ship, and
      genericise them if so (both are currently written for a Thai-language audience)
- [ ] Confirm the LICENSE choice

## License

MIT — see [LICENSE](./LICENSE).
