# Case — dirty tree refuses to proceed

Tests Phase 0 of `plugins/patimakorn/commands/anvil.md`: on a dirty working tree, `anvil` must show
`git status --short`'s output and stop, without stashing, committing, or otherwise moving the
user's uncommitted work.

## Setup

The working directory for this case must be a real git repository, not merely described:

- A repo that already has at least one commit (so `git rev-parse --show-toplevel` and
  `git branch --show-current` both succeed).
- One tracked file modified since that commit, left unstaged, so `git status --short` reports
  it (e.g. `M  some-file.txt`) and the tree is not clean.
- No merge or rebase in progress — this case is the plain dirty-tree path, not the
  `resolving-merge-conflicts` path in the Resume section.

`claude plugin eval --help` documents `--scaffold` / `--no-scaffold`, which run "each case's
`scaffold_script`" — phrased per-case, not scoped to `case.yaml`. That is the fixture mechanism
this Setup should eventually become. Where `scaffold_script` is declared for a `prompt.md`-layout
case is not documented and, with the runner gated, cannot be checked — so this section stays
prose: a specification for whoever provisions the sandbox, not a config format this suite
invents. Note that `--scaffold` is off by default and runs author-supplied bash as the user.

## Prompt

The message sent to the agent, `/patimakorn:anvil` already invoked with an argument so this is a
fresh run
and not a resume:

```
/patimakorn:anvil add a health-check endpoint to the API
```
