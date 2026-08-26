# anvil eval suite

**This suite has never been run.** `claude plugin eval` and `claude plugin eval init` are both
gated behind early access — invoking either prints `plugin eval is currently in early access`
and does nothing further. There is no local way to generate a template or to check a
hand-authored case against the runner's real schema, so nothing below has been validated by the
tool that will eventually grade it.

Run once eval is available:

```
claude plugin eval anvil
```

## Layout

- `dirty-tree-refuses-to-proceed/prompt.md` — the one case in this suite: a repo with an
  uncommitted change, and the user invoking `/anvil` with a fresh request.
- `dirty-tree-refuses-to-proceed/graders/*.md` — one grader per criterion: that the agent showed
  the dirty `git status` output and stopped, and that it never ran a git command (or anything
  equivalent) that would move the user's uncommitted work.

Authored in the `prompt.md` + `graders/*.md` layout rather than `case.yaml`, because
`claude plugin eval --help` describes both but only `case.yaml` in enough detail to guess a
schema from — and with the runner gated, a guessed `case.yaml` could not be checked against it
either. The prose layout needs almost no schema guessed.

## What is unverified

- Whether `prompt.md`'s `Setup` section is how this runner actually provisions fixture state.
  `--help` does not document a fixture mechanism for the `prompt.md` layout; the section is
  written as a specification for whoever wires up the sandbox, not a config format this suite
  invents.
- Whether the graders' plain-prose format is what the runner expects, versus some frontmatter
  this suite does not use. `--help` confirms exactly one example grader key, `tool_used: Skill`;
  this suite does not invent others it cannot justify from that text, and falls back to prose
  everywhere else.
