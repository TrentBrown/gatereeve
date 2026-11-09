import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CurrentStore } from '../../plugin-src/shared/resources/protocol/current/store.js';
import { identity } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { database } from '../../plugin-src/shared/resources/protocol/current/workflow-database.js';

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'gatereeve-sqlite-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  return { home, store: await CurrentStore.at(home) };
}
const op = id => ({ id, hash: identity(id) });
test('inspection does not create a missing database', async t => {
  const { home, store } = await fixture(t);
  assert.equal((await store.inspect()).exists, false);
  assert.equal(await store.active(), null);
  assert.deepEqual(await readdir(home), []);
});
test('SQLite is authoritative across instances and isolates workflows', async t => {
  const a = await fixture(t), b = await fixture(t);
  await a.store.append('run', 0, 'STARTED', { featureId: 'feature', implementers: ['thread-a'], optionalGates: [] }, op('start'));
  await a.store.activate('run');
  const replacement = await CurrentStore.at(a.home);
  assert.equal((await replacement.active()).runId, 'run');
  assert.equal((await replacement.history({ kind: 'participant' }))[0].body.contextId, 'thread-a');
  assert.deepEqual(await b.store.events('run'), []);
  assert.equal((await replacement.inspect()).integrity, 'ok');
  assert.equal((await readdir(join(a.home,'.gatereeve-current'))).some(name => name === 'runs' || name === 'active.json'), false);
});
test('concurrent append, retries and failed transactions cannot overwrite facts', async t => {
  const { home, store } = await fixture(t);
  const other = await CurrentStore.at(home);
  await store.append('run', 0, 'STARTED', { implementers: [] }, op('start'));
  const outcomes = await Promise.allSettled([store.append('run', 1, 'OBSERVATION', { a: 1 }, op('a')), other.append('run', 1, 'OBSERVATION', { b: 1 }, op('b'))]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal((await store.events('run')).length, 2);
  assert.equal((await store.append('run', 0, 'STARTED', { implementers: [] }, op('start'))).sequence, 1);
  await assert.rejects(store.append('run', 2, 'OBSERVATION', {}, { id: 'start', hash: identity('changed') }), /reused/);
  await assert.rejects(database(home, true, db => { db.exec('DELETE FROM events'); throw new Error('interrupted'); }), /interrupted/);
  assert.equal((await store.events('run')).length, 2);
});
test('legacy activation is retained without replay and requires explicit resume', async t => {
  const { home, store } = await fixture(t);
  await mkdir(join(home, '.gatereeve-current'));
  const legacy = '{"contract":"gatereeve/current/5","runId":"old"}';
  await writeFile(join(home, '.gatereeve-current/active.json'), legacy);
  await assert.rejects(store.active(), /resume-current/);
  const head = await store.activationHead();
  await store.append('new', 0, 'STARTED', { implementers: [] }, op('new'));
  await store.supersedeActive('new', head);
  assert.equal((await store.active()).runId, 'new');
  assert.deepEqual(await store.events('old'), []);
  assert.equal(await readFile(join(home,'.gatereeve-current/active.json'),'utf8'), legacy);
});
test('missing database has no reconstructed approvals', async t => {
  const { home, store } = await fixture(t);
  await writeFile(join(home,'design.md'), 'approved surviving document');
  await store.append('run', 0, 'STARTED', { implementers: [] }, op('start'));
  await store.activate('run');
  await rm(join(home,'.gatereeve-current/workflow.sqlite'));
  assert.equal((await store.inspect()).state, 'missing');
  assert.deepEqual(await store.events('run'), []);
  assert.equal(await store.active(), null);
  assert.equal(await readFile(join(home,'design.md'),'utf8'), 'approved surviving document');
});

test('process interruption rolls back SQLite authority and independent processes compete by revision',async t=>{
  const {home,store}=await fixture(t);
  await store.append('run',0,'STARTED',{implementers:[]},op('start'));await store.activate('run');
  const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');const exec=promisify(execFile);
  const dbModule=new URL('../../plugin-src/shared/resources/protocol/current/workflow-database.js',import.meta.url).href;
  const script=`import {database} from ${JSON.stringify(dbModule)};await database(${JSON.stringify(home)},true,db=>{db.exec('DELETE FROM events');process.exit(17)});`;
  await assert.rejects(exec(process.execPath,['--input-type=module','-e',script]),error=>error.code===17);
  assert.equal((await store.events('run')).length,1);assert.equal((await store.active()).runId,'run');
  const module=new URL('../../plugin-src/shared/resources/protocol/current/store.js',import.meta.url).href;
  const compete=id=>exec(process.execPath,['--input-type=module','-e',`import {CurrentStore} from ${JSON.stringify(module)};const s=await CurrentStore.at(${JSON.stringify(home)});await s.append('run',1,'OBSERVATION',{kind:'strategy'},${JSON.stringify(op(id))});`]);
  const results=await Promise.allSettled([compete('one'),compete('two')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await store.events('run')).length,2);
});
