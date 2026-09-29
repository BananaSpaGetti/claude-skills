# claude-skills

Small, composable plugins for [Claude Code](https://claude.com/claude-code). Each one is
independent — install only the ones you want.

## Install

```
/plugin marketplace add BananaSpaGetti/claude-skills
/plugin install patimakorn@claude-skills
```

**The repository is private as of 2026-09-03, so those commands work only for its owner.** They
were run for real on 2026-08-28 (under the plugin's former name) and again on 2026-08-30: the
marketplace cloned and validated, and the plugin unpacked complete into
`~/.claude/plugins/cache/claude-skills/`. Both runs were authenticated as the owner, which is
not the same test as a stranger's, and the difference is tracked in Known gaps below. Plugins
load at session start, so restart Claude Code afterwards.

A plugin command is addressed as `<plugin>:<command>`, so the command below is
`/patimakorn:anvil`. A bare `/anvil` does not resolve to it.

## Plugins

### `patimakorn` — `anvil`, one command for a large piece of work

```
/patimakorn:anvil <what you want built>   start
/patimakorn:anvil                        resume an in-progress plan
```

Eight phases in one conversation: preflight, orient, interview, plan, approve, execute, review,
close out. Three of them are where it stops and waits *by design* — the interview rounds, the
single plan approval, and one question at the end: is this what you asked for. Every earlier gate
checks something narrower (a task's own verify, the code's correctness, the counts), and a plan
that misread the request passes all of them; the person who asked is the only one who can answer
that, so it is asked rather than inferred. It will also stop and ask when something needs a decision it should not
make for you: whether to branch off `main`, what to do about a failed task, how to pick up a
plan whose tree is dirty. Everywhere else it runs without checking in.

- **Interview as a design tree.** The frontier is every decision whose prerequisites are settled;
  it asks that whole frontier in one numbered round, each question with a recommended answer, then
  waits. Facts are never your job — those go to subagents. It also argues with the decisions you
  arrived holding: a decision nobody questioned is not the same as one that was settled. It stops
  arguing when it runs out of evidence you have not already answered, not after a fixed number of
  tries.
- **The plan lives in the repo**, at `.plans/<slug>.md`, and gets committed. Each task carries its
  own `state:`, `blocked-by:`, `risk:` and `commit:` fields.
- **Decisions outlive the plan.** A plan file is spent once its tasks land, so anything settled in
  the interview that will still matter in a year — a boundary, a format, an option rejected for a
  durable reason — is written as an ADR instead, and vocabulary the interview had to pin down goes
  to a glossary. It uses whatever convention the repo already has; if there is none, the directory
  it would create is named at the approval step rather than appearing unannounced.
- **One executor subagent per task, dispatched by a script.** Phase 5 hands the task list to
  `plugins/patimakorn/workflows/execute.workflow.js`, and its `agent()` call is the only code path
  that performs a task — see below for why that is a script and not an instruction. Executors are
  forbidden from running git commands, since concurrent ones would race on `.git/index.lock`, so
  the main loop commits each task sequentially instead. You keep `git revert <sha>` per task.
- **Review loop, capped at 3 fixing rounds**, then one closing pass that reports rather than
  fixes — otherwise the last round's own fixes ship unreviewed. The loop stops early once a
  review comes back clean, and at the cap it says plainly what is still unresolved rather than
  declaring victory.
- **Resumable.** Run `/patimakorn:anvil` with no arguments after a session ends: it reads the per-task state
  out of the plan file and picks up at the first unstarted task. A dirty tree is expected after a
  mid-wave failure, so resume asks what to do rather than refusing to run.

Some work is deliberately *not* delegated: anything the plan marks `risk: destructive`,
`risk: binary-format`, or `risk: judgement-call` stays in the main conversation.

#### Why phase 5 is a script

There used to be two commands. `anvil` treated delegation as advice; `anvil2` moved phase 5's
dispatch into code. They were run side by side, and on 2026-09-16 the prose version was deleted
and the script version took the name.

The advice version's four-day run measured what advice costs. Across three plans and 23 tasks —
22 of them `risk: none`, so all 22 were eligible — it dispatched one executor. The other 313 tool
calls ran in the main conversation, where each one both adds a turn and leaves its result in
context for every later turn. Context climbed from 72k to 556k tokens. Phase 1's "dispatch
subagents for anything broad" ran zero times. The script version, on a 23-task port of a Python
tool to C, dispatched 43 executors across six workflow runs and kept exactly one task in the main
conversation — the one the plan marked `risk: judgement-call`.

The lesson was not that the instruction was badly worded. It was that an instruction is the wrong
mechanism: a rule the orchestrator can forget under pressure will be forgotten under pressure. So
**phase 5's dispatch is a script** — `plugins/patimakorn/workflows/execute.workflow.js` — and the
only code path that performs a task is its `agent()` call. There is no branch where the
conversation does the work instead. Keeping the forgetful version around as an option would have
contradicted the claim the script exists to make.

What moving it into code buys, beyond enforcement:

- **A real dependency scheduler.** A task starts the moment *its own* `blocked-by` tasks land,
  not when its whole wave clears. Waves are what prose can approximate; this is the thing code is
  there for.
- **A typed result contract.** Each executor's return is schema-validated at the tool layer, with
  retry on mismatch: `filesTouched`, `verifyCommand`, `verifyStdout`, `passed`, `summary`, and an
  optional `contradiction` for a plan that disagrees with the repository. "An executor claiming
  success is not evidence" becomes a checkable shape instead of a warning.
- **Failing loudly.** A dependency cycle, a `blocked-by` naming a task that was not passed in, or
  a task carrying a `risk:` marker aborts the run before any agent starts, rather than hanging or
  quietly running a destructive task on a subagent.

What stays in the conversation, because the runtime cannot do it: the interview and the approval
(a script cannot ask you anything), reading the plan file (scripts get no filesystem — the main
loop parses it and passes the tasks as `args`), running each `verify:` for real, and committing —
concurrent agents would race `.git/index.lock`, which is also why executors are forbidden every
git write command.

Every other dispatch still names its model from a table rather than inheriting the session's:
retrieval and summarization go to `sonnet`; research whose answer turns on source quality, and the
phase 6 review finders, keep the session model deliberately — those finders returned fifteen
confirmed findings per round for under 8% of that run's cost. The phase 5 executors need no
override at all: `patimakorn:executor` pins `model: sonnet` in its own frontmatter, and a
workflow-dispatched agent honours it.

Phase 1 got the same treatment on 2026-09-16, for the same reason: the same 43-executor run
dispatched zero `Explore` agents against an instruction that said "the floor is one dispatch". So
orientation is `plugins/patimakorn/workflows/orient.workflow.js` — the main loop composes the
questions, the script dispatches one read-only `Explore` agent per question and refuses an empty
list, and its `files` is the only thing the plan's `## Context` may be written from. It also
counts `unsourced` answers — a summary that cites no file and admits no unknown, which is the
shape of a guess — and phase 7 reports that number beside `dispatched`, so a plan built on an
uncited claim shows it in the close-out rather than in the result. Unlike the
execute script, this one has not yet been run on a real plan; Known gaps says so.

Both scripts have tests — `execute.workflow.test.js` (22 assertions over ordering, concurrency,
stranded dependents, cycles and the risk-marker guard) and `orient.workflow.test.js` (23 over the
dispatch shape, the empty-list refusal, dead-agent accounting and the file union). Each stubs the
agent, so they cost nothing and need no network:
`node plugins/patimakorn/workflows/<name>.workflow.test.js`.

One command ships. What has and has not been proven about it is tracked in Known gaps — start
there.

### `engineering-kit` — nine disciplines the agent reaches for on its own

Model-invoked skills, so you never type them: `diagnosing-bugs`, `tdd`, `prototype`, `research`,
`domain-modeling`, `codebase-design`, `resolving-merge-conflicts`, `wizard`, `writing-for-agents`.

`anvil` uses them when they are present and works without them when they are not — it declares no
hard dependency on this plugin.

Derived from [Matt Pocock's skills](https://github.com/mattpocock/skills) under MIT. See
[NOTICE](./plugins/engineering-kit/NOTICE) for exactly what was taken and what was changed. If you
want them as their author ships them, with his updates, install `mattpocock-skills` instead —
do not install both.


### `council` — five advisors who are supposed to disagree

For decisions that are expensive to reverse: architecture, schema, framework choice, migration
strategy, build-vs-buy. Five lenses argue, peer-review each other anonymously, and a debate
round is forced when the agreement looks like groupthink. The verdict preserves the minority
view rather than averaging it away.

Costs 11–13 subagents. The skill itself tells you when *not* to convene one.

### `game-save-re` — reverse-engineer a save file

An ordered method rather than a tool: look for prior art first, identify the container before
editing bytes, back up to a timestamped copy, re-sign checksums and re-write length prefixes,
then verify in-game. Engine-agnostic — Unity, Godot, Ren'Py, RPG Maker, custom binary.

Use it on your own single-player saves.

### `caveman` — replies with the padding taken out

An output style, not a command. No "I'll now", no apology, no restating the question back at
you; one fact per line, and numbers where an adjective would have gone — `3/3 pass`, not "all
tests are passing nicely". `auth.py:42` is a reference you can click, "the auth module" is not.

What it deliberately does not compress: code, shell commands, paths, URLs, flags, identifiers,
and error text quoted from real output, which all stay byte-exact. Nor does terseness become
silence — a failed step, a skipped step, and a warning before something irreversible are all
stated in full. The register is for talking to you; files it writes for you, including commit
messages and docs, stay ordinary professional English.

It carries a Thai section too, because politeness padding there is grammatical rather than
optional, and stripping it needs saying explicitly.

```
/plugin install caveman@claude-skills
```

Then pick **`caveman:Caveman`** in `/config`. Two details worth knowing, both read out of the
CLI itself rather than assumed: a plugin's output styles are always namespaced `plugin:name`, so
this one never collides with a style of your own called `Caveman`; and `/output-style` is a
hidden command whose description is "Output style moved to /config", so `/config` is where the
picker actually lives.

Installing it does not switch you to it — `force-for-plugin` is `false`, so whatever style you
are on stays selected until you pick this one.

## Repo layout

```
CLAUDE.md                         orientation for an agent changing this repo
.claude-plugin/marketplace.json   the marketplace manifest
plugins/<name>/                   one directory per plugin
  .claude-plugin/plugin.json
  commands/ | agents/ | skills/
  output-styles/                  `caveman` only, so far
  workflows/                      `patimakorn` only, so far — the phase 5 dispatcher and its test
  evals/                          `patimakorn` only, so far — see below
```

Everything in the repo is either a published plugin or documentation about one. An `anvil` run
writes `.plans/<slug>.md` and commits it; this repo then deletes that file by hand once the work
has landed, so cloning it gets you the plugins and not the author's spent worklists. The
deletion is this repo's housekeeping — `anvil` itself never removes a plan.

`plugins/patimakorn/evals/` holds one case for `claude plugin eval`. That runner is in early access
and prints `plugin eval is currently in early access` rather than running, so the suite has
never been executed — see [its README](./plugins/patimakorn/evals/README.md).

**Command name, decided 2026-08-30, replacing the 2026-08-28 decision to keep the stutter.** The
plugin was called `anvil` and so was its only command, which was addressed as `/anvil:anvil`. It is
now `patimakorn`, so the command is `/patimakorn:anvil` — the tool keeps the name it earned and
the prefix stops repeating it. Renaming also ends a collision worth naming: `mulkatz/anvil` is a
live Claude Code plugin doing adversarial structured debate, which is what this repo's `council`
does, and only the author had installed this one, so the rename cost nothing.

The trade is real and was made knowingly: a prefix that says who wrote it tells a stranger less
than one that says what it does, and the other four plugins here are still named for their job.
`BananaSpaGetti` was tried first and rejected — `claude plugin validate` accepts it, but warns
that the Claude.ai marketplace sync requires kebab-case, so the lowercase form is what ships.

## Known gaps

The home for what is and is not verified. Prose elsewhere in this file describes what the tools
do and what past runs measured; **this section is where the ticks live, and a status claim that
contradicts a box here is the stale one.**

- [x] `claude plugin validate` passes on the marketplace and all five plugins
- [ ] **The repository is private.** No stranger has installed anything here. The install above
  was run twice by the owner while authenticated — under the plugin's former name on 2026-08-28
  and under the current one on 2026-08-30 — which proves the manifest resolves and the plugin
  unpacks, and proves nothing about anonymous access. Baseline, taken while private, needing no
  `gh auth logout` — this is the logged-out test to re-run. Use `curl.exe`, not `curl`: in
  PowerShell 5.1 the bare name is an alias for `Invoke-WebRequest`, which has no `-s` and no `-w`
  and dies on a parameter-binding error that reads nothing like a failed check.

  ```
  curl.exe -s -o /dev/null -w "%{http_code}" https://raw.githubusercontent.com/BananaSpaGetti/claude-skills/main/.claude-plugin/marketplace.json
  curl.exe -s -o /dev/null -w "%{http_code}" https://api.github.com/repos/BananaSpaGetti/claude-skills
  ```

  Both currently print `404`. Note what this does and does not prove: two `200`s show the objects
  are anonymously readable, which is necessary but not sufficient — they exercise neither
  `/plugin marketplace add` nor `/plugin install`, so a manifest that fetches but fails to clone,
  validate or unpack would still pass. This box gets ticked only after the repo is public, both
  commands print `200`, **and** the two install commands at the top of this file have actually
  been run by someone who is not the owner.
- [x] `anvil` run on a real repo, start to finish, twice — on this one. Both runs are in the
      history under `plan(<slug>)` commits; their plan files were deleted at close-out. The
      first (`anvil-self-test`, `b218a09..2950089`) went through all eight phases but was cut to
      one main-loop task at approval, so it proved nothing about dispatch. The second
      (`close-repo-gaps`, `0de4b42..b829102`) proved the rest: two `executor` subagents
      dispatched concurrently in wave 1, wave 2 held until both were `done`, a commit per task,
      and a later session resuming from per-task state on disk.
- [x] LICENSE confirmed — MIT, and each `plugin.json` now declares it
- [x] `anvil` run on a repository that is not this one — a Kaggle competition repo, 2026-08-29 to
      2026-09-02, three plans and 23 tasks end to end. All eight phases ran, the plan file drove a
      commit per task across 24 `plan(<slug>)` commits, resume worked across a three-day gap, and
      the review loop returned fifteen confirmed findings per round on real numerical code.
- [x] **Phase 5 delegation binds now, and the prose version that did not is deleted.** The run
      above dispatched one executor for 22 eligible tasks, ran phase 1's exploration zero times,
      and did 313 tool calls in the main conversation; context reached 556k tokens. That was an
      instruction that did not bind, not a missing feature. Moving the dispatch into
      `execute.workflow.js` fixed it: measured across the 2026-09-13 C-port run, 43 of 43 eligible
      tasks went to the script and the one main-loop task was the one marked `risk: judgement-call`.
      On 2026-09-16 the two commands were folded into one and the prose version removed.
- [x] **Phase 1 is a script, and it has run.** The 43-executor run had dispatched **zero**
      `Explore` agents against "the floor is one dispatch" — the same instruction-does-not-bind
      defect phase 5 had, on the other side of the interview. On 2026-09-16 orientation moved into
      `plugins/patimakorn/workflows/orient.workflow.js`: the main loop composes the questions, the
      script dispatches one `Explore` agent per question at `sonnet` and refuses an empty list, and
      its `files` is the only thing the plan's `## Context` may be written from. The first real plan
      through it, `idea-readiness-review` in a separate repository on the same day, carries
      `orient: wf_c27f7b3d-fbb, 6 dispatched` in its frontmatter and "all 6 answered" in its Log.
      That is the number this box was waiting for. It also settles the delivery mechanism for a
      script the `Workflow` tool cannot reach by path — `Read` then `script` — on a real run, not a
      probe; the execute script uses the same mechanism and has not yet had a real run through it
      (see the phase 5 box below).
- [ ] **The acceptance question has been asked once, and answered yes.** Added 2026-09-16 as
      phase 7 step 1: before a plan is marked `done`, the `## Goal` is put beside what was built
      and the user is asked whether it is what they wanted — a "no" blocks the plan with their
      words as the reason rather than starting a fix. It exists because no earlier gate compares
      the outcome to the request: `Goal` appeared in the command exactly twice, as a template
      heading and as text handed to executors, and nothing read it back. `idea-readiness-review`
      asked it on 2026-09-17 and the Log records "accepted, the deliverable is what he asked for",
      so the step runs and the answer is written down. Half a tick: a yes proves the question is
      asked, not that a no would be handled as written. The box closes on the first run where the
      answer was not yes and the plan went to `blocked` with the user's words instead of to a fix.
- [ ] **The execute script has not run a real plan through `Read` + `script`, and "a commit per
      task" does not bind for main-loop tasks.** Two things the same run exposed. `idea-readiness-review`
      dispatched 0 executors — legitimately, since all seven tasks were `risk: judgement-call` and
      the plan was a judgement — so phase 5's new delivery mechanism has been exercised only by the
      orient script (same mechanism, different script). And those seven main-loop tasks landed as
      one commit, not seven; the Log says so itself. The per-task commit rule is enforced by the
      main loop committing after each script result, so a task the main loop performs is a task
      nobody commits separately. Closing the first half needs a plan with at least one `risk: none`
      task. The second is a real gap in the rule, not in the run: phase 5 step 1's exemptions say
      what stays in the conversation and nothing says how those tasks reach git.
- [x] The script version ran its interview, plan, execute and review phases on this repository on
      2026-09-12, under plan `ready-for-public`. **The split, which is the number that decides
      whether it fixed the prose version's defect: of the 4 tasks that have executed, 3 went to the script
      and 1 stayed in the main loop.** The plan's fifth task — merge and push — had not run when
      this was written. Both main-loop tasks are `risk: judgement-call` and exempt by phase 5
      step 1: the one that has run mutates GitHub repo metadata; the one still pending is a git
      write executors are forbidden. The three
      dispatched tasks ran concurrently on three disjoint files and returned schema-validated
      results whose `verify:` commands were then re-run in the main loop before each commit.
      Two things this does not cover. It did **not** exercise `${CLAUDE_PLUGIN_ROOT}`: the run
      used an absolute `scriptPath` from a user-scope test copy of the command, not the published
      plugin's resolution path. And "a commit per task" held for 3 of the 4 — task 4 changed no
      file, so it has no sha to revert.
- [x] **`Workflow({scriptPath})` cannot reach a plugin's own files, and neither command tries any
      more.** Settled 2026-09-14. `${CLAUDE_PLUGIN_ROOT}` was never the problem: a fresh session
      printed the substituted absolute path
      (`~/.claude/plugins/cache/claude-skills/patimakorn/0.12.0/workflows/execute.workflow.js`).
      `Workflow` is — it takes a path only inside the working directory or an `--add-dir`
      directory, and refuses anything else with `scriptPath must be a script path this tool
      returned, or a file you can already read`. Reading the file first does not lift it. So a
      stranger's first `/patimakorn:anvil` would have failed at phase 5, every time, and
      `council` with it. Both now `Read` the bundled script and pass its contents as `script`,
      measured working the same day. The 2026-09-13 run reached phase 5 only by copying
      the script into the repository under test; the fixed commands forbid that by name, because
      it leaves an untracked file in someone else's repo.
- [ ] **Resume is not yet safe against an interrupted phase 6.** Three review rounds narrowed this
  and none closed it; the 2026-09-16 changes closed the edges and left the centre. Closed: the
  two-command confusion is gone with the fold; `planning` has a Resume branch (routed by whether
  `orient:` is filled); an unrecognised `status:` stops and asks instead of reading as finished —
  three plans had been sitting at `complete`, a word in no schema, and read as done only by luck;
  and `approved`/`executing` with every task `done` routes to phase 6 instead of back into phase
  5. Still open: `status: executing` is stamped by phase 5 but never committed, so Resume's own
  `git checkout -- .` erases it, and a resumed phase 5 re-runs every dispatch live because no run
  id is persisted. The shape of the real fix is unchanged — a `blocked-by: review` sentinel so a
  task can state that constraint once instead of every code path re-deriving it, and a persisted
  `resumeFromRunId` so a resume replays from cache.
- [x] **The old probe did not test what phase 5 does — and the worry was backwards.** It read as a
  risk of a *false negative* gating the repo shut. The measurement went the other way: the
  variable resolves, and the call it feeds is what fails. CLAUDE.md's step 3 now probes the
  mechanism the commands actually use (`Read`, then `script`), with the same pass condition —
  the script's own `anvil-execute: args.tasks is empty`.
- [ ] `council.workflow.js` has been run once, from the author's user-scope copy. Its published
      copy has still never been run — the delivery mechanism is now the same one `anvil` was
      measured on, but that is an argument by analogy, not a run.
- [ ] The eval suite has never been executed — `claude plugin eval` is in early access and prints
      a notice instead of running.

## License

MIT — see [LICENSE](./LICENSE).
