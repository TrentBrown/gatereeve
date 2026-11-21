import { captureSnapshot, importSnapshot, exportSnapshot, importLegacySnapshot, listDatasets, combineSnapshots, reevaluationReport, renderReevaluation, knownDatabases, cleanupReporting } from './fleet.js';
import { analyzeReport } from './analysis.js';
import { MetricsStore } from './store.js';
import { report, status, renderReport } from './report.js';
export async function metricsRequest(action, input={}, store=new MetricsStore()) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Expected metrics input object');
  if(action==='capture')return captureSnapshot(input,store);
  if(action==='snapshot-import')return importSnapshot(input,store);
  if(action==='snapshot-export')return exportSnapshot(input,store);
  if(action==='legacy-import')return importLegacySnapshot(input,store);
  if(action==='datasets')return listDatasets(store);
  if(action==='combine')return combineSnapshots(input,store);
  if(action==='reevaluate')return reevaluationReport(input,store);
  if(action==='analyze')return analyzeReport(input,store);
  if(action==='databases')return knownDatabases(input,store);
  if(action==='report'||action==='export')return report(input,store);
  if(action==='status') { if(Object.keys(input).length)throw new Error('Status accepts no arguments');return status(store); }
  if(action==='config')return store.setConfig(input);
  if(action==='cleanup') {
    if(Object.keys(input).some(k=>k!=='apply')||('apply'in input&&typeof input.apply!=='boolean'))throw new Error('Cleanup accepts only apply boolean');
    const reporting=await cleanupReporting(input,store);
    return {...await store.cleanup(input),reporting};
  }
  throw new Error('Unknown metrics action');
}
export { renderReport, renderReevaluation };
