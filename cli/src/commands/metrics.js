import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { metricsRequest, renderReport, runMeasured, importMetrics, fetchGitHubJobs, serve } from '../performance.js';
const output=value=>process.stdout.write(`${typeof value==='string'?value:JSON.stringify(value,null,2)}\n`);
export function metricsCommands() {
  const root=new Command('metrics').enablePositionalOptions().description('Local workflow measurement; never grants gate authority');
  for(const action of ['report','export'])root.command(action).option('--project <identity>').option('--feature <identity>').option('--since <date>').option('--until <date>').option('--limit <count>','maximum records',Number,200).option('--offset <count>','record offset',Number,0).option('--format <format>','json, markdown or html','json').action(async options=>{const {format,...query}=options;output(renderReport(await metricsRequest(action,query),format));});
  root.command('status').action(async()=>output(await metricsRequest('status')));
  root.command('config').option('--enabled <boolean>').option('--diagnostic-details <boolean>').option('--detail-days <days>',undefined,Number).option('--summary-days <days>',undefined,Number).option('--max-bytes <bytes>',undefined,Number).action(async options=>{
    for(const key of ['enabled','diagnosticDetails'])if(key in options){if(!['true','false'].includes(options[key]))throw new Error(`${key} must be true or false`);options[key]=options[key]==='true';}
    output(Object.keys(options).length?await metricsRequest('config',options):(await metricsRequest('status')).settings);
  });
  root.command('cleanup').option('--apply','remove eligible owned metrics').action(async options=>output(await metricsRequest('cleanup',{apply:options.apply===true})));
  root.command('run').description('Run argv transparently; separate command with --').option('--project <identity>').option('--feature <identity>').option('--category <category>').option('--reason <reason>').option('--scope <scope>','declared full or focused coverage').argument('<command>').argument('[args...]').passThroughOptions().action(async(command,args,options)=>{
    const result=await runMeasured(command,args,options);
    if(result.signal)process.kill(process.pid,result.signal);else process.exitCode=result.code??1;
  });
  root.command('import').requiredOption('--format <format>','node, vitest, playwright, verification, release or github').requiredOption('--execution <id>','stable source execution identity').option('--file <path>').option('--project <identity>').option('--feature <identity>').option('--repository <owner/repo>').option('--run <id>').option('--attempt <number>').action(async options=>{
    let data;
    if(options.file){const {stat,open}=await import('node:fs/promises');if((await stat(options.file)).size>4*1024*1024)throw new Error('Import exceeds 4 MiB');data=JSON.parse(await readFile(options.file,'utf8'));}
    else if(options.format==='github')data=await fetchGitHubJobs(options.repository??'',options.run,options.attempt);
    else throw new Error('Import requires --file');
    output(await importMetrics(options.format,data,options));
  });
  root.command('serve').description('Start a local MCP stdio server').option('--allow-management','Expose explicit settings and cleanup tools').action(async(options)=>{await serve({management:options.allowManagement===true});});
  return root;
}
