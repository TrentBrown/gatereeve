import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { performance } from 'node:perf_hooks';
import { MetricsStore } from './store.js';
const context = new AsyncLocalStorage();
let warned = false;
export function captureWarning() {
  if (!warned) { warned = true; process.stderr.write('GateReeve metrics: capture incomplete; underlying work continues.\n'); }
}
export async function record(value, store = new MetricsStore()) {
  if (process.env.GATEREEVE_METRICS === 'off') return null;
  try { const tags=context.getStore()?.tags; return await store.put({project:tags?.project,feature:tags?.feature,parentId:currentSpan(),clock:hostname(),...value}); }
  catch { await store.markIncomplete?.(); captureWarning(); return null; }
}
export function currentSpan() { return context.getStore()?.id ?? process.env.GATEREEVE_METRICS_PARENT ?? null; }
export async function observe(tags, fn, store = new MetricsStore()) {
  const unobserved = () => fn({ count: null, outcome: null });
  if (process.env.GATEREEVE_METRICS === 'off') return unobserved();
  let enabled;
  try { enabled=(await store.config()).enabled; } catch { await store.markIncomplete?.(); captureWarning(); return unobserved(); }
  if(!enabled)return unobserved();
  const parent = context.getStore();
  const id = tags.id ?? randomUUID(); const start = performance.now();
  const value = { ...parent?.tags, ...tags, id, parentId:currentSpan(), startedAt:Date.now(), clock:hostname(), pid:process.pid };
  // Polling is represented by bounded minute buckets, not unfinished executions.
  if (tags.category !== 'poll') await record({ ...value, outcome:'RUNNING' }, store);
  // The callee may annotate its own span with a bounded count or explicit outcome.
  const span = { count: null, outcome: null };
  return context.run({ id, tags:value }, async () => {
    let outcome = 'UNAVAILABLE', metrics=null;
    try { const result = await fn(span); metrics=result?.receipt?.metrics??result?.metrics??null; const verdicts=result?.output?.verdicts; outcome = span.outcome ?? result?.outcome ?? (verdicts?.some(v=>v.outcome==='FAIL')?'FAIL':verdicts?.some(v=>v.outcome==='UNAVAILABLE')?'UNAVAILABLE':result?.ok===false?'FAIL':'PASS'); return result; }
    finally {
      await record({ ...value, id:tags.category === 'poll' ? `poll:${tags.project}:${Math.floor(value.startedAt/60000)}` : id,
        outcome, tokens:metrics?.tokens, cost:metrics?.cost, durationMs:performance.now()-start, pid:null, count:span.count ?? undefined }, store);
    }
  });
}
