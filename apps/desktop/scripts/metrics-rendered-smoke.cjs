// Real Chromium rendering of the production metrics component and staged backend.
// Runs as a separate Electron process with an owned disposable profile.
const { app, BrowserWindow, ipcMain, session } = require('electron');
const { resolve, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
app.on('window-all-closed',()=>{});
(async () => {
  const scratch={path:process.env.GATEREEVE_METRICS_SMOKE_ROOT};
  if(!scratch.path)throw Error('Use metrics-rendered-smoke.mjs for owned profile and cleanup');
  {
    app.setPath('userData',join(scratch.path,'profile'));
    process.env.GATEREEVE_METRICS_DIR=join(scratch.path,'metrics');
    const {MetricsStore}=await import('../resources/performance/store.js');
    const {metricsRequest,renderReport}=await import('../resources/performance/service.js');
    const store=new MetricsStore();
    await store.put({id:'rendered-check',project:'smoke-project',category:'verification',startedAt:Date.now(),durationMs:100,outcome:'PASS',worker:true});
    const preload=join(scratch.path,'preload.cjs');
    await fs.writeFile(preload,"const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('smokeMetrics',{metrics:r=>ipcRenderer.invoke('smoke:metrics',r)});");
    ipcMain.handle('smoke:metrics',async (_event,r)=>r.action==='html'?{html:renderReport(await metricsRequest('report',{project:'smoke-project'},store),'html')}:metricsRequest(r.action,r.action==='report'?{project:'smoke-project'}:r.input??{},store));
    const html=join(scratch.path,'smoke.html');
    const styleURL=pathToFileURL(resolve(__dirname,'../renderer/styles.css')).href;
    const moduleURL=pathToFileURL(resolve(__dirname,'../renderer/metrics-view.js')).href;
    await fs.writeFile(html,`<!doctype html><html><meta charset="utf-8"><title>GateReeve metrics smoke</title><link rel="stylesheet" href="${styleURL}"><body><main></main><script type="module">import {renderMetrics} from ${JSON.stringify(moduleURL)};renderMetrics(document.querySelector('main'),window.smokeMetrics);window.smokeReady=true;</script></body></html>`);
    await app.whenReady();
    const external=[];session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(d,cb)=>{external.push(d.url);cb({cancel:true});});
    const win=new BrowserWindow({show:false,width:1100,height:900,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
    const errors=[];win.webContents.on('render-process-gone',(_e,d)=>errors.push(d.reason));
    await win.loadFile(html);
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Renderer did not settle');};
      await wait(()=>window.smokeReady);
      const click=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text).click();
      click('Load metrics');await wait(()=>document.body.textContent.includes('0 incomplete records'));
      const loaded=document.body.textContent.includes('100');
      click('Open full report');await wait(()=>document.querySelector('iframe')?.srcdoc.includes('GateReeve performance'));
      const frame=document.querySelector('iframe');
      click('Preview metrics cleanup');await wait(()=>document.querySelector('pre').textContent.includes('candidates'));
      return {loaded,sandbox:frame.getAttribute('sandbox'),report:frame.srcdoc.includes('Worker time: 100.0 ms'),cleanupPreview:true,overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    if(!result.loaded||!result.report||result.sandbox!==''||result.overflow||errors.length||external.length)throw Error(JSON.stringify({result,errors,external}));
    // Inspect the rendered frame through Chromium's DOM protocol. Its empty
    // sandbox intentionally disallows JavaScript, including injected evaluation.
    let frameRendered=false;
    win.webContents.debugger.attach('1.3');
    const sessions=new Set();
    win.webContents.debugger.on('message',(_e,method,params)=>{if(method==='Target.attachedToTarget')sessions.add(params.sessionId);});
    await win.webContents.debugger.sendCommand('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
    try {
      const heading=n=>n.nodeName==='H1'&&(n.children??[]).some(c=>c.nodeValue==='GateReeve performance')||(n.children??[]).some(heading);
      const frameHeading=n=>n.nodeName==='IFRAME'&&n.contentDocument&&heading(n.contentDocument)||(n.children??[]).some(frameHeading);
      for(let i=0;i<200;i++){
        const {root}=await win.webContents.debugger.sendCommand('DOM.getDocument',{depth:-1,pierce:true});
        frameRendered=Boolean(frameHeading(root));
        for(const sessionId of sessions){const doc=await win.webContents.debugger.sendCommand('DOM.getDocument',{depth:-1,pierce:true},sessionId).catch(()=>null);if(doc&&heading(doc.root))frameRendered=true;}
        if(frameRendered)break;await new Promise(r=>setTimeout(r,25));
      }
    } finally { win.webContents.debugger.detach(); }
    if(!frameRendered){console.error(JSON.stringify(win.webContents.mainFrame.framesInSubtree.map(f=>({url:f.url,name:f.name})))); if(process.argv[2])await fs.writeFile(resolve(process.argv[2]),(await win.webContents.capturePage()).toPNG());win.destroy();throw Error('Sandboxed report did not render');}
    result.frameRendered=true;
    await win.webContents.executeJavaScript("document.querySelector('iframe').scrollIntoView()");
    if(process.argv[2])await fs.writeFile(resolve(process.argv[2]),(await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({kind:'metrics-rendered-smoke',result,errors,externalRequests:external,scope:'Real Electron renderer with staged shared backend; separate disposable profile, no installed-session activation claim.'}));
    win.destroy();ipcMain.removeHandler('smoke:metrics');
  }
  app.exit(0);
})().catch(error=>{console.error(error);app.exit(1);});
