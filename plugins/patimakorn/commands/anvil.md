---
description: Run a large piece of work end to end — interview, plan, execute in parallel waves with a commit per task, then review in a loop until clean
argument-hint: [what you want built] (or leave empty to resume an in-progress plan)
---

One command, eight phases, one conversation. It interviews you, writes a plan into the repo,
executes it through subagents wave by wave, commits each task separately, and loops the review
until it comes back clean.

**Running this command is your authorisation to dispatch agents.** Do not ask again before each
one. Two places still stop and wait for the user: the interview rounds (phase 2) and the single
plan approval (phase 4). Nowhere else.

Requested work: $ARGUMENTS

### Optional skills

If these skills are available in the session, use them at the points marked below. **None of
them is required** — this command is self-contained, and if a skill is not installed, do the
same work inline and say nothing about it. They ship together in the `engineering-kit` plugin.

| Skill | Used at |
|---|---|
| `research` | Phase 2, when a frontier question needs facts from primary sources |
| `codebase-design` | Phase 3, when the plan has to decide where a seam or module boundary goes |
| `domain-modeling` | Phase 3, when the work turns on terms the repo has not pinned down |
| `tdd` | Phase 5, for any task whose `verify:` is a test that does not exist yet |
| `diagnosing-bugs` | Phase 5, when a task fails and the cause is not obvious |
| `resolving-merge-conflicts` | Resume, when the dirty tree turns out to be a conflicted merge |

---

## Phase 0 — Preflight

**If the requested work above is empty, this is a resume.** Jump to the Resume section at the
bottom of this file.

Otherwise check, in order, and stop on the first failure:

1. **Is this a git repo?** `git rev-parse --show-toplevel`. If not, say so and offer `git init`.
   Do not run it without an answer — creating a `.git` in the wrong directory is hard to notice
   later.
2. **Is the working tree clean?** `git status --short`. If not, show the output and stop. Do not
   stash, do not commit, do not work around it — the per-task commits below depend on a clean
   baseline, and the user may have work in progress you know nothing about.
3. **Which branch?** `git branch --show-current`. If it is the repo's default branch (`main` or
   `master`), say so and offer to branch before any edit is made.

## Phase 1 — Orient

Read before you ask anything. Facts are your job; the user's time is for decisions.

- `CLAUDE.md` / `AGENTS.md` at the repo root, and the global `~/.claude/CLAUDE.md`
- the memory index for this project, and any memory file whose description matches this work
- the files the work actually touches
- `git log --oneline -10`, for the conventions already in play

Dispatch subagents for anything broad ("where is X handled", "what calls Y"). Do not read the
whole repo yourself.

## Phase 2 — Interview

Map the work as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already
settled — the questions answerable *now*, without guessing at answers you have not heard yet.

Ask the whole frontier in one round, each question carrying your recommended answer.

**When the round's questions are discrete choices, put them to the user with the
`AskUserQuestion` tool** so they can click an option instead of typing one. Lead each question
with the recommended option and mark it, so accepting the whole round costs one click per
question.

Fall back to the numbered text format below when the tool does not fit: a question that wants
prose rather than a choice, a round wider than four questions (ask the four that unblock the
most and hold the rest for the next round), a question with more than four real options, or a
choice whose options cannot be stated without a paragraph each.

```
Q1 — <question title>: <question body, including any options>

  -> <your recommended answer>

Q2 — <question title>: ...

  -> <your recommended answer>
```

Either way the round ends with the user's answers in hand and nothing else attempted — the
tool returns them directly, the text format waits for the user's next message. **Never carry on
past an unanswered question.** Each round of answers reshapes the tree: settled decisions push the
frontier outward. Recompute it and ask the next round. A question whose answer depends on another
question still open in this round belongs to a *later* round, not this one.

Rules:

- **Facts are never the user's job.** When a frontier question needs a fact from the filesystem,
  the web, or the git history, dispatch a subagent to find it. If the fact needs primary sources
  rather than a quick look — an API contract, a library's actual behaviour, a spec — use the
  `research` skill, which runs in the background. Never block the round on an exploration — a
  running one is just an unsettled prerequisite, so only the questions downstream of it wait.
- **Decisions are always the user's.** Put each one to them and wait.
- **Challenge the decisions that arrived already made.** The request carries decisions the user
  never put up for discussion. When the repo, the established facts, or a constraint show one of
  them has a failure mode, put that failure mode into the round as its own question — a decision
  that was never questioned is not the same as a decision that was settled.
- **Keep challenging while the evidence keeps coming.** A decision the user held once is not
  immune: if a later round, a subagent's finding, or a fact you did not have then exposes a
  different failure mode, raise it again. What you may not do is repeat an objection the user has
  already answered — a re-challenge must carry evidence the user has not yet seen, or it is
  nagging rather than grilling. The interview ends when the frontier is empty and nothing new is
  arriving, not when a question count is reached; the user ends it earlier by approving in
  phase 4. Record every decision they hold, with their reason, in the plan's Decisions so no
  executor re-litigates it.
- The interview is done when the frontier is empty: every branch visited, nothing silently
  assumed.

## Phase 3 — Write the plan

Pick a short kebab-case slug. Write to **`.plans/<slug>.md` inside the repo** — it gets committed,
so it travels with the branch and a cloud session sees the same plan.

Two skills earn their keep here, if they are installed: `codebase-design` when the plan has to
decide where a seam or a module boundary goes, and `domain-modeling` when the work turns on terms
this repo has never pinned down. Both are references to consult while writing the plan, not
sessions to run.

The executors that read this file have **zero context from this conversation**. Anything settled
in the interview that is not in the file is lost. Write it self-contained, in English:

```markdown
---
slug: <slug>
created: <YYYY-MM-DD>
status: planning        # planning | approved | executing | reviewing | done | blocked
branch: <branch name>
---

# <Title>

## Goal
What is being built, from the user's perspective. One paragraph.

## Context
Repo-relative paths to every file that matters, one line each on what it is and why it matters
here, plus the format/framework/engine facts established during the interview.

## Decisions
Every decision settled in the interview, flat list. Include options considered and rejected, with
the reason — this is what stops an executor re-litigating them.

## Tasks

### Task 1 — <title>
- state: todo          # todo | doing | done | failed
- blocked-by: none     # or: 2, 5
- commit:              # filled in by the main loop after the task lands
- risk: none           # or: destructive | binary-format | judgement-call
- change: what to change, in which file
- done-when: what "done" looks like
- verify: the exact command to run, or the exact manual check

### Task 2 — <title>
...

## Out of scope
What this plan deliberately does not do.

## Risks
Anything that could destroy data or is hard to undo, with the backup step for each.

## Log
Appended as work happens: date, task, what happened.
```

**Sizing guard.** Count the tasks and the widest wave before showing the plan:

- more than 20 tasks — say so and offer to split into two plans
- a wave wider than 4 — say so and offer to serialise part of it

### Decisions that outlive the plan

The plan file is a worklist. Once its tasks have landed it is spent, and a repo that keeps
every spent worklist forever is one nobody reads. So a decision recorded **only** in the plan's
`## Decisions` is a decision with an expiry date on it.

Some of what the interview settled is not like that. A decision about how the system is shaped —
a boundary, a format, a protocol, a convention, an option rejected for a reason that will still
be true in a year — is worth reading long after this plan is gone, by someone deciding whether
to undo it. Write those down separately:

- **Where.** Use the convention the repo already has: `docs/decisions/`, `docs/adr/`,
  `doc/adr/`, `adr/` — check for all of them before concluding there is none. Only when the repo
  has no such directory does `docs/decisions/` become the proposal, and then it is a **new
  top-level artifact in someone else's repository**, so it goes to the user at phase 4 rather
  than being created quietly.
- **What.** One file per decision, `NNNN-<kebab-slug>.md`, numbered after the highest that
  already exists. State the context that forced a choice, the choice, the options rejected and
  why, and the consequences accepted. Not what was built — *why* it is shaped this way.
- **How many.** Most plans produce zero or one. A plan that produces an ADR per task is
  recording tasks, not decisions.

Do the same for **vocabulary**. When the interview had to pin down what a term means in this
repo — because it was ambiguous, or the codebase used it two ways — that definition belongs in
`docs/glossary.md`, or whatever glossary the repo already keeps. **Append to it; never rewrite
it.** Terms you merely used correctly do not need an entry; only ones the interview had to settle.

Both files are written in this phase, alongside the plan, and are committed with it. They are
not deleted when the plan is.

## Phase 4 — Approve

Show the user, short:

- the task list, with each task's wave number
- which tasks are marked `risk:` and will therefore **not** be delegated
- anything you had to assume because the interview did not settle it
- **any file or directory this run would create outside `.plans/`** — an ADR directory the repo
  does not yet have, or a glossary that does not yet exist. Name the path. Creating a new
  top-level convention in someone's repository is theirs to approve, not yours to assume.
- the plan file path

Then **stop and wait for a go.** On go, set `status: approved`, commit the plan
(`plan(<slug>): add plan`), and continue.

## Phase 5 — Execute

Group tasks into **waves**: every task whose `blocked-by` tasks are all `done` belongs to the
current wave.

For each wave:

1. Set every task in the wave to `state: doing` in the plan file.

2. **Do these yourself, in this conversation — never delegate:**
   - any task with `risk: destructive`, `risk: binary-format`, or `risk: judgement-call`
   - anything editing a checksummed, length-prefixed, or binary format (take the timestamped
     `.bak` first, and confirm the program that owns the file is not running)
   - anything whose `verify:` is "look at it and judge"

3. Dispatch the rest as one `executor` subagent per task
   (`subagent_type: "patimakorn:executor"` — the namespaced form, because a bare
   `executor` is shadowed by any agent of that name the user has of their own), **all in
   a single message so they run concurrently.**

   Each executor prompt is self-contained — it sees nothing but the text you send:
   - the plan's **Goal** and **Context** sections, verbatim
   - that one task: `change`, `done-when`, `verify`
   - the paths it may touch, and the instruction to touch nothing else
   - if the task's `verify:` names a test that does not exist yet, tell the executor to use the
     `tdd` skill and write the failing test first
   - **"Do not run `git commit`, `git add`, or any other git write command."**
     Concurrent executors would race on `.git/index.lock`. Committing is the main loop's job.

4. When the wave returns, **run each task's `verify:` yourself** and report the real output. An
   executor claiming success is not evidence.

5. **Commit sequentially, one task at a time**, in task order:

   ```
   git add <that task's files>
   git commit -m "plan(<slug>) task <N>: <title>"
   ```

   Write the resulting sha into that task's `commit:` field and set `state: done`. Append a Log
   line. Commit the plan-file update itself as `plan(<slug>): task <N> done`.

6. **If a task failed**, set `state: failed` and stop the wave. If the cause is not obvious from
   the executor's report and the `verify:` output, use the `diagnosing-bugs` skill before
   guessing — it is a loop for exactly this. Then put three options to the user:
   - fix this task and retry it
   - go back and amend the plan, re-planning the remaining tasks
   - abandon — `git revert` the task commits made so far, in reverse order

   Do not start the next wave on top of a failed one.

## Phase 6 — Review loop

Set `status: reviewing`. Then loop, at most **3 fixing rounds**:

1. Run the `code-review` skill over the range `<first task commit>..HEAD`.
2. Fix every finding you are confident in. Commit as `plan(<slug>): review fixes round <N>`.
3. Re-run the plan's `verify:` commands.
4. If the review came back with nothing, stop the loop.

Then run **one closing pass that fixes nothing**, over the last fixing round's own diff. Each
round's fixes are themselves unreviewed code, and the last round's never get a turn — without
this pass the loop ships exactly the changes nobody checked. If the closing pass finds something,
**report it, do not fix it**: a fix here would need its own review, and the cap exists to stop
that regress. Note it as a follow-up instead.

After that, stop regardless. **State plainly what is still unresolved** — a capped loop that
reports "clean" when it is not is worse than no loop at all. List each surviving finding and why
it was not fixed.

## Phase 7 — Close out

- Set `status: done`, or `status: blocked` with the reason. Commit the plan file.
- Report, short, in the language the user is writing to you in:
  - tasks done / total, and which were done in the main loop rather than delegated
  - verification results, with the real command output
  - review rounds run, and anything still open
  - what was skipped, and why
- If this work established a durable fact — a file format, a layout, a constraint a future session
  would otherwise rediscover — offer to write it to memory. Do not write it unasked.

---

## Resume

Reached when this command is run with no arguments.

1. List `.plans/*.md` and read the `status:` of each.
   - **No plan files, or none in progress** — say so, list what is there, and ask what to build.
     Do not silently do nothing.
   - **Exactly one in progress** (`approved`, `executing`, `reviewing`) — use it.
   - **Several** — show them and ask which.

2. Check the working tree:
   - **Clean** — report where the plan stands (tasks done / total, which wave is next) and continue
     at the first `todo` task whose blockers are all `done`.
   - **Dirty because a merge or rebase is in progress** (`git status` says so) — use the
     `resolving-merge-conflicts` skill to finish it before touching the plan at all.
   - **Dirty** — expected after a mid-wave failure. Show `git status --short`, name the task
     sitting at `doing` or `failed`, and ask before touching anything:
     - keep the working-tree changes and continue from there
     - `git checkout -- .` back to the last task commit and retry that task
     - abandon the plan and revert its commits in reverse order

3. Never restart a task whose `state:` is `done`. The `commit:` field is the proof it landed.
