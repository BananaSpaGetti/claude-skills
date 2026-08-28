# claude-skills

Small, composable plugins for [Claude Code](https://claude.com/claude-code). Each one is
independent — install only the ones you want.

## Install

```
/plugin marketplace add BananaSpaGetti/claude-skills
/plugin install anvil@claude-skills
```

Both commands were run for real on 2026-08-28: the marketplace cloned and validated, and `anvil`
unpacked complete into `~/.claude/plugins/cache/claude-skills/anvil/`. Plugins load at session
start, so restart Claude Code afterwards.

A plugin command is addressed as `<plugin>:<command>`, so this one is `/anvil:anvil`. A bare
`/anvil` does not resolve to it.

## Plugins

### `anvil` — one command for a large piece of work

```
/anvil <what you want built>   start
/anvil                         resume an in-progress plan
```

Eight phases in one conversation: preflight, orient, interview, plan, approve, execute, review,
close out. Two of them are where it stops and waits *by design* — the interview rounds and the
single plan approval. It will also stop and ask when something needs a decision it should not
make for you: whether to branch off `main`, what to do about a failed task, how to pick up a
plan whose tree is dirty. Everywhere else it runs without checking in.

- **Interview as a design tree.** The frontier is every decision whose prerequisites are settled;
  it asks that whole frontier in one numbered round, each question with a recommended answer, then
  waits. Facts are never your job — those go to subagents.
- **The plan lives in the repo**, at `.plans/<slug>.md`, and gets committed. Each task carries its
  own `state:`, `blocked-by:`, `risk:` and `commit:` fields.
- **Parallel waves.** One `executor` subagent per task, all dispatched together. Executors are
  forbidden from running git commands — concurrent ones would race on `.git/index.lock` — so the
  main loop commits each task sequentially instead. You keep `git revert <sha>` per task.
- **Review loop, capped at 3 fixing rounds**, then one closing pass that reports rather than
  fixes — otherwise the last round's own fixes ship unreviewed. The loop stops early once a
  review comes back clean, and at the cap it says plainly what is still unresolved rather than
  declaring victory.
- **Resumable.** Run `/anvil` with no arguments after a session ends: it reads the per-task state
  out of the plan file and picks up at the first unstarted task. A dirty tree is expected after a
  mid-wave failure, so resume asks what to do rather than refusing to run.

Some work is deliberately *not* delegated: anything the plan marks `risk: destructive`,
`risk: binary-format`, or `risk: judgement-call` stays in the main conversation.

### `engineering-kit` — nine disciplines the agent reaches for on its own

Model-invoked skills, so you never type them: `diagnosing-bugs`, `tdd`, `prototype`, `research`,
`domain-modeling`, `codebase-design`, `resolving-merge-conflicts`, `wizard`, `writing-for-agents`.

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
plugins/<name>/                   one directory per plugin
  .claude-plugin/plugin.json
  commands/ | agents/ | skills/
  evals/                          `anvil` only, so far — see below
```

Everything in the repo is either a published plugin or documentation about one. An `anvil` run
writes `.plans/<slug>.md` and commits it, but a finished plan is deleted once its work has
landed — clone this and you get the plugins, not the author's spent worklists.

`plugins/anvil/evals/` holds one case for `claude plugin eval`. That runner is in early access
and prints `plugin eval is currently in early access` rather than running, so the suite has
never been executed — see [its README](./plugins/anvil/evals/README.md).

**Command name, decided 2026-08-28.** A bare `/anvil` does not resolve to the plugin — tested in
a fresh session with no user-scope command of that name; only `/anvil:anvil` appears. The stutter
is kept: every single-command plugin has it, and renaming would buy typography only. The name
worth watching is the *plugin* half — `mulkatz/anvil` is a live Claude Code plugin that does
adversarial structured debate, which is what this repo's `council` does. `name@marketplace`
disambiguates installs. Revisit if an install is ever reported misrouted.

## Known gaps

The single home for what is and is not verified. Nothing else in this file makes status claims.

- [x] `claude plugin validate` passes on the marketplace and all four plugins
- [x] Installable from GitHub by name — `/plugin marketplace add BananaSpaGetti/claude-skills`
      then `/plugin install anvil@claude-skills`, both run for real on 2026-08-28
- [x] `anvil` run on a real repo, start to finish, twice — on this one. Both runs are in the
      history under `plan(<slug>)` commits; their plan files were deleted at close-out. The
      first (`anvil-self-test`, `b218a09..2950089`) went through all eight phases but was cut to
      one main-loop task at approval, so it proved nothing about dispatch. The second
      (`close-repo-gaps`, `0de4b42..b829102`) proved the rest: two `executor` subagents
      dispatched concurrently in wave 1, wave 2 held until both were `done`, a commit per task,
      and a later session resuming from per-task state on disk.
- [x] LICENSE confirmed — MIT, and each `plugin.json` now declares it
- [ ] `anvil` has only ever run on this repository. How its dispatch behaves in someone else's
      tree is untested.
- [ ] `council.workflow.js` has been run once, from the author's user-scope copy. The published
      copy resolves its script through `${CLAUDE_PLUGIN_ROOT}` and that path has not been exercised.
- [ ] The eval suite has never been executed — `claude plugin eval` is in early access and prints
      a notice instead of running.

## License

MIT — see [LICENSE](./LICENSE).
