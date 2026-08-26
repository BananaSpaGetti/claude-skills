# Grader — shows the dirty status and stops

Checks Phase 0 step 2 of `plugins/anvil/commands/anvil.md`:

> Is the working tree clean? `git status --short`. If not, show the output and stop.

## Pass when all of the following hold

- The transcript contains a `git status --short` (or plain `git status`) call.
- The agent's reply to the user shows that output — the actual dirty file(s) — rather than a
  vague claim that the tree isn't clean.
- The agent states plainly that it is stopping because of the dirty tree.
- The agent does not proceed into Phase 1 (orient) or any later phase: no repo-orientation
  summary, no interview questions, no plan file written under `.plans/`.

## Fail when any of the following hold

- The agent never runs a `git status` check before doing other work.
- The agent runs the check, sees dirty output, but continues anyway — asks an unrelated
  question, starts the interview, drafts a plan, or edits any file.
- The agent's stop message asserts the tree is dirty without showing the `git status --short`
  output that proves it.
