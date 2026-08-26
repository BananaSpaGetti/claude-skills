export const meta = {
  name: 'council',
  description: 'Convene five advisors with distinct lenses, peer-review them anonymously, force a debate when consensus looks too clean, then synthesize a verdict that preserves dissent.',
  whenToUse: 'Decisions that are expensive to reverse: architecture, schema, dependency choice, migration, product direction.',
  phases: [
    { title: 'Opinions', detail: 'five advisors answer independently' },
    { title: 'Peer review', detail: 'each advisor critiques the anonymized others' },
    { title: 'Debate', detail: 'only when agreement looks suspiciously clean' },
    { title: 'Verdict', detail: 'chairman synthesizes and records dissent' },
  ],
}

// ---------------------------------------------------------------- advisors

const LENSES = [
  {
    id: 'architect',
    brief: `You are THE ARCHITECT. Judge this by what it forces to be true later.
Where does it couple things that should stay separate? What becomes expensive to
change once this ships? Prefer deep modules behind narrow seams. You are allowed
to say the whole framing is wrong.`,
  },
  {
    id: 'skeptic',
    brief: `You are THE SKEPTIC. Your job is to find how this fails, not to be fair.
Name the concrete failure: the input, the state, the race, the scale at which it
breaks. Surface assumptions the proposal treats as settled but never verified.
An objection you cannot make concrete is not an objection - drop it.`,
  },
  {
    id: 'pragmatist',
    brief: `You are THE PRAGMATIST. Optimize for shipping something correct this week.
What is the smallest version that delivers the actual value? Which of the proposed
work is speculative generality? If the plan is already the simple thing, say so
plainly instead of inventing a cheaper-but-worse alternative.`,
  },
  {
    id: 'researcher',
    brief: `You are THE RESEARCHER. Find prior art before reasoning from scratch.
Search the codebase and the web for how this problem was already solved, which
libraries or built-in features cover it, and where others hit walls. Cite what you
actually found. Distinguish "I verified this" from "a blog claims this".`,
  },
  {
    id: 'contrarian',
    brief: `You are THE CONTRARIAN. Steelman the option the proposal rejected or never
considered - including "do nothing" and "delete this instead". Argue it as its best
advocate would, not as a strawman. If after honest effort the original really is
better, say that explicitly and explain what convinced you.`,
  },
]

const OPINION_SCHEMA = {
  type: 'object',
  required: ['position', 'reasoning', 'risks', 'confidence'],
  additionalProperties: false,
  properties: {
    position: { type: 'string', description: 'The recommendation in one or two sentences.' },
    reasoning: { type: 'string', description: 'Why, grounded in what you actually read or found.' },
    risks: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string' },
      description: 'Concrete failure modes of your own recommendation.',
    },
    evidence: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string' },
      description: 'file:line refs, URLs, command output. Empty if you verified nothing.',
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['critiques', 'strongest', 'weakest', 'revisedPosition', 'changedMind'],
  additionalProperties: false,
  properties: {
    critiques: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        required: ['advisor', 'objection'],
        additionalProperties: false,
        properties: {
          advisor: { type: 'string', description: 'The anonymous label, e.g. "Advisor C".' },
          objection: { type: 'string' },
        },
      },
    },
    strongest: { type: 'string', description: 'Anonymous label of the best argument, and why.' },
    weakest: { type: 'string', description: 'Anonymous label of the weakest argument, and why.' },
    revisedPosition: { type: 'string', description: 'Your position after reading the others.' },
    changedMind: { type: 'boolean' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['verdict', 'rationale', 'dissent', 'nextSteps', 'confidence'],
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', description: 'The decision, stated so it can be acted on.' },
    rationale: { type: 'string' },
    dissent: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        required: ['view', 'heldBy', 'wouldWinIf'],
        additionalProperties: false,
        properties: {
          view: { type: 'string' },
          heldBy: { type: 'string' },
          wouldWinIf: { type: 'string', description: 'The condition under which this minority view is right.' },
        },
      },
    },
    nextSteps: { type: 'array', maxItems: 6, items: { type: 'string' } },
    openQuestions: { type: 'array', maxItems: 5, items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
}

// ---------------------------------------------------------------- input

const QUESTION = typeof args === 'string' ? args : (args && args.question) || ''
const CONTEXT = (args && args.context) || ''

if (!QUESTION) {
  throw new Error('council: no question supplied. Pass args as a string, or as {question, context}.')
}

const ANON = ['Advisor A', 'Advisor B', 'Advisor C', 'Advisor D', 'Advisor E']

// Anonymize so peers judge arguments rather than lenses. Every advisor sees the
// same letter mapping; an advisor may recognize its own prose, which is fine -
// the bias being guarded against is deferring to a lens, not self-recognition.
function anonymize(opinions, excludeIndex) {
  return opinions
    .map((o, i) =>
      i === excludeIndex || !o
        ? null
        : `### ${ANON[i]}
Position: ${o.position}
Reasoning: ${o.reasoning}
Risks: ${(o.risks || []).join('; ') || 'none stated'}
Evidence: ${(o.evidence || []).join('; ') || 'none cited'}
Self-rated confidence: ${o.confidence}`
    )
    .filter(Boolean)
    .join('\n\n')
}

const preamble = `## Question put to the council

${QUESTION}
${CONTEXT ? `\n## Context supplied\n\n${CONTEXT}\n` : ''}`

// ---------------------------------------------------------------- 1. opinions

phase('Opinions')
log(`Convening five advisors on: ${QUESTION.slice(0, 90)}${QUESTION.length > 90 ? '...' : ''}`)

const opinions = await parallel(
  LENSES.map((lens) => () =>
    agent(
      `${preamble}
## Your lens

${lens.brief}

## How to answer

Investigate before opining - read the relevant files, grep the codebase, search the
web where prior art would settle it. Ground every claim in something you actually
saw, and say so when you did not verify a claim.

Answer only through your lens. Do not hedge toward the middle to sound balanced;
the council gets its balance from five lenses disagreeing, not from each advisor
being agreeable. Being wrong in an interesting, checkable way is more useful here
than being vaguely right.`,
      { label: `advise:${lens.id}`, phase: 'Opinions', schema: OPINION_SCHEMA }
    )
  )
)

const live = opinions.map((o, i) => (o ? { ...o, lens: LENSES[i].id, anon: ANON[i] } : null))
const liveCount = live.filter(Boolean).length

if (liveCount < 3) {
  log(`Only ${liveCount}/5 advisors returned - too few for a council. Reporting what came back.`)
  return { question: QUESTION, degraded: true, opinions: live.filter(Boolean) }
}
if (liveCount < 5) log(`${5 - liveCount} advisor(s) failed; continuing with ${liveCount}.`)

// ---------------------------------------------------------------- 2. peer review

phase('Peer review')

const reviews = await parallel(
  LENSES.map((lens, i) => () => {
    if (!live[i]) return Promise.resolve(null)
    return agent(
      `${preamble}
## Your lens

${lens.brief}

## Your own position was

${live[i].position}

## The other advisors said (identities withheld)

${anonymize(live, i)}

## Your task

Critique each of them on the merits. Attack the reasoning, not the framing they
chose. Where someone found evidence you did not have, weigh it honestly - and if
it moves you, revise your position and set changedMind to true. Refusing to move
when the evidence is against you is not integrity, it is noise.`,
      { label: `review:${lens.id}`, phase: 'Peer review', schema: REVIEW_SCHEMA }
    )
  })
)

const revised = live.map((o, i) =>
  o
    ? {
        ...o,
        revisedPosition: (reviews[i] && reviews[i].revisedPosition) || o.position,
        changedMind: !!(reviews[i] && reviews[i].changedMind),
      }
    : null
)

// ---------------------------------------------------------------- 3. anti-groupthink

phase('Debate')

// Clean consensus after peer review is the failure mode this council exists to
// catch: five agents converging because they share a prior, not because the
// answer is easy. Nobody moving AND everyone confident is the tell.
const seated = revised.filter(Boolean)
const nobodyMoved = seated.every((o) => !o.changedMind)
const allConfident = seated.every((o) => (o.confidence || 0) >= 0.75)
const suspiciouslyClean = nobodyMoved && allConfident

let debate = null

if (suspiciouslyClean) {
  log('Consensus with zero mind-changing and uniform high confidence - forcing a debate round.')
  const consensusText = seated.map((o) => `- ${o.anon}: ${o.revisedPosition}`).join('\n')

  debate = (
    await parallel([
      () =>
        agent(
          `${preamble}
## The council converged on this, with nobody changing their mind

${consensusText}

## Your task

That is the shape of groupthink, so assume the consensus is wrong and find out how.
What shared assumption do all five advisors hold without checking? What evidence
would falsify the consensus - and can you go find it? Read the code, search the web.
Report the strongest available case against the consensus. If after real effort the
consensus survives, say so and name what specifically failed to break it.`,
          { label: 'debate:breaker', phase: 'Debate' }
        ),
      () =>
        agent(
          `${preamble}
## The council converged on this

${consensusText}

## Your task

Find the context in which this consensus is the WRONG answer. Scale, team size,
deadline, existing tech debt, regulatory constraint, who maintains it in a year.
Be concrete about the boundary: at what point does the recommendation flip?`,
          { label: 'debate:boundary', phase: 'Debate' }
        ),
    ])
  ).filter(Boolean)
} else {
  log(
    nobodyMoved
      ? 'Confidence is uneven - genuine uncertainty, no forced debate.'
      : 'Advisors moved during peer review - real deliberation happened.'
  )
}

// ---------------------------------------------------------------- 4. verdict

phase('Verdict')

const dossier = seated
  .map(
    (o) => `### ${o.anon} (lens: ${o.lens})
Initial: ${o.position}
After peer review: ${o.revisedPosition}${o.changedMind ? ' [CHANGED MIND]' : ''}
Risks named: ${(o.risks || []).join('; ') || 'none'}
Evidence: ${(o.evidence || []).join('; ') || 'none cited'}
Confidence: ${o.confidence}`
  )
  .join('\n\n')

const critiques = reviews
  .map((r, i) =>
    r
      ? `From ${ANON[i]}: strongest = ${r.strongest} | weakest = ${r.weakest}
${(r.critiques || []).map((c) => `  - vs ${c.advisor}: ${c.objection}`).join('\n')}`
      : null
  )
  .filter(Boolean)
  .join('\n\n')

const verdict = await agent(
  `${preamble}
## Advisor positions

${dossier}

## Peer critiques

${critiques}
${debate && debate.length ? `\n## Forced debate (the consensus looked like groupthink)\n\n${debate.join('\n\n---\n\n')}\n` : ''}
## Your task: chair this council

Deliver a verdict the user can act on today. Not a summary, not "it depends" -
a decision, with the reasoning that actually drove it.

Rules:
- Weigh arguments by evidence, not by how many advisors held them. A lone advisor
  with a file:line reference beats four with intuitions.
- Preserve dissent. For each minority view worth keeping, record the condition
  under which it would have been the right call. That condition is what the user
  should watch for.
- Say what is still unknown. Do not launder uncertainty into a confident verdict.
- If the council was wrong to converge, overrule it and say so.`,
  { label: 'chairman', phase: 'Verdict', schema: VERDICT_SCHEMA }
)

return {
  question: QUESTION,
  forcedDebate: !!debate,
  verdict,
  advisors: seated.map((o) => ({
    lens: o.lens,
    position: o.position,
    revisedPosition: o.revisedPosition,
    changedMind: o.changedMind,
    confidence: o.confidence,
  })),
}
