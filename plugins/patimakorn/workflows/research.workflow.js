export const meta = {
  name: 'anvil-research',
  description: 'Answer the research questions a plan needs from outside the repository: one bounded subagent per question at sonnet, each returning claims with the URL each one came from.',
  whenToUse: 'Phase 2 of /patimakorn:anvil, for facts that live on the web or in documentation rather than in the repository. The main loop composes the questions; this script bounds what answering them may cost.',
  phases: [
    { title: 'Research', detail: 'one bounded agent per question, all concurrent' },
  ],
}

// This script exists because phase 2 research was the expensive half of a run. Measured on
// 2026-09-29: five web sweeps dispatched as `general-purpose` with the model omitted -- so
// inherited opus -- ran 130 to 193 turns each, made up to 112 web fetches apiece, and
// re-read a context that grew with every fetch. 83% of the run's cost, 58% of it cache
// reads of pages already read. The main loop spent a seventh of that.
//
// Two things bound the cost here and neither is left to the main loop's memory:
//   - `model: 'sonnet'` and `effort: 'medium'` are set in the agent() call, not in a rule.
//   - Every question carries a fetch budget in its prompt, and the agent reports how many
//     it used. The script cannot stop an agent mid-turn, so the number is self-reported --
//     but it is returned and phase 7 prints it, which is how an overrun becomes visible.
//
// Same runtime constraints as the sibling scripts: no filesystem, no Date/Math.random.

// ---------------------------------------------------------------- contract

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings', 'fetches_used'],
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'source_url'],
        additionalProperties: false,
        properties: {
          claim: { type: 'string', description: 'One fact, one sentence. A number carries its unit and its date.' },
          source_url: { type: 'string', description: 'The URL this claim was read from. Empty string only if the claim came from no fetched page -- and then it is a guess and should be in unknowns instead.' },
          quote: { type: 'string', description: 'The sentence on that page the claim rests on, verbatim, if short. Omit otherwise.' },
        },
      },
      description: 'What was established, each with where it came from. Empty if nothing was.',
    },
    unknowns: {
      type: 'array',
      items: { type: 'string' },
      description: 'What the question asked that could not be settled within the fetch budget. Omit if nothing.',
    },
    fetches_used: {
      type: 'integer',
      description: 'How many web searches plus web fetches were made, counted honestly. The budget in the prompt is the ceiling.',
    },
  },
}

// ---------------------------------------------------------------- input

const IN = args || {}
const DEFAULT_MAX_FETCHES = 25
const QUESTIONS = (Array.isArray(IN.questions) ? IN.questions : [])
  .map(q => typeof q === 'string' ? { q } : (q && typeof q.q === 'string' ? q : null))
  .filter(q => q && q.q.trim())

if (!QUESTIONS.length) {
  throw new Error('anvil-research: args.questions is empty. Pass the frontier questions whose answers live outside the repository; a question that lives inside it belongs to the orient script.')
}

const maxFetches = (q) => {
  const n = Number(q.maxFetches != null ? q.maxFetches : IN.maxFetches)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_FETCHES
}

// ---------------------------------------------------------------- prompt

function promptFor(q, i, budget) {
  const lines = [
    'You are researching one question for a plan that has not been written yet. Answer it from',
    'sources you actually read, within a fixed budget, and report honestly what you did and did',
    'not establish.',
    '',
    '## The work being planned',
    IN.request || '(no request recorded)',
    '',
    '## Question ' + (i + 1),
    q.q,
  ]
  if (Array.isArray(IN.hints) && IN.hints.length) {
    lines.push('', 'Sources already known to matter, as a starting point and not a boundary:', ...IN.hints.map(h => '  - ' + h))
  }
  lines.push(
    '',
    '## Budget: at most ' + budget + ' web searches and fetches combined',
    'Count every WebSearch and WebFetch call. When you reach ' + budget + ', stop searching and answer',
    'with what you have. Do not exceed it. Report the count in `fetches_used`, exactly. Every page',
    'you fetch is re-read on every later turn, so the last fetches are the most expensive ones --',
    'plan the budget: search first to find the two or three pages worth reading, then read those.',
    '',
    '## Rules',
    '- Every claim in `findings` carries the URL it was read from. A claim with no URL is not a',
    '  finding; if you believe it but cannot point at a page, put it in `unknowns` with a note.',
    '- Prefer primary sources: the vendor\'s page, the standard, the paper, the filing. A blog',
    '  quoting a number is a lead to the page that has the number, not the source.',
    '- Do not settle contradictions by picking one. Record both with their URLs and say they',
    '  disagree; the interview will decide, and it needs to know there was a choice.',
    '- Numbers carry units and dates. "capacity 500" is not a finding; "500 t/day, 2024 figure" is.',
    '- This is retrieval, not judgement. Do not recommend, rank, or conclude. Opinions belong to the',
    '  interview, and the user will make them with the facts you return.'
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------- dispatch

phase('Research')
log('dispatching ' + QUESTIONS.length + ' question(s), one bounded sonnet agent each')

const results = await parallel(QUESTIONS.map((q, i) => () => {
  const budget = maxFetches(q)
  return agent(promptFor(q, i, budget), {
    agentType: 'general-purpose',
    model: 'sonnet',
    effort: 'medium',
    phase: 'Research',
    schema: FINDINGS_SCHEMA,
    label: 'research ' + (i + 1) + ': ' + q.q.slice(0, 60),
  }).then(r => ({ question: q.q, budget, answer: r }))
}))

// ---------------------------------------------------------------- report

const settled = results.filter(r => r && r.answer)
const failed = QUESTIONS.length - settled.length

// A finding with no URL is a claim with no source, whatever the agent says about it. It is
// kept in the return so the main loop can see what was claimed, and counted separately so
// nobody pastes it into a plan as a fact.
let unsourced = 0
const overBudget = []
let fetchesTotal = 0
for (const r of settled) {
  for (const f of r.answer.findings || []) if (!String(f.source_url || '').trim()) unsourced += 1
  const used = Number(r.answer.fetches_used) || 0
  fetchesTotal += used
  if (used > r.budget) overBudget.push({ question: r.question, budget: r.budget, used })
}

log(settled.length + ' answered, ' + failed + ' returned nothing, '
  + settled.reduce((n, r) => n + (r.answer.findings || []).length, 0) + ' finding(s), '
  + fetchesTotal + ' fetches used'
  + (unsourced ? ', ' + unsourced + ' UNSOURCED' : '')
  + (overBudget.length ? ', ' + overBudget.length + ' OVER BUDGET' : ''))

return {
  dispatched: QUESTIONS.length,
  answered: settled.length,
  answers: settled.map(r => ({ question: r.question, budget: r.budget, ...r.answer })),
  // Phase 7 reports these. They come from here, not from an impression.
  fetchesUsed: fetchesTotal,
  unsourced,
  // Self-reported overruns. The script cannot enforce the ceiling mid-turn; it can make an
  // overrun impossible to miss.
  overBudget,
  researchIsDone: true,
}
