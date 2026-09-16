export const meta = {
  name: 'anvil-orient',
  description: 'Answer the orientation questions a plan needs: one read-only Explore subagent per question, each returning the files it found and what they do.',
  whenToUse: 'Phase 1 of /patimakorn:anvil. Not useful on its own — the main loop composes the questions; this script only guarantees they are answered by subagents rather than by reading the repository into the main conversation.',
  phases: [
    { title: 'Orient', detail: 'one Explore agent per question, all concurrent' },
  ],
}

// This script exists for the same reason execute.workflow.js does: the instruction it
// replaces was measured not binding. Phase 1 said "the floor is one dispatch" and a
// 43-executor run dispatched zero Explore agents, reading the repository into the main
// conversation instead -- where every result stays in context for the seven phases that
// follow. Here the questions arrive via `args` and the only thing that answers them is
// the agent() call below. Refusing an empty question list is the floor, written as code.
//
// Two constraints from the workflow runtime shape everything here:
//   - No filesystem access. The main loop composes the questions; this script cannot
//     look at the repository to invent its own.
//   - Agents are read-only by construction: `Explore` cannot edit, and nothing here
//     asks it to. An orientation that changes the tree is a bug, not a feature.

// ---------------------------------------------------------------- contract

const ANSWER_SCHEMA = {
  type: 'object',
  required: ['files', 'summary'],
  additionalProperties: false,
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'why'],
        additionalProperties: false,
        properties: {
          path: { type: 'string', description: 'Repo-relative path.' },
          why: { type: 'string', description: 'One line: what this file is and why it matters to the question.' },
        },
      },
      description: 'Every file that bears on the question. Empty if none does.',
    },
    summary: {
      type: 'string',
      description: 'The answer to the question, in a few sentences. Facts only -- what the repository does, not what it should do.',
    },
    unknowns: {
      type: 'array',
      items: { type: 'string' },
      description: 'Anything the question asked that could not be settled from the repository. Omit if nothing.',
    },
  },
}

// ---------------------------------------------------------------- input

const IN = args || {}
const QUESTIONS = Array.isArray(IN.questions) ? IN.questions.filter(q => typeof q === 'string' && q.trim()) : []

if (!QUESTIONS.length) {
  throw new Error('anvil-orient: args.questions is empty. Phase 1 needs at least one question -- "which files does this work touch" is always one. The main loop composes them; this script cannot read the repository to invent its own.')
}

// ---------------------------------------------------------------- prompt

function promptFor(q, i) {
  const lines = [
    'You are orienting a plan that has not been written yet. Answer one question about this',
    'repository, from the repository -- read whatever you need, change nothing.',
    '',
    '## The work being planned',
    IN.request || '(no request recorded)',
    '',
    '## Question ' + (i + 1),
    q,
  ]
  if (Array.isArray(IN.hints) && IN.hints.length) {
    lines.push('', 'Paths already known to matter, as a starting point and not a boundary:', ...IN.hints.map(h => '  - ' + h))
  }
  lines.push(
    '',
    '## Rules',
    '- Report what the repository does, not what it should do. Opinions belong to the interview.',
    '- Every path you name must exist. Do not guess a path from a naming convention -- open it.',
    '- If the question cannot be settled from the repository, say so in `unknowns` rather than',
    '  filling `summary` with a plausible answer. An honest gap is worth more than a confident guess.',
    '- Keep `summary` short. The reader is composing an interview, not reading a report.'
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------- dispatch

phase('Orient')
log('dispatching ' + QUESTIONS.length + ' question(s), one Explore agent each')

// Every question is independent, so they all go out at once. The runtime caps how many
// run at a time and queues the rest.
const answers = await parallel(QUESTIONS.map((q, i) => () =>
  agent(promptFor(q, i), {
    agentType: 'Explore',
    model: 'sonnet',
    phase: 'Orient',
    schema: ANSWER_SCHEMA,
    label: 'orient ' + (i + 1) + ': ' + q.slice(0, 60),
  }).then(r => ({ question: q, answer: r }))
))

// ---------------------------------------------------------------- report

// An agent that dies or is skipped comes back as null from agent(); the .then above
// wraps that as { question, answer: null }, so the filter has to look inside.
const settled = answers.filter(a => a && a.answer)
const failed = QUESTIONS.length - settled.length
const files = new Map()
for (const a of settled) {
  for (const f of a.answer.files || []) if (f && f.path && !files.has(f.path)) files.set(f.path, f.why)
}

log(settled.length + ' answered, ' + failed + ' returned nothing, ' + files.size + ' distinct file(s) named')

return {
  dispatched: QUESTIONS.length,
  answered: settled.length,
  answers: settled.map(a => ({ question: a.question, ...a.answer })),
  // The union of every file any answer named, one line each -- the shape the plan's
  // Context section wants. Paste it; do not retype it from memory.
  files: [...files.entries()].map(([path, why]) => ({ path, why })),
  // Phase 7 reports this number. It comes from here, not from an impression.
  orientIsDone: true,
}
