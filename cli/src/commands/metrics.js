import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { metricsRequest, renderReport, renderReevaluation, runMeasured, importMetrics, fetchGitHubJobs, serve } from '../performance.js';
const output=value=>process.stdout.write(`${typeof value==='string'?value:JSON.stringify(value,null,2)}\n`);
export function metricsCommands() {
  const root=new Command('metrics').enablePositionalOptions().description('Local workflow measurement; never grants gate authority');
  for(const action of ['report','export'])root.command(action).option('--project <identity>').option('--feature <identity>').option('--since <date>').option('--until <date>').option('--limit <count>','maximum records',Number,200).option('--offset <count>','record offset',Number,0).option('--format <format>','json, markdown or html','json').action(async options=>{const {format,...query}=options;output(renderReport(await metricsRequest(action,query),format));});
  root.command('capture').option('--platform <label>').option('--missing-source <name>', 'Unavailable fleet source', (value, rows) => [...rows,value], []).action(async options => output(await metricsRequest('capture',{platform:options.platform,missingSources:options.missingSource})));
  root.command('datasets').action(async()=>output(await metricsRequest('datasets')));
  root.command('databases').option('--workflow <id>').action(async options=>output(await metricsRequest('databases',options)));
  root.command('combine').argument('<datasets...>').action(async datasets=>output(await metricsRequest('combine',{datasets})));
  for(const action of ['snapshot-import','legacy-import'])root.command(action).argument('<file>').action(async file=>{
    const {stat}=await import('node:fs/promises'); if((await stat(file)).size>64*1024*1024)throw new Error('Snapshot exceeds 64 MiB');
    output(await metricsRequest(action,JSON.parse(await readFile(file,'utf8'))));
  });
  root.command('snapshot-export').argument('<dataset>').action(async dataset=>output(await metricsRequest('snapshot-export',{dataset})));
  for(const action of ['reevaluate','analyze']) {
    const cmd=root.command(action).requiredOption('--dataset <id>').option('--project <label>').option('--workflow <id>').option('--platform <label>').option('--check <label>');
    if(action==='analyze')cmd.requiredOption('--provider <provider>').requiredOption('--model <model>').option('--reasoning-effort <effort>','Provider reasoning','high');
    else cmd.option('--model <label>').option('--format <format>','json or html','json');
    cmd.action(async options=>{const {format,...input}=options;const value=await metricsRequest(action,input);output(action==='reevaluate'?renderReevaluation(value,format):value);});
  }
  root.command('status').action(async()=>output(await metricsRequest('status')));
  root.command('config').option('--enabled <boolean>').option('--diagnostic-details <boolean>').option('--detail-days <days>',undefined,Number).option('--summary-days <days>',undefined,Number).option('--max-bytes <bytes>',undefined,Number).action(async options=>{
    for(const key of ['enabled','diagnosticDetails'])if(key in options){if(!['true','false'].includes(options[key]))throw new Error(`${key} must be true or false`);options[key]=options[key]==='true';}
    output(Object.keys(options).length?await metricsRequest('config',options):(await metricsRequest('status')).settings);
  });
  root.command('cleanup').option('--apply','remove eligible owned metrics').action(async options=>output(await metricsRequest('cleanup',{apply:options.apply===true})));
  root.command('run').description('Run argv transparently; separate command with --').option('--execution <id>','stable identity for this actual execution').option('--project <identity>').option('--feature <identity>').option('--category <category>').option('--reason <reason>').option('--scope <scope>','declared full or focused coverage').argument('<command>').argument('[args...]').passThroughOptions().action(async(command,args,options)=>{
    const result=await runMeasured(command,args,options);
    if(result.signal)process.kill(process.pid,result.signal);else process.exitCode=result.code??1;
  });
  root.command('import').requiredOption('--format <format>','node, vitest, playwright, verification, release or github').requiredOption('--execution <id>','stable source execution identity').option('--file <path>').option('--parent-id <id>','known wrapper execution identity').option('--clock <id>','known shared clock identity').option('--project <identity>').option('--feature <identity>').option('--repository <owner/repo>').option('--run <id>').option('--attempt <number>').action(async options=>{
    let data;
    if(options.file){const {stat,open}=await import('node:fs/promises');if((await stat(options.file)).size>4*1024*1024)throw new Error('Import exceeds 4 MiB');data=JSON.parse(await readFile(options.file,'utf8'));}
    else if(options.format==='github')data=await fetchGitHubJobs(options.repository??'',options.run,options.attempt);
    else throw new Error('Import requires --file');
    output(await importMetrics(options.format,data,options));
  });
  root.command('serve').description('Start a local MCP stdio server').option('--allow-management','Expose explicit settings and cleanup tools').action(async(options)=>{await serve({management:options.allowManagement===true});});
  return root;
}
