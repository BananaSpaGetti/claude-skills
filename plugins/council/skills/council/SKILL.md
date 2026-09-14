---
name: council
description: Convene a council of five advisors with deliberately opposed lenses (Architect, Skeptic, Pragmatist, Researcher, Contrarian), have them peer-review each other anonymously, force a debate round when the agreement looks like groupthink, and deliver a verdict that preserves the minority view. Use for decisions that are expensive to reverse — architecture, schema and data model, dependency or framework choice, migration strategy, build-vs-buy, product direction — and whenever the user asks to be disagreed with, wants the plan attacked, or asks for a council, panel, debate, or devil's advocate.
---

# Council

A council is for decisions that are **expensive to reverse**. It costs 11–13 subagents.
Do not convene one for a decision the user can undo in five minutes.

## Convene only when all three hold

1. **Reversal is expensive.** Wrong choice costs days, a migration, or a public API break.
2. **Real alternatives exist.** At least two defensible options. A question with one right
   answer needs a search, not a debate.
3. **The user is deciding now.** Not exploring, not venting. A council that arrives after
   the code is written is theatre.

If any fails, answer directly or use `advisor` — one strong reviewer with the full
transcript beats five agents on a small question.

## Before convening: settle the question

A vague question produces five essays that talk past each other. Spend one turn
sharpening it, and check the codebase yourself first — advisors should be arguing
about the decision, not rediscovering the repo.

Establish, from the user or from the code:

- **The decision, stated as a choice.** "Postgres or SQLite for this" beats "thoughts on
  the database". If the user gave a proposal, the decision is "adopt this proposal or not".
- **The constraints that are already fixed.** Deadline, team size, existing stack, things
  that cannot be changed. Advisors will otherwise recommend rewriting all of it.
- **What has already been tried and rejected**, and why.

Ask the user only for what the code cannot answer. If the question is still mushy after
one round of clarification, run `grill-me` first if it is installed — an unsharpened
question is the single biggest waste of a council.

## Running it

The script ships with this plugin, at `${CLAUDE_PLUGIN_ROOT}/skills/council/council.workflow.js`.
**Read that file with the `Read` tool, then pass its contents to `Workflow` as `script`.**

```
Workflow({
  script: "<the contents of council.workflow.js, verbatim>",
  args: {
    question: "<the decision, stated as a choice>",
    context: "<fixed constraints, relevant file paths, what was already rejected>"
  }
})
```

`args` also accepts a bare string when there is no context worth passing.

**Do not pass the plugin's path as `scriptPath`.** `Workflow` accepts a path only when it is
inside the working directory or a directory added with `--add-dir`, and a plugin's install
directory is neither, so the path form is refused with:

```
scriptPath must be a script path this tool returned, or a file you can already read
```

Reading the file first does not lift that, and it is not a `${CLAUDE_PLUGIN_ROOT}` failure — the
variable expands correctly in this file; the tool declines the expanded path. Measured on
2026-09-14. If the `Read` fails, say so and stop rather than reconstructing the script.

Invoking this skill **is** the user's opt-in to multi-agent orchestration — run the
workflow without asking again. It runs in the background; a task notification arrives
when it finishes. Do not poll for it, and do not invent its result while it is pending.

### What the script does

| Phase | Agents | What happens |
|---|---|---|
| Opinions | 5 | Each lens investigates and answers independently, in parallel |
| Peer review | 5 | Each reads the other four **anonymized**, critiques, may revise |
| Debate | 0 or 2 | Fires **only** when nobody changed their mind and all are ≥0.75 confident |
| Verdict | 1 | Chairman decides, weighs by evidence, records dissent |

The debate round is the anti-groupthink guard. Five agents agreeing without a single
mind changing usually means a shared prior, not an easy question — so a breaker hunts
for the falsifying evidence and a boundary-finder locates the context where the
consensus flips.

If fewer than three advisors return, the script stops and reports what it got rather
than pretending a council happened.

## Reporting the result back

The verdict object carries `verdict`, `rationale`, `dissent[]`, `nextSteps[]`,
`openQuestions[]`, `confidence`.

- **Lead with the verdict and what to do next.** The user convened a council to get a
  decision, not a transcript.
- **Always surface the dissent**, with its `wouldWinIf` condition. That condition is the
  thing the user should watch for — it is the most useful output the council produces
  and the easiest to drop when summarizing.
- **Say whether the debate round fired** (`forcedDebate`). A verdict that survived a
  groupthink challenge is worth more than one that was never tested.
- **Do not inflate confidence.** If `openQuestions` is non-empty, the user still has
  homework; report it as such.
- Never present the council's verdict as your own independent judgment, and never bury a
  minority view because the majority was tidier.

## Do not

- Convene a council to avoid making an easy call yourself.
- Re-run it on the same question hoping for a different verdict. If the verdict was
  wrong, the question was wrong — fix the question.
- Let it run against an empty or unread codebase. Advisors with no evidence produce
  five confident opinions and zero information.
