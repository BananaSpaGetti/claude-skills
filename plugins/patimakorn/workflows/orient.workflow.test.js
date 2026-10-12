// Harness: run orient.workflow.js's body with stubbed runtime globals.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'orient.workflow.js');
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

// The real parallel() resolves a throwing thunk to null rather than rejecting.
const parallel = async (thunks) => Promise.all(thunks.map(t => t().catch(() => null)));

// stub agent: records what it was asked, resolves after a tick; nullIdx returns nothing
function stubAgent(trace, { nullIdx = new Set(), filesFor = () => [], unknownsFor = () => undefined, summaryFor = (i) => 'answer ' + i } = {}) {
  return async (prompt, opts) => {
    const idx = Number((opts.label.match(/orient (\d+)/) || [])[1]);
    trace.push({ ev: 'start', idx, opts, prompt });
    await new Promise(r => setImmediate(r));
    trace.push({ ev: 'end', idx });
    if (nullIdx.has(idx)) return null;
    const r = { files: filesFor(idx), summary: summaryFor(idx) };
    const u = unknownsFor(idx);
    if (u !== undefined) r.unknowns = u;
    return r;
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
  console.log('--- 1. three questions dispatch three Explore agents, concurrently');
  {
    const { out, trace } = await run({ request: 'r', questions: ['a', 'b', 'c'] });
    const starts = trace.filter(t => t.ev === 'start');
    check('3 dispatched', starts.length === 3, String(starts.length));
    check('all start before any ends', trace.findIndex(t => t.ev === 'end') === 3);
    check('reported dispatched=3', out.dispatched === 3);
    check('reported answered=3', out.answered === 3);
  }

  console.log('--- 2. every dispatch is Explore at sonnet with the schema');
  {
    const { trace } = await run({ request: 'r', questions: ['a'] });
    const o = trace[0].opts;
    check('agentType Explore', o.agentType === 'Explore', o.agentType);
    check('model sonnet', o.model === 'sonnet', o.model);
    check('schema present', o.schema && o.schema.type === 'object');
    check('label carries the question', /orient 1: a/.test(o.label), o.label);
  }

  console.log('--- 3. the prompt carries request, question and hints');
  {
    const { trace } = await run({ request: 'port X to C', questions: ['where is X'], hints: ['src/x.py'] });
    const p = trace[0].prompt;
    check('request in prompt', p.includes('port X to C'));
    check('question in prompt', p.includes('where is X'));
    check('hint in prompt', p.includes('src/x.py'));
    check('read-only rule stated', /change nothing/.test(p));
  }

  console.log('--- 4. rejects an empty question list (the floor, as code)');
  {
    const m1 = await expectThrow({ request: 'r', questions: [] });
    check('throws on []', m1 && /questions is empty/.test(m1), m1);
    const m2 = await expectThrow({ request: 'r' });
    check('throws on missing', m2 && /questions is empty/.test(m2), m2);
    const m3 = await expectThrow({ request: 'r', questions: ['   ', ''] });
    check('throws on blank-only', m3 && /questions is empty/.test(m3), m3);
  }

  console.log('--- 5. an agent returning nothing is counted, not hidden');
  {
    const { out } = await run({ request: 'r', questions: ['a', 'b'] }, { nullIdx: new Set([2]) });
    check('dispatched=2', out.dispatched === 2);
    check('answered=1', out.answered === 1, String(out.answered));
    check('the answered one is kept', out.answers.length === 1 && out.answers[0].question === 'a');
  }

  console.log('--- 6. files are unioned across answers, first why wins, no duplicates');
  {
    const filesFor = (i) => i === 1
      ? [{ path: 'a.c', why: 'first' }, { path: 'b.c', why: 'b' }]
      : [{ path: 'a.c', why: 'second' }, { path: 'c.c', why: 'c' }];
    const { out } = await run({ request: 'r', questions: ['a', 'b'] }, { filesFor });
    const paths = out.files.map(f => f.path).sort().join(',');
    check('three distinct files', paths === 'a.c,b.c,c.c', paths);
    check('first why kept for a.c', out.files.find(f => f.path === 'a.c').why === 'first');
  }

  console.log('--- 7. answers carry their question alongside the schema fields');
  {
    const { out } = await run({ request: 'r', questions: ['q1'] });
    check('question echoed', out.answers[0].question === 'q1');
    check('summary present', out.answers[0].summary === 'answer 1');
    check('orientIsDone flag', out.orientIsDone === true);
  }

  console.log('--- 8. a summary with no file and no unknown is counted as unsourced');
  {
    // q1: files, no unknowns -> sourced.  q2: no files, unknowns -> honest gap, not unsourced.
    // q3: no files, no unknowns, summary -> unsourced.  q4: no files, no unknowns, blank -> not.
    const filesFor = (i) => i === 1 ? [{ path: 'a.c', why: 'a' }] : [];
    const unknownsFor = (i) => i === 2 ? ['could not tell'] : undefined;
    const summaryFor = (i) => i === 4 ? '   ' : 'answer ' + i;
    const { out } = await run({ request: 'r', questions: ['q1', 'q2', 'q3', 'q4'] }, { filesFor, unknownsFor, summaryFor });
    check('unsourced is an array', Array.isArray(out.unsourced));
    check('exactly one unsourced', out.unsourced.length === 1, JSON.stringify(out.unsourced));
    check('it is q3', out.unsourced[0] === 'q3', out.unsourced[0]);
    check('sourced answer not flagged', !out.unsourced.includes('q1'));
    check('admitted-unknown answer not flagged', !out.unsourced.includes('q2'));
    check('blank summary not flagged', !out.unsourced.includes('q4'));
    check('all four still counted as answered', out.answered === 4, String(out.answered));
  }

  console.log('--- 9. no unsourced answers gives an empty array, never undefined');
  {
    const { out } = await run({ request: 'r', questions: ['a'] }, { filesFor: () => [{ path: 'x', why: 'y' }] });
    check('empty array', Array.isArray(out.unsourced) && out.unsourced.length === 0);
  }

  console.log('--- 10. model and effort default to sonnet/low and are overridable');
  {
    const d = await run({ request: 'r', questions: ['a'] });
    check('default effort low', d.trace[0].opts.effort === 'low', d.trace[0].opts.effort);
    const o = await run({ request: 'r', questions: ['a'], model: 'haiku', effort: 'medium' });
    check('model override', o.trace[0].opts.model === 'haiku', o.trace[0].opts.model);
    check('effort override', o.trace[0].opts.effort === 'medium', o.trace[0].opts.effort);
  }

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})();
