import { MetricsStore } from './store.js';
import { report, status, renderReport } from './report.js';
export async function metricsRequest(action, input={}, store=new MetricsStore()) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Expected metrics input object');
  if(action==='report'||action==='export')return report(input,store);
  if(action==='status') { if(Object.keys(input).length)throw new Error('Status accepts no arguments');return status(store); }
  if(action==='config')return store.setConfig(input);
  if(action==='cleanup') {
    if(Object.keys(input).some(k=>k!=='apply')||('apply'in input&&typeof input.apply!=='boolean'))throw new Error('Cleanup accepts only apply boolean');
    return store.cleanup(input);
  }
  throw new Error('Unknown metrics action');
}
export { renderReport };
