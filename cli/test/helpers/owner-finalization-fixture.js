import {modelWithFinalization,finalizingFeature,agent,human,mergeInputSha} from './finalization-fixture.js';
import {resolveModuleGraph,hashModuleDefinition} from '../../../plugin-src/shared/resources/protocol/modules.js';
import {startFeatureFinalization,migrateFeatureModel} from '../../../plugin-src/shared/resources/protocol/index.js';
import {snapshot} from '../../../plugin-src/shared/resources/protocol/observer.js';
export async function finalizationOwnerFixture(){
 const base=await modelWithFinalization();const definitions=base.moduleGraph.modules.map(m=>{if(m.id!=='example/release')return m;const next={...m,dependsOn:[]};return {...next,digest:hashModuleDefinition(next)};});
 const modelFor=(ordering,disabled=[])=>{const {readiness,...moduleGraph}=resolveModuleGraph({definitions,policy:{schemaVersion:2,modules:definitions.map(m=>({id:m.id,version:m.version,digest:m.digest,enabled:base.moduleGraph.enabledModuleIds.includes(m.id)&&!disabled.includes(m.id)})),ordering}});return {...base,coreCompatibility:{...base.coreCompatibility,minimum:'1.4.0'},moduleGraph};};
 const original=modelFor({'example/release':{after:['example/prepare']}});const home=await finalizingFeature(original);
 await startFeatureFinalization(home,{attemptId:'retained-owner',mergeInputSha,actor:agent});
 return {home,modelFor,original,async migrate(ordering,disabled=[]){return migrateFeatureModel({featureHome:home,nextModel:modelFor(ordering,disabled),confirmedBy:human});},async observe(){const r=await snapshot(home);if(!r.ok)throw Error(JSON.stringify(r.error));return r.data;},async replace(id){return startFeatureFinalization(home,{attemptId:id,mergeInputSha,actor:agent});}};
}
