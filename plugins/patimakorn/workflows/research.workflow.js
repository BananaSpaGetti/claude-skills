export const meta = {
  name: 'anvil-research',
  description: 'Answer the research questions a plan needs from outside the repository, in two stages: one searcher per question that returns URLs, then one reader per URL that returns cited findings. No page is ever re-read.',
  whenToUse: 'Phase 2 of /patimakorn:anvil, for facts that live on the web or in documentation rather than in the repository. The main loop composes the questions and says how hard each is; this script shapes the work so breadth costs linear, not quadratic.',
  phases: [
    { title: 'Search', detail: 'one searcher per question, URLs only' },
    { title: 'Read', detail: 'one reader per URL, findings with quotes' },
  ],
}

// Why two stages, measured on 2026-09-29. A single research agent made 116 web calls on one
// question, reached 51 distinct domains with zero repeats, and returned 5k tokens of findings.
// It cost 34M cache-read tokens, because every fetched page stayed in its context and was
// re-read on every later turn: cost grew with the square of the fetch count. A cap on fetches
// would have cut real sources -- the new-domain rate was flat from fetch 1 to fetch 116. So
// the cap is not on breadth. It is on context: a searcher that never holds a page body, and a
// reader that holds exactly one page and then ends. Breadth is unchanged; cost is linear.
//
// The shape and the numbers follow Anthropic's own account of its research system
// (anthropic.com/engineering/multi-agent-research-system): subagents explore and return a
// condensed result; a lead spawns 3-5 in parallel; effort is scaled to the question --
// "1 agent with 3-10 tool calls" for a simple fact, "2-4 subagents with 10-15 calls each" for
// a comparison, "more than 10 subagents" for complex research -- because "overinvestment in
// straightforward queries was a common failure mode". Five 116-call sweeps on one plan is that
// failure mode. So every question carries a `complexity` and the budgets come from it.
//
// Model choice follows the cost-optimization reference shipped with the claude-api skill,
// which puts a model swap last, after effort: on research work `low` effort gave up 1-3
// points for a third to a half off, and a frontier model at `low` beat the mid tier on deep
// research at ~10% less per task. So the searcher -- the stage that judges which sources are
// worth reading, on a context that never holds a page -- defaults to the session's frontier
// model at low effort, and the reader -- pure extraction whose output is checkable, the
// verbatim quote must be on the page -- defaults to `haiku` at low: the owner's rule is that
// haiku reads files, and one page per context with a quote to check is the shape that rule
// fits. The reference's case against haiku (knowledge questions, long agentic loops) does not
// describe a reader. `unquoted` below is the check; a run that shows it climbing sets
// `readModel: "sonnet"`. Both models are arguments.
//
// Same runtime constraints as the sibling scripts: no filesystem, no Date/Math.random.

// ---------------------------------------------------------------- contracts

const SEARCH_SCHEMA = {
  type: 'object',
  required: ['urls', 'searches_used'],
  additionalProperties: false,
  properties: {
    urls: {
      type: 'array',
      items: {
        type: 'object',
        required: ['url', 'why'],
        additionalProperties: false,
        properties: {
          url: { type: 'string', description: 'A page worth reading in full. Primary sources first: the vendor, the standard, the paper, the filing.' },
          why: { type: 'string', description: 'One line: what this page is expected to settle.' },
        },
      },
      description: 'Pages worth reading, most useful first. The reader stage opens each one; you open none.',
    },
    unknowns: {
      type: 'array',
      items: { type: 'string' },
      description: 'What the question asked that no search result seemed to cover. Omit if nothing.',
    },
    searches_used: { type: 'integer', description: 'How many WebSearch calls were made. Counted honestly.' },
  },
}

const READ_SCHEMA = {
  type: 'object',
  required: ['findings', 'relevant'],
  additionalProperties: false,
  properties: {
    relevant: { type: 'boolean', description: 'False if the page turned out not to bear on any of the questions, or could not be read.' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'quote'],
        additionalProperties: false,
        properties: {
          claim: { type: 'string', description: 'One fact, one sentence. A number carries its unit and its date.' },
          quote: { type: 'string', description: 'The sentence on the page the claim rests on, verbatim. A claim you cannot quote is not on the page.' },
          for_question: { type: 'integer', description: '1-based index of the question this bears on, if the page was surfaced for more than one.' },
        },
      },
      description: 'Every fact on this page that bears on the questions. Empty if none, or if not relevant.',
    },
    note: { type: 'string', description: 'Anything the reader should know: the page is a summary of another, a date is missing, a figure is disputed on the page itself. Omit if nothing.' },
  },
}

// ---------------------------------------------------------------- input

const IN = args || {}
const QUESTIONS = (Array.isArray(IN.questions) ? IN.questions : [])
  .map(q => typeof q === 'string' ? { q } : (q && typeof q.q === 'string' ? q : null))
  .filter(q => q && q.q.trim())

if (!QUESTIONS.length) {
  throw new Error('anvil-research: args.questions is empty. Pass the frontier questions whose answers live outside the repository; a question that lives inside it belongs to the orient script.')
}

// Budgets by complexity. The search counts are Anthropic's published per-agent call ranges;
// the URL counts are what those searches can reasonably surface for one reader stage.
const TIERS = {
  simple:     { searches: 4,  urls: 4  },   // one fact: "1 agent with 3-10 tool calls"
  comparison: { searches: 10, urls: 10 },   // a few sources side by side: "10-15 calls each"
  complex:    { searches: 15, urls: 20 },   // a landscape: many sources, divided by question
}
const tierOf = (q) => TIERS[q.complexity] || TIERS[IN.complexity] || TIERS.comparison
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d }
const budgetOf = (q) => {
  const t = tierOf(q)
  return { searches: num(q.maxSearches != null ? q.maxSearches : IN.maxSearches, t.searches),
           urls:     num(q.maxUrls     != null ? q.maxUrls     : IN.maxUrlsPerQuestion, t.urls) }
}
const MAX_PAGES = num(IN.maxPages, 60)                   // across the run, enforced here before reading

// Models and effort per stage. `undefined` model means inherit the session's -- the frontier
// model, which is what the searcher wants. See the header for why.
const SEARCH_MODEL  = IN.searchModel  || undefined
const SEARCH_EFFORT = IN.searchEffort || 'low'
const READ_MODEL    = IN.readModel    || 'haiku'
const READ_EFFORT   = IN.readEffort   || 'low'

// ---------------------------------------------------------------- stage 1: search

function searchPrompt(q, i, b) {
  const lines = [
    'You are finding the pages a plan will need, for one question. You SEARCH ONLY. You do not',
    'open, fetch, or read any page -- a separate reader will open each URL you return, so a page',
    'you fetch here is a page paid for twice. Use WebSearch; do not call WebFetch.',
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
    '## Budget: at most ' + b.searches + ' searches, returning at most ' + b.urls + ' URLs',
    'Start wide, then narrow: one or two short, broad queries first, read what the results',
    'landscape looks like, then spend the rest on the specific gaps. Run independent searches in',
    'parallel in one turn rather than one per turn. Report the count in `searches_used`, exactly.',
    '',
    '## Rules',
    '- Return up to ' + b.urls + ' URLs, most useful first. Prefer primary sources; a blog quoting a',
    '  number is a lead to the page that has the number -- return that page if the snippet shows it.',
    '- Every URL must have appeared in a search result you saw. Do not construct one.',
    '- If the search results do not cover part of the question, say so in `unknowns`. An honest',
    '  gap is worth more than a URL that might have it.',
    '- This is retrieval, not judgement. Do not answer the question yourself.'
  )
  return lines.join('\n')
}

phase('Search')
log('searching: ' + QUESTIONS.length + ' question(s), one searcher each, no page bodies')

const searched = await parallel(QUESTIONS.map((q, i) => () => {
  const b = budgetOf(q)
  const opts = {
    agentType: 'general-purpose',
    effort: SEARCH_EFFORT,
    phase: 'Search',
    schema: SEARCH_SCHEMA,
    label: 'search ' + (i + 1) + ': ' + q.q.slice(0, 60),
  }
  if (SEARCH_MODEL) opts.model = SEARCH_MODEL
  return agent(searchPrompt(q, i, b), opts).then(r => ({ i, question: q.q, budget: b, answer: r }))
}))

// Barrier, and it is the justified kind: the reader stage must not open the same URL twice, and
// knowing that needs every searcher's list at once. A page that two questions both surfaced is
// read once and its findings are offered to both.
const searchOk = searched.filter(s => s && s.answer)
const byUrl = new Map()
let searchesTotal = 0
const noSources = []
const overBudget = []
for (const s of searchOk) {
  const used = Number(s.answer.searches_used) || 0
  searchesTotal += used
  if (used > s.budget.searches) overBudget.push({ question: s.question, budget: s.budget.searches, used })
  const list = (s.answer.urls || []).filter(u => u && typeof u.url === 'string' && u.url.trim()).slice(0, s.budget.urls)
  if (!list.length) noSources.push(s.question)
  for (const u of list) {
    const key = u.url.trim()
    const e = byUrl.get(key) || { url: key, why: u.why, questions: [] }
    if (!e.questions.includes(s.i + 1)) e.questions.push(s.i + 1)
    byUrl.set(key, e)
  }
}
let pages = [...byUrl.values()]
const droppedForCap = Math.max(0, pages.length - MAX_PAGES)
if (droppedForCap) {
  log('page cap: ' + pages.length + ' distinct URLs, reading the first ' + MAX_PAGES + ' by search rank; ' + droppedForCap + ' dropped -- raise maxPages if breadth matters here')
  pages = pages.slice(0, MAX_PAGES)
}
log('search done: ' + searchOk.length + '/' + QUESTIONS.length + ' answered, ' + searchesTotal + ' searches, ' + pages.length + ' distinct page(s) to read'
  + (overBudget.length ? ', ' + overBudget.length + ' OVER BUDGET' : ''))

// ---------------------------------------------------------------- stage 2: read

function readPrompt(p) {
  const qs = p.questions.map(n => '  ' + n + '. ' + QUESTIONS[n - 1].q)
  return [
    'You are reading ONE page for a plan that has not been written yet, and extracting every fact',
    'on it that bears on the questions below. Fetch that page and nothing else: no searches, no',
    'other URLs, no following links. When the page is read, answer and stop.',
    '',
    '## The page',
    p.url,
    'Surfaced because: ' + (p.why || '(no reason recorded)'),
    '',
    '## The questions it was surfaced for',
    ...qs,
    '',
    '## Rules',
    '- Every claim carries a verbatim quote from the page. A claim you cannot quote is not on the',
    '  page and does not go in `findings`.',
    '- Numbers carry units and dates. "capacity 500" is not a finding; "500 t/day, 2024 figure" is.',
    '- If the page could not be fetched, is paywalled, or does not bear on the questions, set',
    '  `relevant` to false and say why in `note`. Do not go looking for a substitute.',
    '- Extract; do not conclude. Whether the source is trustworthy is decided later, with the quote',
    '  in front of the person deciding.',
  ].join('\n')
}

phase('Read')
log('reading: ' + pages.length + ' page(s), one reader each, one page per context')

const read = pages.length ? await parallel(pages.map((p, k) => () =>
  agent(readPrompt(p), {
    agentType: 'general-purpose',
    model: READ_MODEL,
    effort: READ_EFFORT,
    phase: 'Read',
    schema: READ_SCHEMA,
    label: 'read ' + (k + 1) + '/' + pages.length + ': ' + p.url.replace(/^https?:\/\//, '').slice(0, 50),
  }).then(r => ({ page: p, answer: r }))
)) : []

// ---------------------------------------------------------------- report

const results = []
const unreadable = []
let irrelevant = 0
for (let k = 0; k < pages.length; k++) {
  const r = read[k]
  if (!r || !r.answer) { unreadable.push(pages[k].url); continue }
  if (r.answer.relevant === false) irrelevant += 1
  results.push({ url: r.page.url, questions: r.page.questions, relevant: r.answer.relevant !== false,
                 findings: r.answer.findings || [], note: r.answer.note })
}

// A finding with an empty quote is a claim the reader could not point at on the page it was
// given. The schema requires the field; it cannot require it to be non-empty.
let unquoted = 0
const findings = []
for (const p of results) {
  for (const f of p.findings) {
    if (!String(f.quote || '').trim()) unquoted += 1
    findings.push({ claim: f.claim, quote: f.quote, source_url: p.url,
                    questions: f.for_question ? [f.for_question] : p.questions })
  }
}

log('read done: ' + results.length + '/' + pages.length + ' pages returned, ' + findings.length + ' finding(s), '
  + irrelevant + ' page(s) irrelevant, ' + unreadable.length + ' unreadable'
  + (unquoted ? ', ' + unquoted + ' UNQUOTED' : ''))

return {
  dispatched: QUESTIONS.length,
  searched: searchOk.length,
  searchesUsed: searchesTotal,
  // Searchers that reported more searches than their tier allowed. Self-reported; visible.
  overBudget,
  urlsFound: byUrl.size,
  pagesRead: results.length,
  droppedForCap,
  // Questions whose searcher returned no URL at all. Not an error; a fact to put to the user.
  noSources,
  // Every page, with what it yielded. `questions` is 1-based into args.questions.
  pages: results,
  // Flat, for pasting: each finding with the URL it came from and the quote it rests on.
  findings,
  unreadable,
  // Findings whose reader gave no quote. Treat as unsourced: do not paste into the plan.
  unquoted,
  models: { search: SEARCH_MODEL || 'inherited', searchEffort: SEARCH_EFFORT, read: READ_MODEL, readEffort: READ_EFFORT },
  researchIsDone: true,
}
