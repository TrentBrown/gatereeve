import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { retryTransient } from '../../plugin-src/shared/resources/release/recovery.js';
import { observeSharedRelease } from '../../plugin-src/shared/resources/release/release-receipt.js';
import { CONDUCTOR_STAGES, createConductorState, conductorStateArtifactName } from '../../plugin-src/shared/resources/release/release-conductor-state.js';
import { qualifySourceReceipt, SOURCE_POLICY, SOURCE_ARTIFACT } from '../../ci/source-acceptance.mjs';
import { matrixCheck } from '../../ci/matrix-check.mjs';
import { upgradePlugin } from '../src/plugin/upgrade.js';

const source = 'a'.repeat(40), repository = 'TrentBrown/gatereeve';
async function temporary(t) { const root = await mkdtemp(join(tmpdir(), 'gr-delivery-recovery-')); t.after(() => rm(root, { recursive: true, force: true })); return root; }
function releaseChain() {
  const evidence = { version: '0.1.0-rc.20', preparationArtifact: 'candidate', pluginArtifact: 'plugin', trustArtifact: 'trust',
    dmgSha256: 'a'.repeat(64), primaryPlanArtifact: 'primary', primaryPlanSha256: 'b'.repeat(64), primaryRehearsalArtifact: 'rehearsal',
    primaryPublicationArtifact: 'publication', primaryRecordSha256: 'c'.repeat(64), publicDmgSha256: 'a'.repeat(64),
    directInstallAttestation: { confirmedAt: '2026-10-26T00:00:00Z', confirmedBy: 'fixture', publicDmgSha256: 'a'.repeat(64) },
    caskPlanArtifact: 'cask', caskPlanSha256: 'd'.repeat(64), caskRehearsalArtifact: 'cask-rehearsal', caskPublicationArtifact: 'cask-publication',
    caskRecordSha256: 'e'.repeat(64), smokeArtifacts: ['linked-arm', 'linked-intel', 'public-arm', 'public-intel'] };
  const chain = [];
  for (const stage of CONDUCTOR_STAGES) chain.push(createConductorState({ previous: chain.at(-1) ?? null, tag: 'v0.1.0-rc.20', sourceCommit: source,
    stage, evidence, run: { id: '100', attempt: 1, repository, workflowRef: 'main' }, actor: { login: 'fixture' }, recordedAt: '2026-10-26T00:00:00Z' }));
  return chain;
}
test('known transients back off, preserve attempts, and leave substantive errors to investigation', async () => {
  let now = 0, launches = 0; const delays = [];
  const result = await retryTransient(async () => { if (++launches < 3) throw Object.assign(new Error('reset'), { code: 'ECONNRESET' }); return 'verified'; },
    { now: () => now, random: () => .5, sleep: async ms => { delays.push(ms); now += ms; } });
  assert.deepEqual(delays, [1000, 2000]); assert.equal(result.attempts.length, 3); assert.equal(result.value, 'verified');
  launches = 0;
  await assert.rejects(retryTransient(async () => { launches++; throw new Error('Gatekeeper rejected signature'); }), /Gatekeeper/);
  assert.equal(launches, 1);
  await assert.rejects(retryTransient(async () => { throw Object.assign(new Error('limited'), { status: 429, retryAfterMs: 5000 }); },
    { budgetMs: 4999, now: () => 0, sleep: async () => assert.fail('must honor provider delay') }), error => error.attempts[0].retry === false);
});
test('source acceptance requires exact full main CI and retained source/tree/policy identity', () => {
  const receipt = { policy: SOURCE_POLICY, repository, source, tree: 'b'.repeat(40), runId: '4', attempt: 1, scope: 'full', outcome: 'PASS' };
  const context = { repository, source, tree: receipt.tree, run: { id: 4, run_attempt: 1, repository: { full_name: repository },
    path: '.github/workflows/plugin-ci.yml', event: 'push', head_branch: 'main', status: 'completed', conclusion: 'success', head_sha: source },
    artifact: { id: 5, name: SOURCE_ARTIFACT, expired: false, workflow_run: { id: 4 } } };
  assert.equal(qualifySourceReceipt(receipt, context).artifactId, 5);
  for (const changed of [{ tree: 'changed' }, { policy: 'obsolete' }, { source: 'c'.repeat(40) }, { scope: 'review-artifacts' }]) assert.throws(() => qualifySourceReceipt({ ...receipt, ...changed }, context));
  assert.throws(() => qualifySourceReceipt(receipt, { ...context, run: { ...context.run, conclusion: 'failure' } }));
});
test('two features share one immutable release artifact while inclusion and provider facts remain fresh', async t => {
  const root = await temporary(t), chain = releaseChain(), bytes = Buffer.from(JSON.stringify(chain));
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  let downloads = 0, observations = 0, included = true, expired = false;
  const options = { root, repository, artifactId: 8, mergeInputSha: 'b'.repeat(40),
    download: async () => { downloads++; return bytes; }, readChain: async path => JSON.parse(await readFile(path, 'utf8')),
    runJson: async args => { observations++; const path = args[1];
      if (path.endsWith('/artifacts/8')) return { id: 8, digest, name: conductorStateArtifactName(chain.at(-1)), expired, size_in_bytes: bytes.length, workflow_run: { id: 100 } };
      if (path.endsWith('/runs/100')) return { id: 100, run_attempt: 1, repository: { full_name: repository }, event: 'workflow_dispatch', head_branch: 'main',
        path: '.github/workflows/release-conductor.yml', status: 'completed', conclusion: 'success', head_sha: source };
      return { status: included ? 'ahead' : 'diverged' };
    } };
  const first = await observeSharedRelease(options); const count = observations;
  const second = await observeSharedRelease({ ...options, mergeInputSha: 'c'.repeat(40) });
  assert.equal(downloads, 1); assert.equal(first.retained.path, second.retained.path); assert.ok(observations > count);
  included = false; await assert.rejects(observeSharedRelease(options), /not included/);
  included = true; expired = true; await assert.rejects(observeSharedRelease(options), /unavailable/);
  expired = false; await writeFile(first.retained.path, 'corrupt'); await assert.rejects(observeSharedRelease(options), /changed/);
});
test('native upgrade recovery observes installed bytes, preserves unrelated state and never invents activation', async t => {
  const root = await temporary(t), expectedPackage = join(root, 'expected'), installed = join(root, 'installed'), receiptPath = join(root, 'receipt.json');
  await mkdir(join(expectedPackage, '.claude-plugin'), { recursive: true });
  await writeFile(join(expectedPackage, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'agentic-development-workflow', version: '0.1.0-rc.20' }));
  await writeFile(join(expectedPackage, 'skill.txt'), 'verified package');
  let present = false, enabled = false, interrupted = true; const calls = [];
  const runner = async (_, args) => {
    calls.push(args.join(' '));
    if (args[1] === 'list') return JSON.stringify([{ id: 'unrelated@elsewhere', enabled: true }, ...(present ? [{ id: 'agentic-development-workflow@quality-code', version: '0.1.0-rc.20', enabled, installPath: installed }] : [])]);
    if (args[1] === 'install') { await cp(expectedPackage, installed, { recursive: true }); present = true; }
    if (args[1] === 'update' && interrupted) { interrupted = false; throw new Error('lost response after installation'); }
    if (args[1] === 'enable') enabled = true;
    return '{}';
  };
  const options = { platform: 'claude', version: '0.1.0-rc.20', expectedPackage, receiptPath, runner };
  await assert.rejects(upgradePlugin(options), /lost response/);
  const result = await upgradePlugin(options);
  assert.equal(calls.filter(call => call.startsWith('plugin install')).length, 1);
  assert.equal(result.enabled, true); assert.equal(result.activation.status, 'pending'); assert.equal(result.activeSessions, 'preserved');
  assert.ok(!calls.some(call => /remove|restart|unrelated/.test(call)));
  await writeFile(join(installed, 'skill.txt'), 'corruption');
  await assert.rejects(upgradePlugin({ ...options, runner: async (exe, args) => args[1] === 'list' ? runner(exe, args) : '{}' }), /does not match/);
});

test('actual matrix wrapper reuses only qualified entries and preserves substantive failure lineage', async t => {
  const root = await temporary(t), evidence = join(root, 'check.json'), input = join(root, 'candidate.dmg');
  await writeFile(input, 'immutable-package');
  let launches = 0, download = null, priorSource = source, ancestry = 'ahead';
  const options = { artifactName: 'native-arm64', evidence, inputs: [input], repository, runId: '100', commandLine: ['verify-package', input],
    runtime: {
      provider: async args => args[1].includes('/compare/') ? { status: ancestry } : args[1].includes('/artifacts?') ? { artifacts: [{ id: 22, name: 'native-arm64', expired: false }] }
        : { repository: { full_name: repository }, event: 'workflow_dispatch', head_branch: 'main', head_sha: priorSource,
          path: '.github/workflows/release-conductor.yml', conclusion: 'failure' },
      command: async (exe, args) => {
        if (exe === 'git') return source;
        if (exe === 'gh') {
          const directory = args[args.indexOf('--dir') + 1];
          await writeFile(join(directory, 'check.json'), download.bytes);
          await writeFile(join(directory, 'check.json.reuse.json'), JSON.stringify(download.receipt)); return '';
        }
        launches++;
        await writeFile(evidence, JSON.stringify({ verified: true })); return '';
      },
    } };
  const first = await matrixCheck(options);
  download = { receipt: first, bytes: await readFile(evidence) };
  const reused = await matrixCheck({ ...options, runId: '101', priorRunId: '100' });
  assert.equal(launches, 1); assert.equal(reused.reusedFrom.artifactId, 22);
  download.receipt = { ...first, outcome: 'FAIL' };
  await assert.rejects(matrixCheck({ ...options, runId: '102', priorRunId: '100' }), /investigation/);
  assert.equal(launches, 1);
  const recovered = await matrixCheck({ ...options, runId: '102', priorRunId: '100', investigation: 'Confirmed temporary trust service outage; rerun this native check.' });
  assert.equal(launches, 2); assert.equal(recovered.previous.outcome, 'FAIL'); assert.equal(recovered.previous.artifactId, 22);
  download.receipt = first;
  await writeFile(input, 'changed-package');
  await matrixCheck({ ...options, runId: '103', priorRunId: '100' });
  assert.equal(launches, 3);
  await writeFile(input, 'immutable-package'); priorSource = 'c'.repeat(40);
  await matrixCheck({ ...options, runId: '104', priorRunId: '100' });
  assert.equal(launches, 3, 'advanced caller head preserves matching actual checker evidence');
  ancestry = 'diverged';
  await matrixCheck({ ...options, runId: '105', priorRunId: '100' });
  assert.equal(launches, 4, 'unrelated caller cannot establish reusable provenance');
  ancestry = 'ahead';
  download.receipt = { ...first, identity: { ...first.identity, source: priorSource } };
  await matrixCheck({ ...options, runId: '106', priorRunId: '100' });
  assert.equal(launches, 5, 'changed actual checker source forces execution');
  download.receipt = first;
  priorSource = source; download.bytes = Buffer.from('corrupted');
  await assert.rejects(matrixCheck({ ...options, runId: '107', priorRunId: '100' }), /corrupt/);
  assert.equal(launches, 5);
});

test('Codex marketplace availability cannot masquerade as an installed package', async t => {
  const root=await temporary(t), expected=join(root,'expected');
  await mkdir(join(expected,'.codex-plugin'),{recursive:true});
  await writeFile(join(expected,'.codex-plugin/plugin.json'),JSON.stringify({name:'agentic-development-workflow',version:'0.1.0-test'}));
  let installed=false,adds=0;
  const runner=async(_,args)=>{
    if(args[1]==='list') return JSON.stringify({installed:[{pluginId:'agentic-development-workflow@quality-code',version:'0.1.0-test',installed,enabled:true,source:{path:expected}}]});
    if(args[1]==='marketplace') return JSON.stringify({marketplaces:[{name:'quality-code',marketplaceSource:{sourceType:'local'}}]});
    if(args[1]==='add'){adds++;installed=true;} return '{}';
  };
  const result=await upgradePlugin({platform:'codex',version:'0.1.0-test',expectedPackage:expected,receiptPath:join(root,'receipt.json'),runner});
  assert.equal(adds,1);assert.equal(result.phase,'installed-activation-pending');
});
