---
description: Run a large piece of work end to end — interview, plan, then execute through a script that dispatches one executor per task, commits each separately, and loops the review until clean. Delegation is enforced in code, not asked for in prose.
argument-hint: [what you want built] (or leave empty to resume an in-progress plan)
---

One command, eight phases, one conversation. It interviews you, writes a plan into the repo,
hands the plan to a script that runs every task on its own executor subagent, commits each task
separately, and loops the review until it comes back clean.

The script is the difference between this and `/patimakorn:anvil`. There, phase 5's dispatch was
an instruction; a four-day run obeyed it once in twenty-two chances and its context reached 556k
tokens doing the work inline instead. Here the dispatch is `plugins/patimakorn/workflows/execute.workflow.js`,
and there is no code path in which this conversation does a delegable task itself.

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

## Dispatch rules

These two rules govern every subagent this command sends. They are not optional and they are
not phase-local — the phases below reference them rather than restating them.

### Rule 1 — every dispatch names its model

The `Agent` tool's `model` field accepts `sonnet`, `opus`, `haiku`, or `fable`. **Omitting it
inherits the session's model**, which on an expensive session silently prices a retrieval agent
at the rate of the most capable model available. Inheriting is sometimes right; inheriting *by
accident* never is. So decide, every time, from this table:

| Dispatch | `subagent_type` | `model` | Why |
|---|---|---|---|
| Phase 1 orient — locate files, trace how a flow is wired, find callers | `Explore` | `sonnet` | Retrieval. The judgement is in reading the result, not producing it. |
| Phase 2 — read a file, a config, or the git history to settle one fact | `Explore` | `sonnet` | Retrieval. |
| Phase 2 — summarize sources already identified | `general-purpose` | `sonnet` | Summarization of text someone else chose. |
| Phase 2 — research where source quality is the question: contradictory figures, primary vs secondary, whether a standard still applies | `general-purpose` | *omit* | The plan is built on the answer. Weighing sources is the capability being paid for. |
| Phase 5 — execute one task | `patimakorn:executor` | *omit* | The agent's own frontmatter pins `model: sonnet`; passing `model` here would override it. |
| Phase 6 — review finders | whatever the `code-review` skill dispatches | *omit* | Cross-file, domain-specific defect hunting. |

**Do not "optimize" the *omit* rows down to a smaller model.** They were measured. In one
prior run the review finders returned fifteen confirmed findings per round — anisotropic
mm-per-pixel on rectangular matrices, a sampling window that dropped the centre slice, dataloader
workers sharing one random stream — for under 8% of the run's cost. In the same run, three
summarization agents that inherited the session model cost more than all eleven review finders
combined. The saving lives in the `sonnet` rows; the capability lives in the *omit* rows.

### Rule 2 — delegation is the default, doing it yourself is the exception

Reading and editing in this conversation costs twice: once for the turn, and again on every
later turn, because the result stays in context for the rest of the run. A subagent pays once
and returns a summary. That is why the phases below dispatch — the parallelism is a bonus, the
context ceiling is the point.

So: **whenever a phase says to dispatch, dispatch.** If you decide against a dispatch the rules
call for, say so in the conversation with the reason, in one line, before proceeding. Silently
absorbing the work is the failure this command exists to prevent.

In phase 5 this is not left to your judgement at all: the dispatch is done by a **script**, and
the script is the only thing that can perform a task. See below.

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

4. **Is there an interactive user at all?** `echo $CLAUDE_CODE_ENTRYPOINT`. If it is `sdk-cli`,
   `sdk-ts`, `sdk-py`, `mcp`, `claude-code-github-action`, or `local-agent`, nobody is there to
   answer phase 2. Say so and stop rather than interviewing an empty chair. Any other value, or
   an empty one, means a person is present — note nothing and move on.

   Do not use this value to decide *how* phase 2 asks. That was tried twice and was wrong both
   times; see phase 2.

## Phase 1 — Orient

Read before you ask anything. Facts are your job; the user's time is for decisions.

- `CLAUDE.md` / `AGENTS.md` at the repo root, and the global `~/.claude/CLAUDE.md`
- the memory index for this project, and any memory file whose description matches this work
- `git log --oneline -10`, for the conventions already in play
- any file the user named by path in the request

Read those yourself — they are small, bounded, and you need them in context to run the
interview. **Which files the work touches is not on that list**: that is a question, and
questions are dispatched.

**Everything else in this phase is dispatched.** Any question of the form "where is X handled",
"what calls Y", "how does this repo do Z", "which files does this work touch" goes to an
`Explore` agent at `model: "sonnet"` (Rule 1), and several such questions go out in **one message
so they run concurrently**. Do not read the repo yourself to answer them: what you read here you
carry for the remaining seven phases, and this is the phase where that habit starts.

The floor is one dispatch. A repo where you genuinely need no exploration is a repo you have
already mapped in this conversation — say so, and move on.

## Phase 2 — Interview

Map the work as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already
settled — the questions answerable *now*, without guessing at answers you have not heard yet.

Ask the whole frontier in one round, each question carrying your recommended answer.

**Ask in the lettered text format below. That is the default, for everyone, always.**

`AskUserQuestion` renders a list of options, but whether that list is *clickable* is a property
of the user's setup, not of the client — the same person can find it unclickable in the terminal,
in the VS Code extension, and on mobile. When it is not clickable it is strictly worse than text:
the user reads the options, then types the answer anyway, having been shown a widget that implied
they would not have to.

Two attempts were made to detect this from `CLAUDE_CODE_ENTRYPOINT` — first an allowlist, then a
denylist. Both were wrong, because the client is not the variable. **Do not try a third time.**

Use `AskUserQuestion` only when the user has said, in this conversation, that the picker works
for them — then use it for every round that fits four-by-four (at most four questions, at most
four options each, each option statable in a line), and fall back to text for the rounds that do
not fit. Never switch to it on your own reasoning about their setup.

The text format is not a downgrade. Both carry the same questions and the same recommendations;
only the input method differs, and a lettered round is accepted in two characters.

Letter every option so a whole round can be answered in one short line — `1b 2a 3 ok` — rather
than in prose. Mark the recommendation, and put it first:

```
Q1 — <short title>
<one or two lines of question, and why it is being asked now>
  a) <recommended option>   <- recommended
  b) <the real alternative>
  c) <the other real alternative>

Q2 — <short title>
<question>
  a) <recommended option>   <- recommended
  b) <alternative>

Reply with the letters, e.g. `1a 2b`. Say "ok" or "all recommended" to take every
recommendation. Anything you want to say in prose instead is fine — the letters are a
shortcut, not a form.
```

That closing line goes in every text round. Without it the user does not know that accepting the
whole round costs two characters, which is the only advantage the buttons had.

Either way the round ends with the user's answers in hand and nothing else attempted — the
tool returns them directly, the text format waits for the user's next message. **Never carry on
past an unanswered question.** Each round of answers reshapes the tree: settled decisions push the
frontier outward. Recompute it and ask the next round. A question whose answer depends on another
question still open in this round belongs to a *later* round, not this one.

Rules:

- **Facts are never the user's job.** When a frontier question needs a fact from the filesystem,
  the web, or the git history, dispatch a subagent to find it — at the model Rule 1's table gives
  that kind of question, which is `sonnet` for a lookup and inherited for research whose answer
  turns on source quality. If the fact needs primary sources rather than a quick look — an API
  contract, a library's actual behaviour, a spec — use the `research` skill, which runs in the
  background. Never block the round on an exploration — a running one is just an unsettled
  prerequisite, so only the questions downstream of it wait.
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

**Sizing guard.** Count the tasks before showing the plan:

- more than 20 tasks — say so and offer to split into two plans
- **every task blocked by the one before it** — say so. A plan that is a single chain gets no
  concurrency from the script at all, and is usually a plan whose `blocked-by` fields were filled
  in by habit rather than by real dependencies. Ask which of them are genuinely ordered.

Do not narrow a wide plan for fear of fan-out. The workflow runtime caps how many executors run
at once and queues the rest, so breadth costs wall-clock, not correctness.

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

- the task list, each task with what it is blocked by — not a wave number; the script schedules
  from `blocked-by` directly, so a task starts when its own blockers land rather than when a wave
  clears
- which tasks are marked `risk:` and will therefore **not** go to the script, and will run in this
  conversation instead
- anything you had to assume because the interview did not settle it
- **any file or directory this run would create outside `.plans/`** — an ADR directory the repo
  does not yet have, or a glossary that does not yet exist. Name the path. Creating a new
  top-level convention in someone's repository is theirs to approve, not yours to assume.
- the plan file path

Then **stop and wait for a go.** On go, set `status: approved`, commit the plan
(`plan(<slug>): add plan`), and continue.

## Phase 5 — Execute

**The dispatch in this phase is done by a script, not by you.** That is the whole point of
`anvil2`: in `anvil` the same instruction was prose, and a four-day run followed it once in
twenty-two chances. A rule you can forget is not a rule. The only code path that performs a task
is the script's `agent()` call, so there is no branch in which this conversation does the work
instead.

### 1. Split the tasks

Take every task whose `blocked-by` tasks are all `done`, plus everything downstream of them —
the script schedules the ordering itself, so you do not need to compute waves.

Sort them into two piles:

**Stays in this conversation.** This list is exhaustive:
- any task with `risk: destructive`, `risk: binary-format`, or `risk: judgement-call`
- anything editing a checksummed, length-prefixed, or binary format (take the timestamped `.bak`
  first, and confirm the program that owns the file is not running)
- anything whose `verify:` is "look at it and judge"

Nothing else qualifies. A task is not exempt for being small, for being quick to do inline, for
being the only one left, or for having a `verify:` that needs a credential or a long-running
external job — in that last case the executor still makes the change and **you** run the
`verify:` in step 3, which is where verification already lives.

**Goes to the script.** Everything else. The script rejects the whole run if a task carrying a
risk marker reaches it, so mis-sorting fails loudly rather than quietly running a destructive
task on a subagent.

Set every task being started to `state: doing` in the plan file.

### 2. Run the script

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/execute.workflow.js",
  args: {
    slug:    "<the plan's slug>",
    goal:    "<the plan's Goal section, verbatim>",
    context: "<the plan's Context section, verbatim>",
    tasks: [
      {
        id: 1,
        title: "...",
        change: "...",
        doneWhen: "...",
        verify: "...",
        paths: ["src/foo.py"],       // omit if the task does not name specific paths
        blockedBy: [],               // ids, as in the plan's blocked-by
        risk: "none",
        needsFailingTest: false      // true when verify: names a test that does not exist yet
      }
    ]
  }
})
```

Running this command **is** the opt-in to multi-agent orchestration — invoke the workflow without
asking again. It runs in the background and a task notification arrives when it finishes; do not
poll for it, and do not invent its result while it is pending.

The script cannot read the filesystem, so everything it needs is in `args` — this is why you pass
`goal` and `context` verbatim rather than a path to the plan. Anything the interview settled that
does not reach `args` is invisible to every executor.

If `${CLAUDE_PLUGIN_ROOT}` does not resolve, pass the same script inline via the `script`
parameter instead and say that you did; the path form is the one that has not been proven.

**What the script does, so you can read its result:** it validates the graph (a cycle, an unknown
`blocked-by`, or a risk marker aborts the run before any agent starts), then starts each task the
moment *its own* blockers land rather than waiting for a whole wave. Each executor runs on
`patimakorn:executor`, which pins `model: sonnet` in its own frontmatter — the script passes no
`model`, so that pin is what takes effect. Every result is schema-validated: `filesTouched`,
`verifyCommand`, `verifyStdout`, `passed`, `summary`, and an optional `contradiction`. A task
whose blocker failed is never dispatched and comes back under `skipped`.

### 3. Verify every task yourself

The script returns the executors' *claims*, in a validated shape. A shape is not a check.

Run each task's `verify:` in this conversation and report the real output. An executor reporting
`passed: true` is not evidence, and the script says so in its own return value.

### 4. Commit sequentially, one task at a time, in task order

```
git add <that task's files>
git commit -m "plan(<slug>) task <N>: <title>"
```

Committing stays here because concurrent agents would race on `.git/index.lock`, which is also
why the executors are forbidden every git write command.

Write the resulting sha into that task's `commit:` field and set `state: done`. Append a Log line.
Commit the plan-file update itself as `plan(<slug>): task <N> done`.

### 5. If a task failed

Set `state: failed`. A task the script reports under `contradiction` is not a bug — it is an
executor refusing to paper over a plan that disagrees with the repository, and the plan is what
needs fixing.

If the cause is not obvious from the returned `verifyStdout` and your own verify, use the
`diagnosing-bugs` skill before guessing. Then put three options to the user:

- fix this task and retry it
- go back and amend the plan, re-planning the remaining tasks
- abandon — `git revert` the task commits made so far, in reverse order

To retry after a fix, re-invoke the workflow with `resumeFromRunId` set to the run id from the
first result: unchanged tasks replay from cache and only the edited one runs live.

Do not start work that depends on a failed task.

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
  - tasks done / total, and **how many went to the script versus stayed in this conversation** —
    the script's return value carries `dispatched`, so this is a count, not an impression. Name
    each main-loop task and which line of phase 5 step 1 exempted it. A run where that list is
    long did not follow this command, whatever else it achieved, and the report is where that
    becomes visible instead of only showing up on the bill.
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
   - **Clean** — report where the plan stands (tasks done / total, which tasks are unblocked now)
     and continue at phase 5 with every remaining `todo` task whose blockers are all `done`.
   - **Dirty because a merge or rebase is in progress** (`git status` says so) — use the
     `resolving-merge-conflicts` skill to finish it before touching the plan at all.
   - **Dirty** — expected after a failed task. Show `git status --short`, name the task
     sitting at `doing` or `failed`, and ask before touching anything:
     - keep the working-tree changes and continue from there
     - `git checkout -- .` back to the last task commit and retry that task
     - abandon the plan and revert its commits in reverse order

3. Never restart a task whose `state:` is `done`. The `commit:` field is the proof it landed.
