import { access } from 'node:fs/promises';
let base;
for(const url of [new URL('../../plugin-src/shared/resources/performance/service.js',import.meta.url),new URL('../resources/performance/service.js',import.meta.url)]) {
  try{await access(url);base=url;break;}catch(error){if(error.code!=='ENOENT')throw error;}
}
if(!base)throw new Error('GateReeve measurement resources missing; stage resources or reinstall');
export const {metricsRequest,renderReport,renderReevaluation}=await import(base.href);
export const {runMeasured}=await import(new URL('./run.js',base).href);
export const {importMetrics,fetchGitHubJobs}=await import(new URL('./import.js',base).href);
export const serve=async options=>(await import(new URL('./mcp.js',base).href)).serve(options);
