import './helpers/private-scratch.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
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
for(let i=0;i<8;i++)test('case '+i,()=>{appendFileSync(${JSON.stringify(record)},i+'\\n');appendFileSync(${JSON.stringify(record)}+'-roots',process.env.GATEREEVE_SCRATCH_ROOT+'\\n');if(process.env.FIXTURE_FAILURE==='1'&&i===3)throw new Error('intentional child failure');});`);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; delete env.GATEREEVE_TEST_SHARD;
  const run = (args = [], additions = {}) => execute(process.execPath, ['--test', ...args, file], { env: { ...env, ...additions } });
  const complete = await run();
  assert.match(complete.stdout, /Registered 8 cases across 4 disjoint groups/);
  assert.deepEqual((await readFile(record, 'utf8')).trim().split('\n').sort(), ['0', '1', '2', '3', '4', '5', '6', '7']);
  // Spec AC2 (D33): every shard has its own scratch root, none is the host root
  // or the root of the process that launched the suite.
  const roots = new Set((await readFile(`${record}-roots`, 'utf8')).trim().split('\n'));
  assert.equal(roots.size, 4);
  for (const shardRoot of roots) assert.ok(shardRoot && shardRoot !== join(tmpdir(), 'gatereeve') && shardRoot !== process.env.GATEREEVE_SCRATCH_ROOT);
  await writeFile(record, ''); await run(['--test-name-pattern=case 2']);
  assert.equal(await readFile(record, 'utf8'), '2\n');
  await assert.rejects(run([], { FIXTURE_FAILURE: '1' }), error => error.code === 1 && /intentional child failure/.test(error.stdout));
  await assert.rejects(run([], { GATEREEVE_TEST_SHARD: JSON.stringify({ path: file, index: 4, shards: 4 }) }), error => error.code === 1);
});

test('every CLI test file imports the private scratch helper first', async () => {
  const directory = new URL('.', import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith('.test.js'));
  assert.ok(files.length > 50);
  for (const name of files) {
    const first = (await readFile(new URL(name, directory), 'utf8')).split('\n', 1)[0];
    assert.equal(first, "import './helpers/private-scratch.js';", `${name} must import the private scratch helper first`);
  }
  assert.notEqual(process.env.GATEREEVE_SCRATCH_ROOT, undefined);
  assert.notEqual(process.env.GATEREEVE_SCRATCH_ROOT, join(tmpdir(), 'gatereeve'));
});
