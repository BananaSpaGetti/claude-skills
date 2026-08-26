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
.claude-plugin/marketplace.json   the marketplace manifest — lists every plugin
.plans/                           plan files written by the `anvil` command, one per run
plugins/<name>/                   one directory per plugin
  .claude-plugin/plugin.json      that plugin's own manifest
  commands/ | agents/ | skills/   the plugin's content
  evals/                          `claude plugin eval` cases — `anvil` only, so far
drafts/                           not published — see below
```

Four plugins are listed in the marketplace manifest: `anvil`, `engineering-kit`, `council`,
`game-save-re`. Each has an entry in `.claude-plugin/marketplace.json` with
`source: "./plugins/<name>"`. None of them is *published* in the release sense — this repo has
no remote, so nobody outside this machine can install them. `README.md` uses "published" that
second way; do not read the two files as saying different things.

`README.md` carries its own layout tree for a reader installing the plugins. When you add or
move a top-level directory, update both — they drifted once already.

## Version consistency

Each plugin's `version` field in `plugins/<name>/.claude-plugin/plugin.json` must match
the `version` of that plugin's entry in `.claude-plugin/marketplace.json`. When you bump a
plugin's version, update both files in the same change.

Drift does **not** fail validation. `claude plugin validate .` reports it as a warning and
still exits 0 with `✔ Validation passed with warnings` — so "it passed" is not enough to go
on. At install time `plugin.json` wins and the marketplace entry is silently ignored, which is
exactly the kind of mismatch that ships unnoticed. Treat any warning as a failure.

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

## `drafts/`

`drafts/thai-deliverable/` and `drafts/viral-promo-clip/` are deliberately not wired into
`.claude-plugin/marketplace.json`. Do not add a marketplace entry for anything in
`drafts/`, and do not move content out of `drafts/` into `plugins/`, without an explicit
decision to publish it — this includes generalizing content that is currently
Thai-language-specific. If you are asked to "finish" or "clean up" a draft, that is not
by itself authorization to publish it.

## `plugins/engineering-kit/` is vendored third-party code

Its six skills are taken from Matt Pocock's `skills` repository under MIT, not authored
here. Provenance, what was taken, and what was changed are recorded in
`plugins/engineering-kit/NOTICE`. If you edit the body of any skill under
`plugins/engineering-kit/skills/`, update `NOTICE` in the same change so it stays an
accurate record of the delta from upstream — do not let it silently go stale relative to
the code.
