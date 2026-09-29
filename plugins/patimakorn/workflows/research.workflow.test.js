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

// Stub agent: routes by label prefix. `searchFor(i)` answers searcher i (1-based);
// `readFor(url)` answers the reader for that URL. Either may return null.
function stubAgent(trace, { searchFor, readFor } = {}) {
  const defSearch = (i) => ({ urls: [{ url: 'https://s' + i + '.example/a', why: 'w' }], searches_used: 2 });
  const defRead = (url) => ({ relevant: true, findings: [{ claim: 'c from ' + url, quote: 'q' }] });
  return async (prompt, opts) => {
    const ms = opts.label.match(/^search (\d+)/); const mr = opts.label.match(/^read (\d+)\/(\d+): (.+)$/);
    const kind = ms ? 'search' : 'read';
    const rec = { ev: 'start', kind, opts, prompt };
    if (ms) rec.i = Number(ms[1]);
    trace.push(rec);
    await new Promise(r => setImmediate(r));
    trace.push({ ev: 'end', kind });
    if (ms) return (searchFor || defSearch)(rec.i);
    // recover the full URL from the prompt (the label is truncated)
    const url = (prompt.match(/## The page\n(\S+)/) || [])[1];
    rec.url = url;
    return (readFor || defRead)(url);
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
const starts = (trace, kind) => trace.filter(t => t.ev === 'start' && t.kind === kind);

(async () => {
  console.log('--- 1. two stages: one searcher per question, then one reader per URL');
  {
    const { out, trace } = await run({ request: 'r', questions: ['a', 'b'] });
    check('2 searchers', starts(trace, 'search').length === 2);
    check('2 readers (one URL each)', starts(trace, 'read').length === 2);
    check('all searches end before any read starts', trace.findIndex(t => t.ev === 'start' && t.kind === 'read') > trace.filter(t => t.ev === 'end' && t.kind === 'search').length + 1);
    check('counts reported', out.dispatched === 2 && out.searched === 2 && out.urlsFound === 2 && out.pagesRead === 2);
    check('findings carry source_url and questions', out.findings.length === 2 && out.findings.every(f => f.source_url && f.questions.length === 1));
  }

  console.log('--- 2. searcher inherits the session model at low effort; reader is sonnet at low');
  {
    const { trace } = await run({ request: 'r', questions: ['a'] });
    const s = starts(trace, 'search')[0].opts, r = starts(trace, 'read')[0].opts;
    check('searcher: no model key (inherits)', !('model' in s), JSON.stringify(s.model));
    check('searcher effort low', s.effort === 'low', s.effort);
    check('reader model sonnet', r.model === 'sonnet', r.model);
    check('reader effort low', r.effort === 'low', r.effort);
    check('both general-purpose with a schema', s.agentType === 'general-purpose' && r.agentType === 'general-purpose' && s.schema && r.schema);
  }

  console.log('--- 3. models and effort are overridable per stage');
  {
    const { trace, out } = await run({ request: 'r', questions: ['a'], searchModel: 'sonnet', searchEffort: 'medium', readModel: 'haiku', readEffort: 'medium' });
    const s = starts(trace, 'search')[0].opts, r = starts(trace, 'read')[0].opts;
    check('search override', s.model === 'sonnet' && s.effort === 'medium');
    check('read override', r.model === 'haiku' && r.effort === 'medium');
    check('models echoed in return', out.models.search === 'sonnet' && out.models.read === 'haiku');
  }

  console.log('--- 4. complexity tiers set the budgets in the prompt; default is comparison');
  {
    const { trace } = await run({ request: 'r', questions: [{ q: 'a', complexity: 'simple' }, 'b', { q: 'c', complexity: 'complex' }] });
    const p = (i) => starts(trace, 'search').find(t => t.i === i).prompt;
    check('simple: 4 searches / 4 urls', /at most 4 searches, returning at most 4 URLs/.test(p(1)));
    check('default comparison: 10 / 10', /at most 10 searches, returning at most 10 URLs/.test(p(2)));
    check('complex: 15 / 20', /at most 15 searches, returning at most 20 URLs/.test(p(3)));
    check('start-wide-then-narrow instruction present', /Start wide, then narrow/.test(p(2)));
    check('search-only rule present', /do not call WebFetch/.test(p(2)));
  }

  console.log('--- 5. explicit maxSearches / maxUrls override the tier');
  {
    const { trace } = await run({ request: 'r', questions: [{ q: 'a', complexity: 'simple', maxSearches: 9, maxUrls: 7 }] });
    check('overrides win', /at most 9 searches, returning at most 7 URLs/.test(starts(trace, 'search')[0].prompt));
  }

  console.log('--- 6. a URL surfaced by two questions is read once, findings offered to both');
  {
    const searchFor = () => ({ urls: [{ url: 'https://shared.example/p', why: 'w' }], searches_used: 1 });
    const { out, trace } = await run({ request: 'r', questions: ['a', 'b'] }, { searchFor });
    check('one reader', starts(trace, 'read').length === 1, String(starts(trace, 'read').length));
    check('urlsFound=1', out.urlsFound === 1);
    check('page lists both questions', out.pages[0].questions.join(',') === '1,2', out.pages[0].questions.join(','));
    check('finding offered to both', out.findings[0].questions.join(',') === '1,2');
    check('reader prompt lists both questions', /1\. a\n\s+2\. b/.test(starts(trace, 'read')[0].prompt));
  }

  console.log('--- 7. a reader that tags for_question narrows the attribution');
  {
    const searchFor = () => ({ urls: [{ url: 'https://shared.example/p', why: 'w' }], searches_used: 1 });
    const readFor = () => ({ relevant: true, findings: [{ claim: 'only b', quote: 'q', for_question: 2 }] });
    const { out } = await run({ request: 'r', questions: ['a', 'b'] }, { searchFor, readFor });
    check('attributed to question 2 only', out.findings[0].questions.join(',') === '2');
  }

  console.log('--- 8. the reader stage caps distinct pages at maxPages and says how many it dropped');
  {
    const searchFor = (i) => ({ urls: [1, 2, 3].map(k => ({ url: 'https://q' + i + '.example/' + k, why: 'w' })), searches_used: 1 });
    const { out, trace } = await run({ request: 'r', questions: ['a', 'b'], maxPages: 4 }, { searchFor });
    check('6 found', out.urlsFound === 6);
    check('4 read', starts(trace, 'read').length === 4 && out.pagesRead === 4);
    check('droppedForCap=2', out.droppedForCap === 2, String(out.droppedForCap));
  }

  console.log('--- 9. per-question URL budget truncates a searcher that returns too many');
  {
    const searchFor = () => ({ urls: Array.from({ length: 9 }, (_, k) => ({ url: 'https://x.example/' + k, why: 'w' })), searches_used: 1 });
    const { out } = await run({ request: 'r', questions: [{ q: 'a', complexity: 'simple' }] }, { searchFor });
    check('simple tier keeps 4 of 9', out.urlsFound === 4, String(out.urlsFound));
  }

  console.log('--- 10. over-budget searches are reported, not hidden');
  {
    const searchFor = (i) => ({ urls: [{ url: 'https://u' + i + '.example', why: 'w' }], searches_used: i === 2 ? 12 : 3 });
    const { out } = await run({ request: 'r', questions: [{ q: 'a', complexity: 'simple' }, { q: 'b', complexity: 'simple' }] }, { searchFor });
    check('one over budget', out.overBudget.length === 1 && out.overBudget[0].question === 'b' && out.overBudget[0].used === 12 && out.overBudget[0].budget === 4, JSON.stringify(out.overBudget));
    check('searchesUsed summed', out.searchesUsed === 15);
  }

  console.log('--- 11. a searcher with no URLs is listed in noSources and spawns no reader');
  {
    const searchFor = (i) => ({ urls: i === 1 ? [] : [{ url: 'https://ok.example', why: 'w' }], searches_used: 1 });
    const { out, trace } = await run({ request: 'r', questions: ['a', 'b'] }, { searchFor });
    check('noSources names a', out.noSources.length === 1 && out.noSources[0] === 'a');
    check('one reader only', starts(trace, 'read').length === 1);
  }

  console.log('--- 12. dead agents are counted in both stages, never hidden');
  {
    const searchFor = (i) => i === 1 ? null : { urls: [{ url: 'https://a.example', why: 'w' }, { url: 'https://b.example', why: 'w' }], searches_used: 1 };
    const readFor = (url) => url === 'https://b.example' ? null : { relevant: true, findings: [] };
    const { out } = await run({ request: 'r', questions: ['a', 'b'] }, { searchFor, readFor });
    check('searched=1 of 2', out.searched === 1);
    check('pagesRead=1 of 2', out.pagesRead === 1);
    check('unreadable names b', out.unreadable.length === 1 && out.unreadable[0] === 'https://b.example');
  }

  console.log('--- 13. a finding with no quote is counted as unquoted; irrelevant pages counted');
  {
    const readFor = (url) => ({ relevant: false, findings: [{ claim: 'x', quote: '' }, { claim: 'y', quote: '  ' }, { claim: 'z', quote: 'real' }], note: 'paywalled' });
    const { out } = await run({ request: 'r', questions: ['a'] }, { readFor });
    check('unquoted=2', out.unquoted === 2, String(out.unquoted));
    check('all three findings still returned', out.findings.length === 3);
    check('page marked not relevant, note kept', out.pages[0].relevant === false && out.pages[0].note === 'paywalled');
  }

  console.log('--- 14. rejects an empty or blank question list');
  {
    const m1 = await expectThrow({ request: 'r', questions: [] });
    check('throws on []', m1 && /questions is empty/.test(m1), m1);
    const m2 = await expectThrow({ request: 'r', questions: ['  ', { q: '' }, { nope: 1 }] });
    check('throws on blank-only', m2 && /questions is empty/.test(m2), m2);
  }

  console.log('--- 15. no pages found at all -> no reader stage, empty results, still done');
  {
    const searchFor = () => ({ urls: [], searches_used: 1 });
    const { out, trace } = await run({ request: 'r', questions: ['a'] }, { searchFor });
    check('zero readers', starts(trace, 'read').length === 0);
    check('empty findings, done flag', out.findings.length === 0 && out.researchIsDone === true);
  }

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})();
