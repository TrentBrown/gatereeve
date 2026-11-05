import { spawn } from 'node:child_process';
import { observe, currentSpan } from './observe.js';
import { MetricsStore } from './store.js';
export async function runMeasured(command, args = [], options = {}) {
  if (typeof command !== 'string' || !command || !Array.isArray(args) || args.some(v => typeof v !== 'string')) throw new Error('Expected command argv');
  const store = options.store ?? new MetricsStore();
  return observe({ category:options.category ?? 'manual', project:options.project ?? options.cwd ?? process.cwd(), feature:options.feature,
    command:JSON.stringify([command,args]), reason:options.reason, scope:options.scope, worker:true }, async () => {
    const env = { ...process.env, ...options.env, GATEREEVE_METRICS_PARENT:currentSpan() ?? '' };
    if (!(await store.config().catch(() => ({ enabled:true }))).enabled) env.GATEREEVE_METRICS = 'off';
    const child = spawn(command,args,{ cwd:options.cwd, env, stdio:options.stdio ?? 'inherit', shell:false });
    const forward = Object.fromEntries(['SIGINT','SIGTERM','SIGHUP'].map(signal => [signal, () => child.kill(signal)]));
    for (const [signal, fn] of Object.entries(forward)) process.on(signal,fn);
    try {
      return await new Promise(resolve => {
        child.once('error', error => resolve({ outcome:'UNAVAILABLE', code:127, signal:null, launchCode:error.code }));
        child.once('exit',(code,signal) => resolve({ outcome:signal ? 'CANCELLED' : code === 0 ? 'PASS' : 'FAIL', code, signal }));
      });
    } finally { for (const [signal,fn] of Object.entries(forward)) process.removeListener(signal,fn); }
  },store);
}
