// Minimal tools-only MCP stdio adapter, pinned to protocol 2025-06-18.
// No HTTP listener, shell executor, arbitrary-file access, or client configuration writes.
import { metricsRequest } from './service.js';
import { MetricsStore } from './store.js';
const object=properties=>({type:'object',properties,additionalProperties:false});
const fleetQuery=object({dataset:{type:'string'},project:{type:'string'},workflow:{type:'string'},platform:{type:'string'},check:{type:'string'},model:{type:'string'}});
const query=object({project:{type:'string',maxLength:1024},feature:{type:'string',maxLength:1024},since:{type:'string'},until:{type:'string'},limit:{type:'integer',minimum:0,maximum:1000},offset:{type:'integer',minimum:0,maximum:20000}});
export function toolList(management=false) {
  const tool=(name,description,inputSchema,readOnlyHint=true)=>({name:`metrics_${name}`,description,inputSchema,annotations:{readOnlyHint,destructiveHint:name==='cleanup',idempotentHint:readOnlyHint,openWorldHint:false}});
  return [tool('status','Inspect local collection settings, storage and capture health.',object({})),tool('report','Query bounded local timings, repetition, reuse and capture gaps. Does not refresh CI or run tests.',query),tool('export','Return the same normalized report as versioned JSON; no filesystem write.',query),
    tool('datasets','List fixed reporting datasets and source coverage.',object({})),
    tool('reevaluate','All-project snapshot report with project/workflow/check/model/platform drill downs.',fleetQuery),
    tool('snapshot-export','Export a fixed portable dataset; no file write or authority transfer.',object({dataset:{type:'string'}})),
    tool('databases','Inspect known local metrics/workflow databases; no filesystem scan.',object({workflow:{type:'string'}})),
    tool('capture','Capture local reporting observations into a fixed dataset.',object({platform:{type:'string'},missingSources:{type:'array',items:{type:'string'}}}),false),
    tool('combine','Combine imported datasets, deduplicating stable observation identities.',object({datasets:{type:'array',items:{type:'string'}}}),false),
    tool('analyze','Explicit model analysis of a fixed dataset; returns cited hypotheses and no policy changes.',object({...fleetQuery.properties,provider:{type:'string',enum:['codex','claude-code']},reasoningEffort:{type:'string'}}),false),
    ...(management?[tool('legacy-import','Import normalized historical rc.23/rc.24 observations with explicit provenance.',object({records:{type:'array',items:{type:'object'}},platform:{type:'string'},sourceId:{type:'string'},capturedAt:{type:'string'},labels:{type:'object'}}),false),tool('snapshot-import','Import portable observations only; never workflow authority.',object({format:{type:'string'},sources:{type:'array',items:{type:'object'}},records:{type:'array',items:{type:'object'}}}),false)]:[]),
    ...(management?[tool('config','Explicitly change local measurement settings. Requires caller authorization.',object({enabled:{type:'boolean'},diagnosticDetails:{type:'boolean'},detailDays:{type:'integer',minimum:1,maximum:3650},summaryDays:{type:'integer',minimum:1,maximum:3650},maxBytes:{type:'integer',minimum:65536,maximum:1073741824}}),false),tool('cleanup','Preview by default; apply true removes eligible owned metrics only. Requires cleanup authority.',object({apply:{type:'boolean'}}),false)]:[])];
}
export function createSession({store=new MetricsStore(),management=false}={}) {
  let initialized=false,ready=false;
  return async message=>{
    const id=message?.id; const respond=result=>({jsonrpc:'2.0',id,result}); const error=(code,text)=>({jsonrpc:'2.0',id:id??null,error:{code,message:text}});
    if(!message||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string')return error(-32600,'Invalid request');
    if(message.method==='notifications/initialized'){if(initialized)ready=true;return null;}
    if(id===undefined)return null;
    if(typeof id!=='string'&&typeof id!=='number')return error(-32600,'Invalid request ID');
    if(message.method==='initialize'){
      if(initialized)return error(-32600,'Already initialized');
      if(typeof message.params?.protocolVersion!=='string'||!message.params.clientInfo||!message.params.capabilities)return error(-32602,'Invalid initialization');
      initialized=true;return respond({protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'gatereeve-metrics',version:'1.0.0'},instructions:'Local measurement only. Missing capture is not zero. No tool grants workflow authority.'});
    }
    if(message.method==='ping')return respond({});
    if(!ready)return error(-32600,'Initialize the session first');
    if(message.method==='tools/list')return respond({tools:toolList(management)});
    if(message.method!=='tools/call')return error(-32601,'Method not found');
    const tool=toolList(management).find(t=>t.name===message.params?.name);
    if(!tool)return error(-32602,'Unknown or disabled tool');
    try {
      const value=await metricsRequest(tool.name.slice(8),message.params.arguments??{},store);
      return respond({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:false});
    } catch {return respond({content:[{type:'text',text:'Metrics operation unavailable: check arguments, store health and permissions.'}],isError:true});}
  };
}
export async function serve({input=process.stdin,output=process.stdout,management=false,store}={}) {
  const session=createSession({management,store});let buffer='';
  input.setEncoding('utf8');
  for await(const chunk of input){
    buffer+=chunk;
    let end;
    while((end=buffer.indexOf('\n'))!==-1){
      const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(Buffer.byteLength(line)>64*1024*1024)throw new Error('MCP request exceeds 64 MiB');if(!line.trim())continue;
      let response;
      try{response=await session(JSON.parse(line));}catch{response={jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}};}
      if(response&&!output.write(`${JSON.stringify(response)}\n`))await new Promise(resolve=>output.once('drain',resolve));
    }
    if(Buffer.byteLength(buffer)>64*1024*1024)throw new Error('MCP request exceeds 64 MiB');
  }
  if(buffer.trim())output.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Truncated message'}})+'\n');
}
