# CLAUDE.md

Orientation for an agent working in this repo. If you have not read this file yet, read
it before editing anything under `.claude-plugin/` or `plugins/`.

## What this repo is

This is a Claude Code **plugin marketplace**, not an application. There is no build, no
runtime, nothing to deploy. The deliverable is the files themselves — plugin manifests,
commands, agents, and skills that Claude Code reads directly. `README.md` documents the
plugins for someone installing them; this file is for an agent changing the repo.

## Layout

```
CLAUDE.md                         this file
.claude-plugin/marketplace.json   the marketplace manifest — lists every plugin
plugins/<name>/                   one directory per plugin
  .claude-plugin/plugin.json      that plugin's own manifest
  commands/ | agents/ | skills/   the plugin's content
  output-styles/                  reply-register styles — `caveman` only, so far
  evals/                          `claude plugin eval` cases — `patimakorn` only, so far
```

Five plugins are listed in the marketplace manifest: `patimakorn`, `engineering-kit`,
`caveman`, `council`, `game-save-re`. `patimakorn` holds two commands, `anvil` and `anvil2`, so
they are addressed as `/patimakorn:anvil` and `/patimakorn:anvil2`; the plugin was itself called
`anvil` until 2026-08-30 and older commits use that name throughout. Each has an entry in
`.claude-plugin/marketplace.json` with `source: "./plugins/<name>"`.

**The repository is private as of 2026-09-03.** The remote is
`github.com/BananaSpaGetti/claude-skills` and `/plugin marketplace add BananaSpaGetti/claude-skills`
resolves for the owner, who is authenticated; no stranger can install anything here yet. Do not
write "published" or "a stranger installs them" anywhere in this repo until that changes and an
anonymous install has actually been tried — README's Known gaps tracks it.

`README.md` carries its own layout tree for a reader installing the plugins. When you add or
move a top-level directory, update both — they drifted once already.

Nothing outside `plugins/` ships anything. An `anvil` run writes its plan to
`.plans/<slug>.md` and commits it; **this repo** then deletes that file by hand once the
work has landed, because a cloner should not be handed the author's spent worklists and the
`plan(<slug>)` commits are the durable record. That is a housekeeping habit of this
repository, not a behaviour of the tool — `anvil` never deletes a plan file, and phase 7
must not be changed to make it do so without an explicit decision.

## Version consistency

Each plugin's `version` field in `plugins/<name>/.claude-plugin/plugin.json` must match
the `version` of that plugin's entry in `.claude-plugin/marketplace.json`. When you bump a
plugin's version, update both files in the same change.

Drift does **not** fail validation. `claude plugin validate .` reports it as a warning and
still exits 0 with `✔ Validation passed with warnings` — so "it passed" is not enough to go
on. At install time `plugin.json` wins and the marketplace entry's *version* is silently
ignored — the entry itself still does its job of making the plugin resolvable. That is exactly
the kind of mismatch that ships unnoticed. Treat any warning as a failure.

`claude plugin validate plugins/<name>` does not surface drift at all: it validates that
manifest in isolation and prints a clean pass. Only `claude plugin validate .` compares the two.

## `plugins/patimakorn/workflows/` is executable, so it has a test

`execute.workflow.js` is phase 5 of `/patimakorn:anvil2`: the script that dispatches one executor
subagent per task. It exists because the same instruction written as prose in `anvil.md` was
followed once in twenty-two chances. Treat it as code, not documentation.

Two runtime constraints are load-bearing and easy to break by accident. The workflow runtime gives
scripts **no filesystem and no Node API**, so the plan is parsed by the main loop and arrives via
`args` — do not add a file read. And `Date.now()`, `new Date()` and `Math.random()` **throw**,
because they would break resume; stamp timestamps after the workflow returns.

`execute.workflow.test.js` stubs the agent and asserts ordering, concurrency, stranded dependents,
cycle detection, unknown blockers and the risk-marker guard. It needs no network and costs nothing:

```
node plugins/patimakorn/workflows/execute.workflow.test.js
```

Run it after any edit to the script, alongside the two validate commands below. A change to the
scheduler that passes validation and fails this test is not done.

## Validate before every commit

Run both of these before committing anything under `.claude-plugin/` or `plugins/`, and
confirm each prints `✔ Validation passed` with **no** warning list above it:

```
claude plugin validate .
claude plugin validate plugins/<name>
```

The first checks the marketplace manifest and its consistency with each plugin; the
second checks the plugin in isolation. A change that passes one but not the other is not
done.

## `plugins/engineering-kit/` is vendored third-party code

Its nine skills are taken from Matt Pocock's `skills` repository under MIT, not authored
here. Provenance, what was taken, and what was changed are recorded in
`plugins/engineering-kit/NOTICE`. If you edit the body of any skill under
`plugins/engineering-kit/skills/`, update `NOTICE` in the same change so it stays an
accurate record of the delta from upstream — do not let it silently go stale relative to
the code.

## Bump the version on every published change

`claude plugin update` compares **version numbers, not file contents**. Editing a plugin's files
without raising its `version` leaves every installed copy stale, and the updater will report
`already at the latest version` while serving the old files. So: any change to a plugin's
contents raises that plugin's `version` in **both** `plugins/<name>/.claude-plugin/plugin.json`
and its entry in `.claude-plugin/marketplace.json`. The two must always agree, or
`claude plugin validate` fails.
