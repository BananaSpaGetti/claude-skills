// Harness: run research.workflow.js's body with stubbed runtime globals.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'research.workflow.js');
const body = fs.readFileSync(SRC, 'utf8').replace(/^export const meta/m, 'const meta');

function makeRunner() {
  return new Function(
    'args', 'agent', 'parallel', 'pipeline', 'phase', 'log', 'budget', 'workflow',
    '"use strict"; return (async () => {\n' + body + '\n})();'
  );
}
const wf = makeRunner();

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
  if (cond) { PASS++; console.log('  PASS ' + name); }
  else { FAIL++; console.log('  FAIL ' + name + (extra ? '  <- ' + extra : '')); }
}

const parallel = async (thunks) => Promise.all(thunks.map(t => t().catch(() => null)));

// stub agent: records what it was asked; per-index answer shaping
function stubAgent(trace, { nullIdx = new Set(), answerFor = () => ({ findings: [{ claim: 'c', source_url: 'https://x' }], fetches_used: 3 }) } = {}) {
  return async (prompt, opts) => {
    const idx = Number((opts.label.match(/research (\d+)/) || [])[1]);
    trace.push({ ev: 'start', idx, opts, prompt });
    await new Promise(r => setImmediate(r));
    trace.push({ ev: 'end', idx });
    if (nullIdx.has(idx)) return null;
    return answerFor(idx);
  };
}

const noop = () => {};
async function run(args, agentOpts) {
  const trace = [];
  const out = await wf(args, stubAgent(trace, agentOpts), parallel, null, noop, noop, null, null);
  return { out, trace };
}
async function expectThrow(args) {
  try { await run(args); return null; }
  catch (e) { return e.message; }
}

(async () => {
  console.log('--- 1. every dispatch is general-purpose at sonnet, medium effort, with the schema');
  {
    const { out, trace } = await run({ request: 'r', questions: ['a', 'b'] });
    const o = trace[0].opts;
    check('agentType general-purpose', o.agentType === 'general-purpose', o.agentType);
    check('model sonnet (never inherited)', o.model === 'sonnet', o.model);
    check('effort medium', o.effort === 'medium', o.effort);
    check('schema present', o.schema && o.schema.type === 'object');
    check('2 dispatched, concurrently', out.dispatched === 2 && trace.findIndex(t => t.ev === 'end') === 2);
  }

  console.log('--- 2. the prompt carries the budget number, and the default is 25');
  {
    const { trace } = await run({ request: 'r', questions: ['a'] });
    const p = trace[0].prompt;
    check('default budget 25 in prompt', /at most 25 web searches and fetches/.test(p));
    check('stop instruction present', /When you reach 25, stop/.test(p));
    check('URL-per-claim rule stated', /carries the URL/.test(p));
  }

  console.log('--- 3. budget is overridable per question and globally');
  {
    const { trace, out } = await run({ request: 'r', maxFetches: 10, questions: ['a', { q: 'b', maxFetches: 40 }] });
    check('global override reaches q1', /at most 10 web/.test(trace.find(t => t.idx === 1).prompt));
    check('per-question override wins for q2', /at most 40 web/.test(trace.find(t => t.idx === 2).prompt));
    check('budget echoed in answers', out.answers[0].budget === 10 && out.answers[1].budget === 40);
  }

  console.log('--- 4. rejects an empty or blank question list');
  {
    const m1 = await expectThrow({ request: 'r', questions: [] });
    check('throws on []', m1 && /questions is empty/.test(m1), m1);
    const m2 = await expectThrow({ request: 'r', questions: ['  ', { q: '' }, { nope: 1 }] });
    check('throws on blank-only', m2 && /questions is empty/.test(m2), m2);
  }

  console.log('--- 5. a finding with no source_url is counted as unsourced, kept in answers');
  {
    const answerFor = (i) => i === 1
      ? { findings: [{ claim: 'sourced', source_url: 'https://a' }, { claim: 'bare', source_url: '' }, { claim: 'bare2', source_url: '   ' }], fetches_used: 2 }
      : { findings: [{ claim: 'ok', source_url: 'https://b' }], unknowns: ['x'], fetches_used: 1 };
    const { out } = await run({ request: 'r', questions: ['a', 'b'] }, { answerFor });
    check('unsourced=2', out.unsourced === 2, String(out.unsourced));
    check('all findings still returned', out.answers[0].findings.length === 3);
    check('fetches summed', out.fetchesUsed === 3, String(out.fetchesUsed));
  }

  console.log('--- 6. an agent that reports more fetches than its budget is listed as over budget');
  {
    const answerFor = (i) => ({ findings: [], fetches_used: i === 2 ? 31 : 25 });
    const { out } = await run({ request: 'r', questions: ['a', 'b'] }, { answerFor });
    check('one over budget', out.overBudget.length === 1, JSON.stringify(out.overBudget));
    check('names the question and both numbers', out.overBudget[0].question === 'b' && out.overBudget[0].budget === 25 && out.overBudget[0].used === 31);
    check('exactly at budget is not over', !out.overBudget.some(o => o.question === 'a'));
  }

  console.log('--- 7. an agent returning nothing is counted, not hidden');
  {
    const { out } = await run({ request: 'r', questions: ['a', 'b'] }, { nullIdx: new Set([2]) });
    check('dispatched=2 answered=1', out.dispatched === 2 && out.answered === 1);
    check('the answered one is kept', out.answers.length === 1 && out.answers[0].question === 'a');
    check('researchIsDone flag', out.researchIsDone === true);
  }

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})();
