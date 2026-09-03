// Harness: run execute.workflow.js's body with stubbed runtime globals.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'execute.workflow.js');
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

// stub agent: records start/end order, resolves after a tick, fails ids in failSet
function stubAgent(trace, failSet) {
  return async (prompt, opts) => {
    const id = (opts.label.match(/task ([^:\s]+)/) || [])[1];
    trace.push({ ev: 'start', id, at: trace.length });
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    trace.push({ ev: 'end', id, at: trace.length });
    if (failSet.has(id)) return { filesTouched: [], verifyCommand: 'x', verifyStdout: 'boom', passed: false, summary: 'failed' };
    return { filesTouched: ['a.txt'], verifyCommand: 'cat a.txt', verifyStdout: 'ok', passed: true, summary: 'done' };
  };
}

const noop = () => {};
async function run(tasks, failIds = []) {
  const trace = [];
  const out = await wf(
    { goal: 'g', context: 'c', tasks },
    stubAgent(trace, new Set(failIds)),
    null, null, noop, noop, null, null
  );
  return { out, trace };
}
async function expectThrow(tasks) {
  try { await run(tasks); return null; }
  catch (e) { return e.message; }
}

(async () => {
  console.log('--- 1. linear chain 1 -> 2 -> 3 runs in order, never concurrently');
  {
    const { out, trace } = await run([
      { id: 1, title: 'a', blockedBy: [], risk: 'none' },
      { id: 2, title: 'b', blockedBy: [1], risk: 'none' },
      { id: 3, title: 'c', blockedBy: [2], risk: 'none' },
    ]);
    const order = trace.filter(t => t.ev === 'start').map(t => t.id).join(',');
    check('start order is 1,2,3', order === '1,2,3', order);
    // no overlap: each end precedes the next start
    const seq = trace.map(t => t.ev[0] + t.id).join(' ');
    check('no overlap', seq === 's1 e1 s2 e2 s3 e3', seq);
    check('all 3 passed', out.passed.length === 3, JSON.stringify(out.passed.length));
  }

  console.log('--- 2. diamond 1 -> (2,3) -> 4 runs 2 and 3 concurrently');
  {
    const { out, trace } = await run([
      { id: 1, title: 'a', blockedBy: [], risk: 'none' },
      { id: 2, title: 'b', blockedBy: [1], risk: 'none' },
      { id: 3, title: 'c', blockedBy: [1], risk: 'none' },
      { id: 4, title: 'd', blockedBy: [2, 3], risk: 'none' },
    ]);
    const s2 = trace.findIndex(t => t.ev === 'start' && t.id === '2');
    const e2 = trace.findIndex(t => t.ev === 'end' && t.id === '2');
    const s3 = trace.findIndex(t => t.ev === 'start' && t.id === '3');
    check('2 and 3 overlap', s3 < e2 && s3 > s2, 's2=' + s2 + ' s3=' + s3 + ' e2=' + e2);
    const s4 = trace.findIndex(t => t.ev === 'start' && t.id === '4');
    check('4 starts after both 2 and 3 end', s4 > trace.findIndex(t => t.ev === 'end' && t.id === '3') && s4 > e2, 's4=' + s4);
    check('all 4 passed', out.passed.length === 4);
  }

  console.log('--- 3. independent tasks all start before any finishes');
  {
    const { trace } = await run([
      { id: 1, blockedBy: [], risk: 'none' },
      { id: 2, blockedBy: [], risk: 'none' },
      { id: 3, blockedBy: [], risk: 'none' },
    ]);
    const firstEnd = trace.findIndex(t => t.ev === 'end');
    const startsBefore = trace.slice(0, firstEnd).filter(t => t.ev === 'start').length;
    check('3 concurrent starts', startsBefore === 3, 'got ' + startsBefore);
  }

  console.log('--- 4. a failed task strands its dependents, siblings still run');
  {
    const { out, trace } = await run([
      { id: 1, blockedBy: [], risk: 'none' },
      { id: 2, blockedBy: [1], risk: 'none' },
      { id: 3, blockedBy: [], risk: 'none' },
    ], ['1']);
    const started = trace.filter(t => t.ev === 'start').map(t => t.id).sort().join(',');
    check('2 never dispatched', !started.includes('2'), started);
    check('3 still ran', started.includes('3'), started);
    check('1 reported failed', out.failed.length === 1 && out.failed[0].id === '1', JSON.stringify(out.failed));
    check('2 reported skipped', out.skipped.length === 1 && out.skipped[0].id === '2', JSON.stringify(out.skipped));
    check('1 passed-list empty of 1', out.passed.every(p => p.id !== '1'));
  }

  console.log('--- 5. rejects a task carrying a risk marker');
  {
    const m = await expectThrow([
      { id: 1, blockedBy: [], risk: 'none' },
      { id: 2, blockedBy: [], risk: 'judgement-call' },
    ]);
    check('throws', !!m, 'no throw');
    check('names the task and the risk', m && m.includes('#2') && m.includes('judgement-call'), m);
  }

  console.log('--- 6. rejects a dependency cycle');
  {
    const m = await expectThrow([
      { id: 1, blockedBy: [2], risk: 'none' },
      { id: 2, blockedBy: [1], risk: 'none' },
    ]);
    check('throws instead of hanging', !!m, 'no throw');
    check('says cycle', m && /cycle/i.test(m), m);
  }

  console.log('--- 7. rejects an unknown blocker');
  {
    const m = await expectThrow([{ id: 1, blockedBy: [99], risk: 'none' }]);
    check('throws', !!m, 'no throw');
    check('names the edge', m && m.includes('#1 -> #99'), m);
  }

  console.log('--- 8. rejects an empty task list');
  {
    const m = await expectThrow([]);
    check('throws', !!m && /empty/i.test(m), m);
  }

  console.log('--- 9. an executor returning null is a failure, not a pass');
  {
    const trace = [];
    const out = await wf(
      { goal: 'g', context: 'c', tasks: [{ id: 1, blockedBy: [], risk: 'none' }] },
      async () => null, null, null, noop, noop, null, null
    );
    check('counted as failed', out.failed.length === 1 && out.passed.length === 0, JSON.stringify(out));
  }

  console.log('--- 10. a contradiction is a failure, and is surfaced');
  {
    const out = await wf(
      { goal: 'g', context: 'c', tasks: [{ id: 1, blockedBy: [], risk: 'none' }] },
      async () => ({ filesTouched: [], verifyCommand: '', verifyStdout: '', passed: true, summary: 's', contradiction: 'spec says X, repo says Y' }),
      null, null, noop, noop, null, null
    );
    check('not counted as passed despite passed:true', out.passed.length === 0, JSON.stringify(out.passed));
    check('contradiction surfaced', out.failed[0] && /spec says X/.test(out.failed[0].contradiction), JSON.stringify(out.failed));
  }

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
})();
