---
description: Run a large piece of work end to end — interview, plan, then execute through a script that dispatches one executor per task, commits each separately, and loops the review until clean. Delegation is enforced in code, not asked for in prose.
argument-hint: [what you want built] (or leave empty to resume an in-progress plan)
---

One command, eight phases, one conversation. It interviews you, writes a plan into the repo,
hands the plan to a script that runs every task on its own executor subagent, commits each task
separately, and loops the review until it comes back clean.

The script is what makes phase 5 real. Until 2026-09-16 this command had a sibling that wrote the
same dispatch as prose; a four-day run of it obeyed the instruction once in twenty-two chances and
its context reached 556k tokens doing the work inline instead. That sibling is gone and this is
the only version. The dispatch is `plugins/patimakorn/workflows/execute.workflow.js`, and there is
no code path in which this conversation does a delegable task itself.

**Running this command is your authorisation to dispatch agents.** Do not ask again before each
one. Three places still stop and wait for the user: the interview rounds (phase 2), the single
plan approval (phase 4), and the acceptance question before the plan is marked done (phase 7).
Nowhere else.

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
| Phase 1 orient — locate files, trace how a flow is wired, find callers | `Explore`, via `orient.workflow.js` | `sonnet`, set by the script | Retrieval. The judgement is in reading the result, not producing it. The script passes `model: sonnet` itself, so this row is what it does rather than what you must remember. |
| Phase 2 — read a file, a config, or the git history to settle one fact | `Explore` | `sonnet` | Retrieval. |
| Phase 2 — summarize sources already identified | `general-purpose` | `sonnet` | Summarization of text someone else chose. |
| Phase 2 — research outside the repository: a spec, a vendor's number, a market figure, whether a standard still applies | `general-purpose` ×2 stages, via `research.workflow.js` | searcher: *inherit*, `effort: low`; reader: `sonnet`, `effort: low` — both set by the script | Two stages so no page is ever re-read: a searcher per question that returns URLs and never holds a page body, then a reader per URL that holds exactly one page and ends. The searcher judges which sources are worth reading, on a tiny context, so it keeps the frontier model at low effort — Anthropic's cost reference measured a frontier model at `low` beating the mid tier on deep research at ~10% less per task, and research effort curves nearly flat. The reader extracts with a verbatim quote, a checkable output, so `sonnet` at low. Measured 2026-09-29 before this: five single-agent sweeps at inherited opus, 116–122 fetches each with zero repeats, 83% of the run's cost, 58% of it re-reading pages already fetched. Breadth was real; the cost was the re-reading. |
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

   This says whether to ask, not how. How is phase 2's business and does not depend on the client.

## Phase 1 — Orient

Read before you ask anything. Facts are your job; the user's time is for decisions.

- `CLAUDE.md` / `AGENTS.md` at the repo root, and the global `~/.claude/CLAUDE.md`
- the memory index for this project, and any memory file whose description matches this work
- `git log --oneline -10`, for the conventions already in play
- any file the user named by path in the request

Read those yourself — they are small, bounded, and you need them in context to run the
interview. **Which files the work touches is not on that list**: that is a question, and
questions are dispatched.

**Everything else in this phase goes through a script.** Any question of the form "where is X
handled", "what calls Y", "how does this repo do Z", "which files does this work touch" is
answered by `Explore` agents that the script dispatches — not by you reading the repository. What
you read here you carry for the remaining seven phases, and this is the phase where that habit
starts. The prose form of this rule said "the floor is one dispatch"; a 43-executor run dispatched
zero, so the floor is now the script refusing an empty question list.

### Run the orient script

Compose the questions — every fact the interview will need that lives in the repository. "Which
files does this work touch" is always one. Then read the script with the `Read` tool and pass its
contents to `Workflow` as `script`, the same way phase 5 does:

```
Workflow({
  script: "<the contents of ${CLAUDE_PLUGIN_ROOT}/workflows/orient.workflow.js, verbatim>",
  args: {
    request:   "<the requested work, verbatim>",
    questions: ["which files does this work touch, and what does each do",
                "where is X handled",
                "..."],
    hints:     ["path/the/user/named.py"]     // omit if the user named no paths
  }
})
```

**Do not pass the plugin's path as `scriptPath`** — `Workflow` refuses any path outside the
working directory, and reading the file first does not lift that (see phase 5 for the measured
error). The run result names a `scriptPath` inside the session directory; that one is reusable.

The script dispatches one `Explore` agent per question at `model: sonnet` (Rule 1's row for this
phase, now written into the script rather than left to you), all concurrent, each returning
`files` (path and why, every path verified to exist), `summary`, and `unknowns`. It throws on an
empty `questions` list rather than dispatching nothing.

**What the result is for.** `files` is the union of every file any answer named — the shape the
plan's `## Context` section wants, and the only thing that may go there (phase 3). `dispatched`
is the number phase 7 reports. `unknowns` are prerequisites for the interview: a question the
repository could not settle is one the user has to.

**`unsourced` is the list of questions whose answer cited no file and admitted no unknown, yet
has a summary.** That is the shape of a guess — a confident sentence with nothing behind it — and
the script counts it because the schema cannot forbid an empty array. **Treat each as unanswered.**
Do not paste its summary into the plan. Either re-ask it in a second orient run with the question
rephrased to demand a path or an explicit unknown, or put it to the user in phase 2 as a fact the
repository would not give up. Phase 7 reports the count beside `dispatched`; a run whose report
says `2 unsourced` and whose plan quotes both summaries as facts did not follow this rule.

Do not run the script on a repository you have already mapped in this conversation — say so, and
move on, and phase 7 reports `orient: skipped, already mapped` rather than a count. That is the
only exemption, and it is not "the repo looked small".

## Phase 2 — Interview

Map the work as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already
settled — the questions answerable *now*, without guessing at answers you have not heard yet.

Ask the whole frontier in one round, each question carrying your recommended answer.

**Put the round to the user with the `AskUserQuestion` tool. This is the default, and it is not a
judgement call.** An interview round is discrete choices each carrying a recommendation, which is
exactly what the tool renders. Lead each question with the recommended option, mark it, and put it
first, so accepting the whole round costs one click per question. Keep each `label` to a few words
and put the reasoning in that option's `description`.

**The tool's own description says to reserve it for decisions you cannot resolve from sensible
defaults, and to pick the obvious option and proceed instead. That rule does not apply to this
phase.** An interview round here is the blocked-on-the-user case by construction: the plan is
built on these answers, and every executor is held to them for the rest of the run with no way to
revisit them. The marked option is a recommendation for the user to accept or reject — never a
default you may take unilaterally. Recommending and proceeding is the exact failure this phase
exists to prevent, so a round that ends without the user answering it has not happened.

Options typed into your reply as `a) b) c)` look like a picker and are not one — the user has to
read them and then type an answer anyway. Hand-written options are the fallback, not an equivalent.

A frontier wider than the tool's limits is not a reason to drop to text. The tool takes at most
four questions per call and four options each: ask the four that unblock the most, and hold the
rest for the next round. When a question has more than four real options, offer the four
strongest — every question carries a free-text "Other", which is where a fifth option, or a
correction to the question itself, goes.

**Fall back to the lettered text format in Appendix A** only when the round genuinely does not fit
the tool: a question that wants prose rather than a choice, or a choice whose options each need a
paragraph to state. Mixed rounds do not split. The tool returns its answers inside the same turn,
but a prose question cannot be answered until the user sends another message — so "ask both" would end the
round with the prose question hanging, which is exactly what the rule below forbids. Put the whole
mixed round through Appendix A instead, or hold the prose question for the next round and send
only the choices through the tool.

A rejected tool call is not a fallback trigger either. It means the user wants to clarify
something: answer what they raise, then put the round through the tool again.

**Two things do end the tool's turn, so the interview cannot loop.** If `AskUserQuestion` is not
available in this session, or the same round comes back rejected twice for the same reason, use
Appendix A and say in one line why you switched. Phase 0 step 4 does not catch either case — it
screens entrypoints with no human at all, not a live user whose client renders the picker badly.

Either way the round ends with the user's answers in hand and nothing else attempted — the
tool returns them directly, the text format waits for the user's next message. **Never carry on
past an unanswered question.** Each round of answers reshapes the tree: settled decisions push the
frontier outward. Recompute it and ask the next round. A question whose answer depends on another
question still open in this round belongs to a *later* round, not this one.

Rules:

- **Facts are never the user's job, and neither are they yours to fetch.** A frontier question
  that needs a fact goes to a script, by where the fact lives:
  - **in the repository or the git history** → a second orient run
    (`${CLAUDE_PLUGIN_ROOT}/workflows/orient.workflow.js`, phase 1's mechanism — `Read` it, pass
    it as `script`).
  - **outside it** — a spec, a vendor's figure, a market number, a library's documented
    behaviour → `${CLAUDE_PLUGIN_ROOT}/workflows/research.workflow.js`, the same way:

    ```
    Workflow({
      script: "<the contents of research.workflow.js, verbatim>",
      args: {
        request:   "<the requested work, verbatim>",
        questions: [
          { q: "<one fact>",                    complexity: "simple" },      // 4 searches, 4 URLs
          { q: "<a few sources side by side>",  complexity: "comparison" },  // 10 searches, 10 URLs — the default
          { q: "<a whole landscape>",           complexity: "complex" }      // 15 searches, 20 URLs
        ],
        hints: ["https://..."]                       // omit if none
        // searchModel / readModel / searchEffort / readEffort override the defaults; maxPages caps the run (60)
      }
    })
    ```

    **Say how hard each question is.** The tiers are Anthropic's own per-agent call ranges for its
    research system — "1 agent with 3-10 tool calls" for a simple fact, "10-15 calls each" for a
    comparison, more than ten agents for complex research — and the failure mode they name is
    "overinvestment in straightforward queries". A question you cannot place is `comparison`.

    Two stages, so no page is ever read twice. A **searcher** per question — the session's model at
    `effort: low`, searching only, never fetching — returns up to the tier's URLs. Then a **reader**
    per distinct URL — `sonnet` at `effort: low`, one page per context — returns `findings` each
    with a verbatim `quote`. A URL two questions surfaced is read once. The return carries
    `findings` (claim, quote, `source_url`, which questions), `pages`, `noSources` (questions whose
    searcher found nothing), `unreadable`, `unquoted` (findings whose reader gave no quote), and
    `overBudget` (searchers reporting more searches than their tier). **A finding with no quote is
    not a fact** — it goes to the user as a question, not into the plan as context. Every count
    reaches phase 7.

  Neither script is optional for a fact it can reach. Dispatching a `general-purpose` agent
  yourself with the model omitted is how five research sweeps inherited opus and ran 130–193
  turns each on 2026-09-29. Never block the round on a running script — it is just an unsettled
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
orient: <runId>, <N> dispatched   # from the phase 1 script's result; or `skipped, already mapped`
---

# <Title>

## Goal
What is being built, from the user's perspective. One paragraph.

## Context
Repo-relative paths to every file that matters, one line each on what it is and why it matters
here — **pasted from the orient script's `files`, not retyped and not extended from anything you
read yourself** — plus the format/framework/engine facts established during the interview. A path
here that no orient answer named is a path that came from the main loop reading the repository,
which is what phase 1 exists to prevent.

## Decisions
Every decision settled in the interview, flat list. Include options considered and rejected, with
the reason — this is what stops an executor re-litigating them.

## Tasks

### Task 1 — <title>
- state: todo          # todo | doing | done | failed
- blocked-by: none     # or: 2, 5
- commit:              # filled in by the main loop after the task lands; `none (no file change)`
                       # for a task whose effect is not in the repo — remote metadata, a setting,
                       # an external service. Never leave it empty on a `done` task.
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
- **the `orient:` line from the frontmatter** — the run id and how many questions the phase 1
  script dispatched, or `skipped, already mapped`. An empty line here means phase 1 did not run
  and `## Context` was written from the main loop's own reading; say so rather than hiding it
- **any file or directory this run would create outside `.plans/`** — an ADR directory the repo
  does not yet have, or a glossary that does not yet exist. Name the path. Creating a new
  top-level convention in someone's repository is theirs to approve, not yours to assume.
- the plan file path

Then **stop and wait for a go.** On go, set `status: approved`, commit the plan
(`plan(<slug>): add plan`), and continue.

## Phase 5 — Execute

**The dispatch in this phase is done by a script, not by you.** That is the whole point of this
command: the same instruction written as prose was followed once in twenty-two chances over a
four-day run. A rule you can forget is not a rule. The only code path that performs a task is the
script's `agent()` call, so there is no branch in which this conversation does the work instead.

The prose version was deleted on 2026-09-16 rather than kept as an alternative, because a command
whose central claim is "an instruction you can forget is not a rule" cannot also ship the version
that forgets.

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

**Set `status: executing` in the plan file, and set every task being started to `state: doing`.**
Do this before the script runs, not after. `approved` means phase 4 finished and phase 5 has not
begun; `executing` is the only thing that tells a resuming session the work is already in flight.
Leaving it at `approved` while tasks land is what makes an interrupted phase 5 indistinguishable
from an approved plan nobody has started.

### 2. Run the script

The script ships with this plugin, at `${CLAUDE_PLUGIN_ROOT}/workflows/execute.workflow.js`.
**Read that file with the `Read` tool, then pass its contents to `Workflow` as `script`.**

```
Workflow({
  script: "<the contents of execute.workflow.js, verbatim>",
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
    ],
    // Effort ladder, all optional. Defaults: every task at `low`; a task that fails its own
    // verify is re-run once at `high`. No model is passed, so the executor's frontmatter pin
    // (`sonnet`) runs. `executorModel: "haiku"` tries a cheaper tier on the first attempt only --
    // the retry still climbs to `retryModel` (default: same as executorModel, so set it to
    // "sonnet" to climb tiers). `retry: false` runs everything once at `firstEffort`.
    firstEffort: "low", retryEffort: "high", executorModel: undefined, retryModel: undefined, retry: true
  }
})
```

Running this command **is** the opt-in to multi-agent orchestration — invoke the workflow without
asking again. It runs in the background and a task notification arrives when it finishes; do not
poll for it, and do not invent its result while it is pending.

The script cannot read the filesystem, so everything it needs is in `args` — this is why you pass
`goal` and `context` verbatim rather than a path to the plan. Anything the interview settled that
does not reach `args` is invisible to every executor.

**Do not pass the plugin's path as `scriptPath`.** `Workflow` accepts a path only when it is
inside the working directory or a directory added with `--add-dir`, and a plugin's install
directory is neither, so the path form is refused with:

```
scriptPath must be a script path this tool returned, or a file you can already read
```

Reading the file first does not lift that. Nor is this a `${CLAUDE_PLUGIN_ROOT}` failure — the
variable expands correctly in this file; the tool declines the expanded path. Both halves were
measured on 2026-09-14, after a run had already worked around it by copying the script into the
repository under test, which is exactly the litter this avoids.

If the `Read` fails, say so and stop — do not reconstruct the scheduler from memory, and do not
copy it into the user's repository.

**The result names a `scriptPath` inside this session's own directory. That is the path to reuse**
— pass it back with `resumeFromRunId` for a retry (step 5), rather than sending the whole script
again.

**What the script does, so you can read its result:** it validates the graph (a cycle, an unknown
`blocked-by`, or a risk marker aborts the run before any agent starts), then starts each task the
moment *its own* blockers land rather than waiting for a whole wave. Each executor runs on
`patimakorn:executor`, which pins `model: sonnet` in its own frontmatter — the script passes no
`model` unless you set `executorModel`, so that pin is what takes effect. **Every task runs at
`effort: low` first; one that comes back `passed: false` is re-run once at `high`.** Anthropic's
cost reference measured this ladder on coding work: everything at low with failures re-run at
the default passed ~93% for ~$0.70 per task, against 91.7% for $1.39 running everything at the
default — the same pass rate for half the cost, made safe by a checker, which here is the task's
own `verify:`. A `contradiction` is not retried (it is the plan that is wrong, not the effort),
and neither is a dead executor. Every result is schema-validated: `filesTouched`,
`verifyCommand`, `verifyStdout`, `passed`, `summary`, and an optional `contradiction`. A task
whose blocker failed is never dispatched and comes back under `skipped`. The return carries
`effort` (what ran) and `retried` (which tasks took two attempts, and whether the second
passed) — phase 7 prints both, and a high retry rate on a cheap `executorModel` means you paid
for two attempts where one at `sonnet` would have done.

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

Write the resulting sha into that task's `commit:` field and set `state: done`, and append a Log
line — **but edit the plan file once per workflow run, after the last task commit, not once per
task.** One commit per task is what makes any task revertable alone; the plan file is not a task,
and a second commit per task doubled the main loop's commit count on a 23-task run (46+ turns on
the session model, each a file edit and a `git commit`). So: commit the code for every task in
order, then update every `commit:`, `state:` and Log line in one edit and commit it once as
`plan(<slug>): tasks <first>-<last> done`. A resume that lands between the last task commit and
the plan commit sees `state: doing` on tasks whose code is in `git log` — the sha is the proof,
the plan field is the record; reconcile from the log and say so.

### 5. If a task failed

Set `state: failed`. A task the script reports under `contradiction` is not a bug — it is an
executor refusing to paper over a plan that disagrees with the repository, and the plan is what
needs fixing.

If the cause is not obvious from the returned `verifyStdout` and your own verify, use the
`diagnosing-bugs` skill before guessing. Then put three options to the user:

- fix this task and retry it
- go back and amend the plan, re-planning the remaining tasks
- abandon — `git revert` the task commits made so far, in reverse order

To retry after a fix, re-invoke the workflow with the `scriptPath` and run id the first result
named, as `scriptPath` plus `resumeFromRunId`: unchanged tasks replay from cache and only the
edited one runs live. That returned path is inside the session directory and is accepted; the
plugin's own path still is not.

Do not start work that depends on a failed task.

## Phase 6 — Review loop

Set `status: reviewing`. Then loop, at most **3 fixing rounds**:

1. Run the `code-review` skill **at `medium`** over the range `<first task commit>..HEAD` —
   `/code-review medium <range>`. Name the level every time: with no level given the skill reuses
   whatever was typed last in the session, which on 2026-09-29 was a stale `xhigh` and cost ten
   finder agents plus verifiers for a three-line diff.
2. Fix every finding you are confident in. Commit as `plan(<slug>): review fixes round <N>`.
3. Re-run the plan's `verify:` commands.
4. If the review came back with nothing, stop the loop.

Then run **one closing pass that fixes nothing**, over the last fixing round's own diff — **this
one at `xhigh`**. Each round's fixes are themselves unreviewed code, and the last round's never
get a turn — without this pass the loop ships exactly the changes nobody checked. The fixing
rounds can afford a cheaper level because the next round catches what one misses; the closing
pass has no next round, so it gets the thorough one. If the closing pass finds something,
**report it, do not fix it**: a fix here would need its own review, and the cap exists to stop
that regress. Note it as a follow-up instead.

The split is a decision, not a measurement: `xhigh` returned fifteen confirmed findings on a
9,200-line diff; `medium` has not yet been run on a diff that size. If a run's closing pass at
`xhigh` finds what the `medium` rounds missed, that is the number that decides whether the
fixing rounds move back up — write it in the report.

After that, stop regardless. **State plainly what is still unresolved** — a capped loop that
reports "clean" when it is not is worse than no loop at all. List each surviving finding and why
it was not fixed.

## Phase 7 — Close out

### 1. Ask whether this is what was asked for

Every earlier gate checks something narrower than the request. Phase 5 checks each task against
its own `verify:`; phase 6 checks the code for defects; the report below counts things. None of
them asks whether the finished work is the thing the user wanted, and a plan that misread the
request at phase 3 passes all three — every task verified, review clean, numbers complete, wrong
deliverable. The person who can answer is the one who asked, so this is the third place the
command stops.

Put the plan's `## Goal` section, verbatim, beside a plain statement of what now exists — what
was built, where it is, how to run or see it. Two or three sentences; the report in step 3 has the
detail. Then ask with `AskUserQuestion`, one question, options first and marked as in phase 2:

- **Yes, this is it** — proceed to step 2 as `done`.
- **Partly — something is missing or different** — take the free-text answer, record it in the
  plan's Log, set `status: blocked` with `reason: does not match Goal — <their words>`, commit,
  and report. Do not start fixing: a mismatch at this point is a planning defect, and re-planning
  is a new interview, not a phase 5 retry. Say that plainly and stop.
- **No** — same as partly.

The question is about fit, not quality. Do not fold "were there bugs" into it — phase 6 owns that.
And do not answer it yourself from the plan: the plan is what may have been wrong.

A run that reaches this step with no interactive user (phase 0 step 4 should have stopped it long
before) writes `status: blocked` with `reason: acceptance not asked`, never `done`.

### 2. Record

- Set `status: done`, or `status: blocked` with the reason. Commit the plan file.

  **Write one of the six words the frontmatter names and nothing else** — `planning`, `approved`,
  `executing`, `reviewing`, `done`, `blocked`. A finished plan is `done`. Not `complete`, not
  `finished`, not `Done`. This is not pedantry: Resume below routes on this field by matching it
  against that set, so a synonym is not a smaller mistake than a wrong word — it falls out of
  every branch at once and the plan is reported as nothing to resume. Three plans in one
  repository were found at `complete` on 2026-09-16, and they read as finished only by luck.
### 3. Report

- Short, in the language the user is writing to you in:
  - **the acceptance answer from step 1, in the user's words** — `accepted`, or what they said was
    missing. This line is the only place in the whole run where the outcome is compared to the
    request, so it goes first.
  - **how many orientation questions phase 1 dispatched, and how many came back unsourced** —
    the orient script's return value carries `dispatched` and `unsourced`, so both are counts, not
    impressions. An unsourced answer is one that cited no file and admitted no unknown; say what
    was done with each (re-asked, put to the user, or dropped) — a plan that quotes one as a fact
    is a plan built on a guess. `0` dispatched is not a possible value: the
    script refuses an empty list. The honest alternatives are a number, or `skipped, already
    mapped` with the reason. A report that cannot produce either is a run that read the repository
    into the main conversation instead, and this line is where that becomes visible.
  - **the same for phase 2 research**, from the research script's return: questions dispatched
    with their tiers, `searchesUsed`, `urlsFound` and `pagesRead`, `noSources`, `unreadable`,
    `unquoted`, and every entry in `overBudget` with its numbers. A research question answered by
    an agent you dispatched yourself, outside the script, is reported here by name with the model
    it ran on and how many fetches it made — that is the path that cost 83% of a run, and the
    report is where it stops being invisible.
  - tasks done / total, and **how many went to the script versus stayed in this conversation** —
    the script's return value carries `dispatched`, so this is a count, not an impression. Name
    each main-loop task and which line of phase 5 step 1 exempted it. A run where that list is
    long did not follow this command, whatever else it achieved, and the report is where that
    becomes visible instead of only showing up on the bill.
  - **the effort ladder's numbers**, from the same return: what `effort` ran (first and retry
    levels, and the model if one was passed), and every task in `retried` with whether its second
    attempt passed. The retry rate is the number that says whether `low` is doing this plan's
    work: a few retries is the ladder paying for itself; most tasks retried means every task was
    paid for twice, and the next run should start at `medium`. With an `executorModel` cheaper
    than `sonnet`, the same line says whether that tier is earning its place.
  - verification results, with the real command output
  - review rounds run, and anything still open
  - what was skipped, and why
- If this work established a durable fact — a file format, a layout, a constraint a future session
  would otherwise rediscover — offer to write it to memory. Do not write it unasked.

---

## Resume

Reached when this command is run with no arguments.

1. List `.plans/*.md` and read the `status:` of each.
   - **A status that is none of the six words** (`planning`, `approved`, `executing`, `reviewing`,
     `done`, `blocked`) — **stop and ask.** Do not treat it as finished and do not guess which one
     was meant. An unrecognised status matches no branch below, so silently continuing reports it
     as nothing to resume, which is indistinguishable from a plan that really is done. Say which
     file, quote the status, and ask. This happens: three plans were found at `complete`.
   - **No plan files, or none in progress** — say so, list what is there, and ask what to build.
     Do not silently do nothing.
   - **Exactly one in progress** (`approved`, `executing`, `reviewing`) — use it.
   - **One at `blocked`** — that is not "nothing in progress". Phase 7 writes it with a reason;
     surface that reason first and let the user decide, rather than asking what to build.
   - **One at `planning`** — phase 3 was interrupted. Read its `orient:` line. Filled: phase 1 ran
     and its result is in `## Context`, so pick up at phase 3 with the Decisions already recorded.
     Empty: phase 1 never ran, and whatever is in `## Context` came from the main loop reading
     the repository — start again at phase 1, and say that the earlier Context is being replaced.
   - **Several** — show them and ask which.
   - **One at `approved` or `executing` whose tasks are all `done`** — phase 5 finished and phase 6
     was never reached, or the close-out did not land. Do not re-enter phase 5 looking for work:
     there is none, and the wave rule would sweep the `done` tasks back in. Go to phase 6.

2. **Read `status:` before looking at the tree. It decides which phase you resume into**, and
   getting this wrong is how a half-reviewed plan gets pushed:
   - `reviewing` — phase 6 was interrupted. **Resume at phase 6**, not phase 5. A `todo` task
     whose blockers are `done` is not an invitation here; the review has not finished passing
     judgement on the work those blockers produced.
   - `approved` or `executing` — resume at phase 5.
   - `blocked` — read the reason recorded in the plan and put it to the user before anything else.

3. Then check the working tree:
   - **Clean** — report where the plan stands (tasks done / total, which tasks are unblocked now)
     and continue at the phase step 2 selected.
   - **Dirty because a merge or rebase is in progress** (`git status` says so) — use the
     `resolving-merge-conflicts` skill to finish it before touching the plan at all.
   - **Dirty, with `status: reviewing`** — the most likely interruption of all, because phase 6
     edits the tree before committing each round as `plan(<slug>): review fixes round <N>`. Those
     changes are unfinished review fixes, **not** a failed task. Show `git status --short`, say
     which review round was in flight, and ask whether to finish that round or discard it. Never
     offer `git checkout -- .` here as "retry that task" — it throws away review work and points
     at the wrong phase.
   - **Dirty, otherwise** — expected after a failed task. Show `git status --short`, name the task
     sitting at `doing` or `failed`, and ask before touching anything:
     - keep the working-tree changes and continue from there
     - `git checkout -- .` back to the last task commit and retry that task
     - abandon the plan and revert its commits in reverse order

4. Never restart a task whose `state:` is `done`. The `commit:` field is the proof it landed —
   including the literal value `none (no file change)`, which is proof for a task that changed no
   file at all. An **empty** `commit:` on a `done` task is not proof of anything: it is equally
   what an executor produces when it claims success and writes nothing. Treat it as unverified and
   ask.

---

## Appendix A — the lettered text round

The fallback for phase 2, for a round that does not fit `AskUserQuestion`. Mark the
recommendation and put it first, so the round stays one line to accept:

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

That closing line goes in every text round. Without it the user does not know the whole round can
be accepted in two characters, and a text round that reads like a form is the thing this format
has to avoid.
