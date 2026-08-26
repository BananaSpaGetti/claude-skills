# claude-skills

Small, composable plugins for [Claude Code](https://claude.com/claude-code). Each one is
independent — install only the ones you want.

> **Status: not published yet.** The plugins below are working locally but have not been
> tested through a marketplace install. See [Before publishing](#before-publishing).

## Install

```
/plugin marketplace add BananaSpaGetti/claude-skills
/plugin install spec-build
```

Plugins load at session start, so restart Claude Code after installing.

## Plugins

### `big` — one command for a large piece of work

```
/big <what you want built>     start
/big                           resume an in-progress plan
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
- **Resumable.** Run `/big` with no arguments after a session ends: it reads the per-task state
  out of the plan file and picks up at the first unstarted task. A dirty tree is expected after a
  mid-wave failure, so resume asks what to do rather than refusing to run.

Some work is deliberately *not* delegated: anything the plan marks `risk: destructive`,
`risk: binary-format`, or `risk: judgement-call` stays in the main conversation.

### `engineering-kit` — six disciplines the agent reaches for on its own

Model-invoked skills, so you never type them: `diagnosing-bugs`, `tdd`, `research`,
`domain-modeling`, `codebase-design`, `resolving-merge-conflicts`.

`big` uses them when they are present and works without them when they are not — it declares no
hard dependency on this plugin.

Derived from [Matt Pocock's skills](https://github.com/mattpocock/skills) under MIT. See
[NOTICE](./plugins/engineering-kit/NOTICE) for exactly what was taken and what was changed. If you
want them as their author ships them, with his updates, install `mattpocock-skills` instead —
do not install both.

### `spec-build` — plan it properly, then build it

Two commands, deliberately separate. Planning needs your answers, so it cannot run unattended;
building should not stop to ask.

| | |
|---|---|
| `/spec-it <what you want>` | Interviews you as a design tree — a whole round of numbered questions at a time, each with a recommended answer — until nothing is silently assumed. Writes a self-contained plan to `~/.claude/build-plans/<slug>.md`. |
| `/build-it <slug>` | Reads the plan, groups tasks into waves by their `blocked-by` edges, and dispatches one `executor` subagent per task concurrently. Reviews the result and reports what actually happened. |

The plan file is the seam between them: it survives a session restart, and it is written to
be understood by an agent with zero conversation context.

Running `/build-it` is itself your authorisation to dispatch agents — it will not ask again
per task. It deliberately keeps some work in the main conversation instead of delegating:
anything the plan flags as destructive, any binary or checksummed-format edit, and anything
whose verification is "look at it and judge".

Ships two agents: `planner` (plans, never edits) and `executor` (implements a finished spec,
never decides scope). Both declare a model in their frontmatter — change it to suit your setup.

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
.claude-plugin/marketplace.json   the marketplace manifest
plugins/<name>/                   one directory per plugin
  .claude-plugin/plugin.json
  commands/ | agents/ | skills/
drafts/                           not published yet — see below
```

## Before publishing

- [ ] Test `/plugin marketplace add` against this repo end to end
- [ ] Run `/big` on a real repo, start to finish, including a resume after killing the session
- [ ] Decide whether `spec-build` ships at all — `/big` supersedes it, and its `/spec-it` calls
      the `grilling` skill from `mattpocock-skills` without declaring that dependency
- [ ] Test `/spec-it` → `/build-it` on a real repo, not just a scratch directory
- [ ] `council.workflow.js` is syntax-checked only — run it once for real
- [ ] Decide whether `drafts/thai-deliverable` and `drafts/viral-promo-clip` ship, and
      genericise them if so (both are currently written for a Thai-language audience)
- [ ] Confirm the LICENSE choice

## License

MIT — see [LICENSE](./LICENSE).
