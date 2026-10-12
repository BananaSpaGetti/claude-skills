export const meta = {
  name: 'anvil-execute',
  description: 'Run an approved plan: one executor subagent per task, each started the moment its own blockers land, each returning a schema-validated result.',
  whenToUse: 'Phase 5 of /patimakorn:anvil. Not useful on its own — it needs a plan the interview already settled.',
  phases: [
    { title: 'Execute', detail: 'one executor per task, dependency-ordered' },
  ],
}

// This script exists so that delegation is structural rather than advisory. The main
// loop parses the plan and describes the work; the only code path that performs a task
// is the agent() call below. There is no branch where the orchestrator does it itself.
//
// Two constraints from the workflow runtime shape everything here:
//   - No filesystem access. The plan is parsed by the main loop and arrives via `args`.
//   - No git. Concurrent agents would race `.git/index.lock`, so committing stays with
//     the main loop, which also runs each `verify:` for real rather than trusting a report.

// ---------------------------------------------------------------- contract

const RESULT_SCHEMA = {
  type: 'object',
  required: ['filesTouched', 'verifyCommand', 'verifyStdout', 'passed', 'summary'],
  additionalProperties: false,
  properties: {
    filesTouched: {
      type: 'array',
      items: { type: 'string' },
      description: 'Every path written or edited, repo-relative. Empty if none.',
    },
    verifyCommand: {
      type: 'string',
      description: "The exact verify command as run. Empty string if the task's verify could not be run here.",
    },
    verifyStdout: {
      type: 'string',
      description: 'Real stdout and stderr from that command, verbatim and untruncated. Never a paraphrase.',
    },
    passed: {
      type: 'boolean',
      description: 'True only if the verify output actually satisfies done-when. Guessing true is the one unrecoverable failure.',
    },
    summary: {
      type: 'string',
      description: 'What changed, in two sentences.',
    },
    contradiction: {
      type: 'string',
      description: 'Set only when the repository contradicts the spec in a way that changes the work. Describe it and stop rather than adapting silently.',
    },
  },
}

// ---------------------------------------------------------------- input

const IN = args || {}
const TASKS = Array.isArray(IN.tasks) ? IN.tasks : []

if (!TASKS.length) {
  throw new Error('anvil-execute: args.tasks is empty. The main loop must parse the plan file and pass the wave-eligible tasks; this script cannot read the filesystem.')
}

// The plan's risk markers are the exhaustive list of what stays in the main loop. If one
// reaches this script, the main loop tried to delegate something it must do itself --
// fail loudly rather than quietly running it on a subagent.
const misrouted = TASKS.filter(t => t.risk && String(t.risk) !== 'none')
if (misrouted.length) {
  throw new Error(
    'anvil-execute: refusing to dispatch ' + misrouted.length + ' task(s) carrying a risk marker: ' +
    misrouted.map(t => '#' + t.id + ' (' + t.risk + ')').join(', ') +
    '. Destructive, binary-format and judgement-call tasks stay in the main conversation.'
  )
}

const byId = new Map(TASKS.map(t => [String(t.id), t]))

// Effort and model per attempt. Defaults: `low` first, `high` on a failed verify, and no
// model passed -- so the executor's own frontmatter pin (`sonnet`) is what runs. Every one of
// these is an argument, so a cheaper or stronger tier is one line in the Workflow call rather
// than an edit to this file. `retry: false` disables the ladder entirely.
const FIRST_EFFORT = IN.firstEffort || 'low'
const RETRY_EFFORT = IN.retryEffort || 'high'
const FIRST_MODEL  = IN.executorModel || undefined
const RETRY_MODEL  = IN.retryModel || IN.executorModel || undefined
const RETRY        = IN.retry !== false

// Validate the dependency graph before dispatching anything. A cycle would otherwise
// recurse forever, and an unknown blocker would silently strand a task.
const unknown = []
for (const t of TASKS) {
  for (const b of t.blockedBy || []) {
    if (!byId.has(String(b))) unknown.push('#' + t.id + ' -> #' + b)
  }
}
if (unknown.length) {
  throw new Error('anvil-execute: blocked-by names tasks that were not passed in: ' + unknown.join(', ') + '. Pass the whole plan, or resolve the blocker first.')
}

const WHITE = 0, GREY = 1, BLACK = 2
const mark = new Map(TASKS.map(t => [String(t.id), WHITE]))
const cycle = []
function visit(id, trail) {
  if (mark.get(id) === BLACK) return
  if (mark.get(id) === GREY) { cycle.push(trail.concat(id).join(' -> ')); return }
  mark.set(id, GREY)
  for (const b of byId.get(id).blockedBy || []) visit(String(b), trail.concat(id))
  mark.set(id, BLACK)
}
for (const t of TASKS) visit(String(t.id), [])
if (cycle.length) {
  throw new Error('anvil-execute: the plan\'s blocked-by fields form a cycle: ' + cycle.join('; ') + '. No task in a cycle can ever start.')
}

// ---------------------------------------------------------------- prompt

function promptFor(t) {
  const lines = [
    'You are implementing exactly one task of a plan that is already settled. The thinking is done;',
    'your value is doing it precisely, verifying it, and reporting honestly.',
    '',
    '## Goal',
    IN.goal || '(the plan recorded no goal)',
    '',
    '## Context',
    IN.context || '(the plan recorded no context)',
    '',
    '## Task ' + t.id + (t.title ? ' - ' + t.title : ''),
    '- change: ' + (t.change || '(unspecified)'),
    '- done-when: ' + (t.doneWhen || '(unspecified)'),
    '- verify: ' + (t.verify || '(unspecified)'),
  ]

  if (Array.isArray(t.paths) && t.paths.length) {
    lines.push('', 'You may touch these paths and nothing else:', ...t.paths.map(p => '  - ' + p))
  } else {
    lines.push('', 'Touch only what this task names. Do not refactor, tidy, or fix anything adjacent.')
  }

  if (t.needsFailingTest) {
    lines.push(
      '',
      "This task's verify names a test that does not exist yet. Use the `tdd` skill if it is available:",
      'write the failing test first, then make it pass.'
    )
  }

  lines.push(
    '',
    '## Rules',
    '- **Do not run `git commit`, `git add`, or any other git write command.** Other executors are',
    '  running concurrently and would race on `.git/index.lock`. Committing is the main loop\'s job.',
    '- Read the files the spec names before editing. It was written by someone who read them earlier,',
    '  so a line number may be stale -- match on surrounding code, not the number.',
    '- If the repository contradicts the spec in a way that changes the work, set `contradiction` and',
    '  stop. Do not silently adapt.',
    '- Run the verify command yourself and report its real output verbatim in `verifyStdout`.',
    '  If you cannot run it here -- it needs a credential, a GPU, or a long external job -- leave',
    '  `verifyCommand` empty, say so in `summary`, and set `passed` to false. The main loop reruns',
    '  every verify anyway; an unrunnable check is not a failure, but claiming it passed is.'
  )

  return lines.join('\n')
}

// ---------------------------------------------------------------- scheduler

// A task starts as soon as its OWN blockers are done -- not when its wave clears. Waves are
// what a prompt can approximate; this is the thing code is here for.

const started = new Map()

function run(t) {
  const id = String(t.id)
  if (started.has(id)) return started.get(id)

  const p = (async () => {
    const blockers = (t.blockedBy || []).map(String)
    const upstream = await Promise.all(blockers.map(b => run(byId.get(b))))
    const failed = upstream.filter(u => !u || !u.ok)

    if (failed.length) {
      const why = failed.map(f => '#' + (f ? f.id : '?')).join(', ')
      log('task ' + id + ' skipped - blocked by unfinished ' + why)
      return { ok: false, id, title: t.title, skipped: true, reason: 'blocked by ' + why }
    }

    // Effort ladder: run cheap first, re-run only what failed its own verify at full effort.
    // Anthropic's cost reference measured this on coding work -- everything at `low` and
    // failures re-run at the default passed ~93% for ~$0.70 per task, against 91.7% for
    // $1.39 running everything at the default. The same pass rate for half the cost, and the
    // thing that makes it safe is a checker: here, the task's own `verify:`. A contradiction
    // is not a failure of effort and is not retried; neither is an executor that died.
    const dispatch = (effort, model, attempt) => {
      const opts = {
        agentType: 'patimakorn:executor',
        effort,
        phase: 'Execute',
        schema: RESULT_SCHEMA,
        label: 'task ' + id + (t.title ? ': ' + t.title : '') + (attempt > 1 ? ' (retry at ' + effort + ')' : ''),
      }
      // The executor's frontmatter pins `model: sonnet`; passing a model here overrides it.
      // Left unset by default so the pin is what takes effect. `executorModel` is the knob for
      // trying a cheaper tier -- the retry step still climbs to `retryModel`, so a cheap first
      // pass that fails is caught by the verify and redone, not shipped.
      if (model) opts.model = model
      return agent(promptFor(t), opts)
    }

    const first = await dispatch(FIRST_EFFORT, FIRST_MODEL, 1)

    if (!first) {
      log('task ' + id + ' returned nothing - the executor died or was skipped')
      return { ok: false, id, title: t.title, reason: 'executor returned no result' }
    }
    if (first.contradiction) {
      log('task ' + id + ' stopped on a contradiction with the plan')
      return { ok: false, id, title: t.title, contradiction: first.contradiction, result: first }
    }
    if (first.passed === true || !RETRY) {
      return { ok: first.passed === true, id, title: t.title, result: first, attempts: 1 }
    }

    log('task ' + id + ' failed its verify at ' + FIRST_EFFORT + ' - retrying once at ' + RETRY_EFFORT)
    const second = await dispatch(RETRY_EFFORT, RETRY_MODEL, 2)

    if (!second) {
      log('task ' + id + ' retry returned nothing - keeping the first result')
      return { ok: false, id, title: t.title, reason: 'retry returned no result', result: first, attempts: 2, retried: true }
    }
    if (second.contradiction) {
      log('task ' + id + ' retry stopped on a contradiction with the plan')
      return { ok: false, id, title: t.title, contradiction: second.contradiction, result: second, attempts: 2, retried: true }
    }
    return { ok: second.passed === true, id, title: t.title, result: second, firstResult: first, attempts: 2, retried: true }
  })()

  started.set(id, p)
  return p
}

// `run` recurses into blockers before memoizing itself, which is safe only because the
// graph was proven acyclic above. Do not remove that check.

phase('Execute')
log('dispatching ' + TASKS.length + ' task(s); each starts when its own blockers land')

const settled = await Promise.all(TASKS.map(t => run(t)))

// ---------------------------------------------------------------- report

const done = settled.filter(r => r.ok)
const failed = settled.filter(r => !r.ok && !r.skipped)
const skipped = settled.filter(r => r.skipped)

const retried = settled.filter(r => r.retried)
log(done.length + ' reported passing, ' + failed.length + ' failed, ' + skipped.length + ' never started'
  + (retried.length ? '; ' + retried.length + ' retried at ' + RETRY_EFFORT + ', ' + retried.filter(r => r.ok).length + ' of those passed' : ''))

return {
  dispatched: TASKS.length,
  passed: done.map(r => ({ id: r.id, title: r.title, attempts: r.attempts, ...r.result })),
  failed: failed.map(r => ({ id: r.id, title: r.title, attempts: r.attempts, reason: r.reason, contradiction: r.contradiction, result: r.result })),
  skipped: skipped.map(r => ({ id: r.id, title: r.title, reason: r.reason })),
  // The ladder's own numbers. A high retry rate with a cheap `executorModel` means the cheap
  // tier is not paying for itself -- you paid for both attempts. Phase 7 prints this.
  effort: { first: FIRST_EFFORT, retry: RETRY ? RETRY_EFFORT : null, executorModel: FIRST_MODEL || 'frontmatter (sonnet)', retryModel: RETRY_MODEL || 'frontmatter (sonnet)' },
  retried: retried.map(r => ({ id: r.id, title: r.title, passedOnRetry: r.ok })),
  // The main loop must still run every verify itself. `passed` above is the executor's
  // claim, schema-shaped but not independently checked.
  verifyIsStillTheMainLoopsJob: true,
}
