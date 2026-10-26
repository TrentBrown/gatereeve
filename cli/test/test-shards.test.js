import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const execute = promisify(execFile);

test('isolated groups cover every case once, preserve focused filters and propagate failures', async t => {
  const root = await mkdtemp(join(tmpdir(), 'gr-test-shards-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'cases.mjs'), record = join(root, 'executed');
  const helper = new URL('./helpers/isolated-tests.js', import.meta.url).href;
  await writeFile(file, `import {isolatedTests} from ${JSON.stringify(helper)};
import {appendFileSync} from 'node:fs';
const test=isolatedTests(import.meta.url);
for(let i=0;i<8;i++)test('case '+i,()=>{appendFileSync(${JSON.stringify(record)},i+'\\n');if(process.env.FIXTURE_FAILURE==='1'&&i===3)throw new Error('intentional child failure');});`);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; delete env.GATEREEVE_TEST_SHARD;
  const run = (args = [], additions = {}) => execute(process.execPath, ['--test', ...args, file], { env: { ...env, ...additions } });
  const complete = await run();
  assert.match(complete.stdout, /Registered 8 cases across 4 disjoint groups/);
  assert.deepEqual((await readFile(record, 'utf8')).trim().split('\n').sort(), ['0', '1', '2', '3', '4', '5', '6', '7']);
  await writeFile(record, ''); await run(['--test-name-pattern=case 2']);
  assert.equal(await readFile(record, 'utf8'), '2\n');
  await assert.rejects(run([], { FIXTURE_FAILURE: '1' }), error => error.code === 1 && /intentional child failure/.test(error.stdout));
  await assert.rejects(run([], { GATEREEVE_TEST_SHARD: JSON.stringify({ path: file, index: 4, shards: 4 }) }), error => error.code === 1);
});
