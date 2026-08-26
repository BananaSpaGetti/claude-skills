---
description: Grill me about a piece of work until the design is settled, then write a self-contained plan file that /build-it can execute
argument-hint: [short description of the work]
---

Phase 1 of a two-command build workflow. This command **plans only**. It never
edits project files and never dispatches an implementation agent — `/build-it`
does that, in a separate turn, after I have read the plan.

The work to plan: $ARGUMENTS

## 1. Orient

Read what already exists before asking me anything. Facts are your job, not mine:

- `CLAUDE.md` in this directory, and the global one
- the memory index `.claude/projects/<project-slug>/memory/MEMORY.md` and any memory
  file whose description matches this work
- the actual files the work touches — do not ask me what is in a file you can open

## 2. Grill

Invoke the `grilling` skill via the Skill tool and run it properly:

- map the work as a design tree
- ask the whole current frontier in one round, numbered, each with your recommended answer
- **stop and wait for my answers** after each round
- dispatch a sub-agent when a frontier question needs a fact from the filesystem or the
  web; do not block the rest of the round on it
- the session ends when the frontier is empty — every branch visited, nothing silently assumed

Ask me to confirm we have shared understanding before moving on.

## 3. Write the plan

Pick a short kebab-case slug for this work. Write the plan to:

`~/.claude/build-plans/<slug>.md`

The plan is read by an agent that has **zero context from this conversation** — it sees
only the file. Anything settled during the grill that is not in the file is lost. Write it
self-contained, in English, using this shape:

```markdown
---
slug: <slug>
created: <today's date, YYYY-MM-DD>
status: ready
---

# <Title>

## Goal
What is being built, from the user's perspective. One paragraph.

## Context
Absolute paths to every file that matters, and one line each on what it is and why it
matters here. Include the format/engine/framework facts established during the grill.

## Decisions
Every decision settled during the grill, as a flat list. Include the ones that were
considered and rejected, with the reason — this stops the executor re-litigating them.

## Tasks
A numbered list. Each task is independently completable and states:
- what to change, in which file
- what "done" looks like
- `blocked-by:` the task numbers it depends on, or `none`

## Verification
The exact command to run, or the exact manual check to perform, for each task.
If there is no automated check, say so explicitly — do not invent a test command.

## Out of scope
What this plan deliberately does not do.

## Risks
Anything that could destroy data or is hard to undo. Name the backup step for each.
```

## 4. Report

Tell me, short, in the language I am writing to you in:
- the plan file path
- the task count, and which tasks can run in parallel
- anything you had to assume because the grill did not settle it

Then stop. Do not start building. I will run `/build-it <slug>` when I am ready.
