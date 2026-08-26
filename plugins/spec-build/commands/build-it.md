---
description: Execute a plan written by /spec-it — dispatch planner and executor agents per task, then review and report
argument-hint: <slug> (or omit to pick from ~/.claude/build-plans/)
---

Phase 2 of the two-command build workflow. `/spec-it` produced the plan; this command
carries it out. **By running this command I am authorising you to dispatch agents** —
do not ask me again before each one.

Plan to execute: $ARGUMENTS

## 1. Load the plan

- If a slug was given, read `~/.claude/build-plans/<slug>.md`.
- If not, list `~/.claude/build-plans/*.md` with their `status:` and titles, and ask me
  which one. Do not guess.
- If `status:` is not `ready`, say so and stop.

## 2. Decide whether to refine

Read the plan's Tasks section.

- **Tasks are already concrete** (each names files and a done-condition): skip to step 3.
- **Tasks are coarse or an approach is still open**: dispatch the `planner` agent
  (`subagent_type: "planner"`) with the plan file's full contents pasted into the prompt —
  it has no access to this conversation. Ask it to return a refined, ordered task list with
  explicit `blocked-by` edges. Merge the result back into the plan file before continuing.

## 3. Execute

Group tasks into waves by their `blocked-by` edges: every task whose blockers are done
belongs to the current wave.

For each wave, dispatch one `executor` agent per task
(`subagent_type: "executor"`), **all in a single message so they run concurrently**.

Each executor prompt must be self-contained — it sees nothing but the text you send:
- the Goal and Context sections of the plan, verbatim
- that one task, and its Verification line
- the absolute paths it may touch, and the instruction to touch nothing else
- the Risks entry if the task is listed there

Use `isolation: "worktree"` only if two tasks in the same wave write to the same file
and the directory is a git repo. Otherwise serialise those two tasks instead.

**Do not delegate these — do them yourself in this conversation:**
- anything the plan's Risks section flags as destructive or hard to undo
- binary, save-file, or checksummed-format edits (take the timestamped `.bak` first,
  and confirm the program that owns the file is not running — it will rewrite the file on exit)
- anything where the verification is "look at it and judge"

After each wave: read what the executors reported, run the Verification commands
yourself, and state the real result. If a task failed, stop the wave and tell me —
do not start the next wave on top of a broken one.

## 4. Review

When every wave is done, run the `/code-review` skill over the changes.

Apply fixes for findings you are confident in. For anything uncertain, list it and ask.
Re-run the plan's Verification commands after fixing.

## 5. Close out

- Update the plan file's `status:` to `done`, or to `blocked: <reason>` if it is not.
- Report in the language I am writing to you in, short: tasks done / total, verification results with real output,
  what was skipped and why, what is still open.
- If this work established a format, a layout, or a constraint that a future session
  would otherwise have to rediscover, offer to write it to memory. Do not write it unasked.
