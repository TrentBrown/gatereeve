import './helpers/private-scratch.js';
import { selection, pairExistingEvaluator } from './helpers/paired-review-fixture.js';
// Workspace configuration for delivery (spec AC6 "Workspace configuration for
// delivery", R8; design and spec Changes 2026-11-17). Only GitHub transport
// and the evaluator are simulated; Git, the written file, the local excludes,
// the journal and the protected merge are real.
import assert from 'node:assert/strict';
import { isolatedTests } from './helpers/isolated-tests.js';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeCurrentRequest } from '../../plugin-src/shared/resources/protocol/current/adapter.js';
import { CurrentCore } from '../../plugin-src/shared/resources/protocol/current/core.js';
import { resolveWorkflowContext } from '../../plugin-src/shared/resources/protocol/context.js';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';
import { digest } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { preToolUse } from '../../plugin-src/shared/resources/protocol/current/pre-tool-use.js';
import { branchFeatureMatch, excludeConfiguration, workspaceInstruction } from '../../plugin-src/shared/resources/protocol/current/workspace.js';
import { human, BRIEF, writeFullDocuments, reviewConfig, evaluator } from './helpers/lightweight-fixture.js';

const test = isolatedTests(import.meta.url);
const CONFIG = '.agentic-workflow.json';
const exists = path => stat(path).then(() => true, () => false);
const instruction = text => ({ ...human, instruction: text });

// A Git-fallback repository (no configuration anywhere above it) whose origin is
// a GitHub URL served by a local bare repository.
async function repository(t, { branch = 'feature-x', remote = 'https://github.com/fixture/project.git', config = null } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-workspace-')));
  const hostDir = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-workspace-host-')));
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(hostDir, { recursive: true, force: true })]));
  await git(root, ['init', '-b', 'main']);
  await git(root, ['config', 'user.email', 'fixture@example.test']);
  await git(root, ['config', 'user.name', 'Fixture']);
  await git(root, ['config', 'commit.gpgsign', 'false']);
  await mkdir(join(root, '.pattern-review')); await writeFile(join(root, '.pattern-review/rules.yaml'), '[]\n');
  await writeFile(join(root, 'app.js'), 'export const answer = 41;\n');
  await git(root, ['add', '-A']); await git(root, ['commit', '-m', 'fixture']);
  const base = (await git(root, ['rev-parse', 'HEAD'])).trim();
  if (remote) {
    const bare = join(hostDir, 'host.git');
    await git(hostDir, ['init', '--bare', bare]);
    await git(root, ['remote', 'add', 'origin', remote]);
    await git(root, ['config', `url.${bare}.insteadOf`, remote]);
    await git(root, ['push', 'origin', 'HEAD:refs/heads/main']);
  }
  await git(root, ['checkout', '-b', branch]);
  if (config) await writeFile(join(root, CONFIG), typeof config === 'string' ? config : JSON.stringify(config));
  const runtime = { entryPoints: { adapter: null, cli: null } };
  const f = { root, base, branch, runtime, home: join(root, 'docs/issues', branch), host: github(runtime) };
  f.result = (operation, input = {}, operationId) => executeCurrentRequest({ operation, input, operationId, cwd: root }, runtime);
  f.request = async (operation, input, operationId) => {
    const result = await f.result(operation, input, operationId);
    if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code, details: result.error.details });
    return result.data;
  };
  f.core = async () => CurrentCore.at(await resolveWorkflowContext({ cwd: root }), runtime);
  f.events = async () => { const core = await f.core(); return (await core.state()).events; };
  return f;
}
// Stateful GitHub CLI double: the repository API (default branch) and PR operations.
function github(runtime) {
  const host = { defaultBranch: 'main', apiFailure: null, api: [], pr: null, calls: [] };
  runtime.gh = async (root, args) => {
    if (args[0] === 'api') {
      host.api.push(args.join(' '));
      if (host.apiFailure) throw Object.assign(new Error('Command failed: gh api'), { stderr: host.apiFailure });
      return JSON.stringify({ full_name: 'fixture/project', default_branch: host.defaultBranch });
    }
    const command = args[1], pr = host.pr;
    if (command === 'view') return JSON.stringify({ ...pr, url: 'https://github.com/fixture/project/pull/12', mergeCommit: pr.state === 'MERGED' ? { oid: pr.headRefOid } : null });
    host.calls.push(command);
    if (command === 'edit') pr.body = args[args.indexOf('--body') + 1];
    if (command === 'ready') pr.isDraft = args.includes('--undo');
    if (command === 'merge') { await git(root, ['push', 'origin', `HEAD:refs/heads/${pr.baseRefName}`]); pr.state = 'MERGED'; }
    return '';
  };
  return host;
}
const start = (f, input = {}, operationId = 'start') => f.request('run.start', { runId: 'run-one', implementers: ['implementer-one'], ...input }, operationId);
const lightStart = (f, input = {}, operationId) => start(f, { rigor: { value: 'light', authority: instruction('Light for this one.'), reason: 'Small change' }, ...input }, operationId);
async function excludes(f) {
  const common = (await git(f.root, ['rev-parse', '--git-common-dir'])).trim();
  return (await readFile(join(f.root, common, 'info/exclude'), 'utf8')).split('\n').filter(line => line === `/${CONFIG}`);
}
const minimal = (featureId, branch = 'main') => ({ schemaVersion: 1, featureId,
  repositories: { repository: { path: '.', remote: 'origin', integrationBranch: branch, releaseBranch: branch, keepPullRequestsClosed: false } } });

test('absent: run start writes the minimal configuration, excludes it locally, records and reports it', async t => {
  const f = await repository(t);
  const before = await resolveWorkflowContext({ cwd: f.root });
  assert.equal(before.mode, 'legacy');
  await start(f);
  // The file: the current branch as the feature, the observed default branch as integration and release.
  const bytes = await readFile(join(f.root, CONFIG));
  assert.deepEqual(JSON.parse(bytes), minimal('feature-x'));
  assert.deepEqual(f.host.api, ['api --method GET repos/fixture/project']);
  // Local excludes, never committed: the file is not even untracked noise.
  assert.deepEqual(await excludes(f), [`/${CONFIG}`]);
  assert.equal((await git(f.root, ['status', '--porcelain', '--', CONFIG])).trim(), '');
  // The feature home is unchanged: the configured feature is the fallback branch.
  const after = await resolveWorkflowContext({ cwd: f.root });
  assert.equal(after.mode, 'configured'); assert.equal(after.featureId, before.featureId); assert.equal(after.featureHome, before.featureHome);
  assert.equal(after.repository.alias, 'repository');
  // Recorded with the run start, with what was observed, and the bytes retained.
  const [started] = await f.events();
  const record = started.payload.workspace;
  assert.equal(record.status, 'created'); assert.equal(record.operation, 'run.start'); assert.equal(record.featureId, 'feature-x');
  assert.deepEqual({ ...record.observed, observedAt: undefined }, { remote: 'origin', ownerRepo: 'fixture/project', defaultBranch: 'main', source: 'GET repos/fixture/project', observedAt: undefined });
  assert.deepEqual(record.configuration, minimal('feature-x'));
  assert.deepEqual(record.file, { hash: digest(bytes), bytes: bytes.length });
  assert.equal(record.exclude.added, true); assert.match(record.exclude.path, /info\/exclude$/u);
  const core = await f.core();
  assert.deepEqual(await core.store.get(record.file), bytes);
  // Reported in status and the snapshot.
  const status = await f.request('status');
  assert.equal(status.workspace.configured, true); assert.equal(status.workspace.recorded.status, 'created');
  assert.equal(status.workspace.message, null);
  assert.deepEqual(status.branches, [{ alias: 'repository', integrationBranch: 'main', releaseBranch: 'main' }]);
  assert.equal(status.current.workspace.status, 'created');
  // Excluding again is idempotent.
  assert.equal((await excludeConfiguration(f.root)).added, false);
  assert.deepEqual(await excludes(f), [`/${CONFIG}`]);
});

test('nothing is left behind when run start cannot proceed, and delegation at start writes nothing', async t => {
  const f = await repository(t);
  // Invalid input is refused before anything is observed or written.
  for (const input of [{ implementers: [] }, { implementers: ['x'], optionalGates: ['review'] }, { implementers: ['x'], workspace: { replace: false } }]) {
    const refused = await f.result('run.start', input, `bad-${JSON.stringify(input).length}`);
    assert.equal(refused.ok, false);
  }
  assert.deepEqual(f.host.api, []);
  assert.equal(await exists(join(f.root, CONFIG)), false);
  // Delegating at start still needs a configuration that already names a protected release branch.
  const delegated = await f.result('run.start', { runId: 'run-one', implementers: ['x'], autonomy: { value: 'delegated', authority: instruction('Delegate run-one.'), reason: 'Unattended' } }, 'delegated');
  assert.equal(delegated.ok, false); assert.match(delegated.error.message, /Delegation needs a configured release branch/u);
  assert.equal(await exists(join(f.root, CONFIG)), false);
  // A failure after the write (here an unreadable local ignore file, which the
  // adapter checks after the configuration is written) removes the unrecorded file.
  await rm(join(f.home, '.gatereeve-current/.gitignore'), { force: true }); // written by the refused delegated start, as before
  await mkdir(join(f.home, '.gatereeve-current/.gitignore'));
  const unsafe = await f.result('run.start', { runId: 'run-one', implementers: ['x'] }, 'unsafe');
  assert.equal(unsafe.ok, false); assert.match(unsafe.error.message, /unsupported type/u);
  assert.equal(f.host.api.length, 1);
  assert.equal(await exists(join(f.root, CONFIG)), false, 'the configuration written for the failed start is rolled back');
});

test('the guard protects the written default branch, including the matching refspec', async t => {
  const f = await repository(t);
  const decide = command => preToolUse({ cwd: f.root, tool_input: { command } }, { env: { PATH: '' } });
  for (const command of ['git push origin main', 'git push origin :']) assert.deepEqual(await decide(command), {}, `unconfigured: ${command}`);
  await start(f);
  for (const command of ['git push origin main', 'git push origin :', 'git push origin +:', 'git push origin HEAD:main']) {
    assert.match((await decide(command)).hookSpecificOutput?.permissionDecisionReason ?? '', /configured release branch main/u, command);
  }
  for (const command of ['git push origin feature-x', 'git push -u origin HEAD']) assert.deepEqual(await decide(command), {}, command);
});

test('same feature: an existing configuration naming the feature is used unchanged', async t => {
  for (const [branch, match] of [['feature-x', 'feature-branch'], ['feature-x-02-more', 'delivery-branch'], ['feature-x-int', 'integration-branch']]) {
    const config = { ...minimal('feature-x'), repositories: { repository: { path: '.', integrationBranch: branch === 'feature-x-int' ? 'feature-x-int' : 'main', releaseBranch: 'main' } } };
    const f = await repository(t, { branch, config });
    const original = await readFile(join(f.root, CONFIG));
    await start(f);
    assert.deepEqual(await readFile(join(f.root, CONFIG)), original, branch);
    assert.deepEqual(f.host.api, [], branch);
    const [started] = await f.events();
    assert.equal(started.payload.featureId, 'feature-x');
    assert.deepEqual({ ...started.payload.workspace, configPath: undefined }, { status: 'configured', operation: 'run.start', configPath: undefined, featureId: 'feature-x', branch, match }, branch);
  }
  // Ordinal 00 is not a delivery branch (workflow_context.py rule), nor are prefixes.
  const repo = { integrationBranch: 'main', releaseBranch: 'main' };
  assert.equal(branchFeatureMatch('feature-x', 'feature-x-00-more', repo), null);
  assert.equal(branchFeatureMatch('feature-x', 'feature-xy', repo), null);
  assert.equal(branchFeatureMatch('feature-x', 'main', repo), null);
  assert.equal(branchFeatureMatch('feature-x', '', repo), null);
});

test('different feature: run start stops, writes nothing, and replaces only on a human instruction', async t => {
  const f = await repository(t, { branch: 'new-feature', config: minimal('old-feature') });
  const original = await readFile(join(f.root, CONFIG));
  const oldHome = join(f.root, 'docs/issues/old-feature');
  // Never silently reused: the refusal names both features and both ways forward.
  const refused = await f.result('run.start', { runId: 'run-one', implementers: ['implementer-one'] }, 'start');
  assert.equal(refused.ok, false);
  assert.match(refused.error.message, /names feature old-feature, but run\.start runs on branch new-feature/u);
  assert.match(refused.error.message, /never silently reuses another feature's configuration/u);
  assert.match(refused.error.message, /"confirmFeature":"old-feature"/u); assert.match(refused.error.message, /"replace":true/u);
  assert.equal(refused.error.details.kind, 'workspace-feature-mismatch');
  assert.equal(await exists(oldHome), false, 'no feature home is created for the other feature');
  assert.deepEqual(await readFile(join(f.root, CONFIG)), original);
  // The snapshot reports the mismatch before any run exists.
  const snapshot = await f.request('status');
  assert.equal(snapshot.workspace.matchesBranch, false);
  assert.match(snapshot.workspace.message, /names feature old-feature, but the current branch is new-feature/u);
  // An instruction needs the observed human authority.
  await assert.rejects(start(f, { workspace: { replace: true } }), /needs the observed human instruction/u);
  await assert.rejects(start(f, { workspace: { replace: true, authority: { kind: 'agent', instruction: 'x', context: 'y' } } }), /observed human instruction is required/u);
  await assert.rejects(start(f, { workspace: { confirmFeature: 'new-feature', authority: instruction('Yes.') } }), /confirmFeature must name the configured feature old-feature/u);
  assert.throws(() => workspaceInstruction({ replace: false, authority: human }), /replace must be true/u);
  assert.throws(() => workspaceInstruction({ replace: true, confirmFeature: 'old-feature', authority: human }), /not both/u);
  assert.deepEqual(await readFile(join(f.root, CONFIG)), original);
  assert.deepEqual(f.host.api, []);
  // Replaced on the human's instruction, and recorded with the previous bytes retained.
  const authority = instruction('Replace the stale configuration for new-feature.');
  await start(f, { workspace: { replace: true, authority } }, 'start-replace');
  const replaced = await readFile(join(f.root, CONFIG));
  assert.deepEqual(JSON.parse(replaced), minimal('new-feature'));
  const context = await resolveWorkflowContext({ cwd: f.root });
  assert.equal(context.featureHome, f.home);
  const [started] = await f.events();
  const record = started.payload.workspace;
  assert.equal(record.status, 'replaced'); assert.equal(record.featureId, 'new-feature');
  assert.equal(record.previous.featureId, 'old-feature'); assert.deepEqual(record.previous.file, { hash: digest(original), bytes: original.length });
  assert.equal(record.authority.instruction, authority.instruction);
  assert.deepEqual(await (await f.core()).store.get(record.previous.file), original);
  assert.equal(await exists(join(oldHome, '.gatereeve-current')), false);
});

test('different feature: a human confirmation starts the run in the configured feature unchanged', async t => {
  const f = await repository(t, { branch: 'trent/odd-name', config: minimal('old-feature') });
  const original = await readFile(join(f.root, CONFIG));
  const authority = instruction('Yes, this branch is for old-feature.');
  await start(f, { workspace: { confirmFeature: 'old-feature', authority } });
  assert.deepEqual(await readFile(join(f.root, CONFIG)), original);
  const [started] = await f.events();
  assert.equal(started.payload.featureId, 'old-feature');
  assert.equal(started.payload.workspace.match, 'human-confirmed'); assert.equal(started.payload.workspace.authority.instruction, authority.instruction);
});

test('different feature: a stale configuration whose feature has a run stops start instead of pointing at that run', async t => {
  const f = await repository(t, { branch: 'old-feature' });
  await start(f);
  await git(f.root, ['checkout', '-b', 'next-feature']);
  const refused = await f.result('run.start', { runId: 'run-two', implementers: ['implementer-one'] }, 'start-next');
  assert.equal(refused.ok, false);
  assert.match(refused.error.message, /names feature old-feature, but run\.start runs on branch next-feature/u);
  assert.doesNotMatch(refused.error.message, /resume/u);
  await start(f, { workspace: { replace: true, authority: instruction('Replace it for next-feature.') }, runId: 'run-two' }, 'start-next-replace');
  assert.equal(JSON.parse(await readFile(join(f.root, CONFIG))).featureId, 'next-feature');
  // Replacing into a feature home that already holds a run is refused before anything is written.
  await git(f.root, ['checkout', 'old-feature']);
  const bytes = await readFile(join(f.root, CONFIG));
  const back = await f.result('run.start', { runId: 'run-three', implementers: ['implementer-one'], workspace: { replace: true, authority: instruction('Back to old-feature.') } }, 'start-back');
  assert.equal(back.ok, false); assert.match(back.error.message, /Current run already exists/u);
  assert.deepEqual(await readFile(join(f.root, CONFIG)), bytes, 'the configuration is not replaced when the start cannot proceed');
});

// NEW4: resumption that would start a fresh run is a run start.
const resume = (f, input = {}, operationId = 'resume') => f.result('run.resume-current', { implementers: ['implementer-one'], ...input }, operationId);
test('run.resume-current starting a fresh run applies the different-feature check before creating anything', async t => {
  const f = await repository(t, { branch: 'new-feature', config: minimal('old-feature') });
  const original = await readFile(join(f.root, CONFIG));
  const oldHome = join(f.root, 'docs/issues/old-feature');
  const refused = await resume(f);
  assert.equal(refused.ok, false);
  assert.match(refused.error.message, /names feature old-feature, but run\.resume-current runs on branch new-feature/u);
  assert.equal(refused.error.details.kind, 'workspace-feature-mismatch');
  assert.equal(await exists(oldHome), false, 'no feature home is created for the other feature');
  assert.equal((await f.request('status')).mode, 'current-entry');
  assert.deepEqual(await readFile(join(f.root, CONFIG)), original);
  await assert.rejects(f.request('run.resume-current', { implementers: ['implementer-one'], workspace: { confirmFeature: 'old-feature' } }, 'resume-unconfirmed'), /needs the observed human instruction/u);
  assert.equal(await exists(oldHome), false);
  // With the human's confirmation the fresh run starts in the configured feature, recorded.
  const authority = instruction('Yes, resume old-feature from this branch.');
  const resumed = await resume(f, { workspace: { confirmFeature: 'old-feature', authority } }, 'resume-confirmed');
  assert.equal(resumed.ok, true, JSON.stringify(resumed.error));
  assert.deepEqual(await readFile(join(f.root, CONFIG)), original);
  const [started] = await f.events();
  assert.equal(started.payload.featureId, 'old-feature');
  assert.deepEqual({ ...started.payload.workspace, configPath: undefined, authority: undefined },
    { status: 'configured', operation: 'run.resume-current', configPath: undefined, featureId: 'old-feature', branch: 'new-feature', match: 'human-confirmed', authority: undefined });
  assert.equal(started.payload.workspace.authority.instruction, authority.instruction);
  // A replacement works the same way for a fresh resume.
  const g = await repository(t, { branch: 'new-feature', config: minimal('old-feature') });
  assert.equal((await resume(g, { workspace: { replace: true, authority: instruction('Replace it.') } }, 'resume-replace')).ok, true);
  assert.equal(JSON.parse(await readFile(join(g.root, CONFIG))).featureId, 'new-feature');
  assert.equal((await g.events())[0].payload.workspace.status, 'replaced');
});

test('run.resume-current: an unconfigured fresh resume writes the configuration as run.start does; genuine resumption writes nothing', async t => {
  // Chosen rule: a fresh run started by resumption is a run start (spec AC6
  // "when a run starts"), so it observes and writes exactly like run.start.
  const f = await repository(t);
  await mkdir(f.home, { recursive: true });
  await writeFile(join(f.home, 'interview.md'), '# Interview\nEarlier work.\n');
  const resumed = await resume(f);
  assert.equal(resumed.ok, true, JSON.stringify(resumed.error));
  assert.deepEqual(JSON.parse(await readFile(join(f.root, CONFIG))), minimal('feature-x'));
  assert.deepEqual(await excludes(f), [`/${CONFIG}`]);
  const [started] = await f.events();
  assert.equal(started.payload.workspace.status, 'created'); assert.equal(started.payload.workspace.operation, 'run.resume-current');
  assert.equal(f.host.api.length, 1);
  // Genuine resumption of the existing run: no observation, no write, no workspace record.
  const bytes = await readFile(join(f.root, CONFIG));
  const count = (await f.events()).length;
  const again = await resume(f, {}, 'resume-again');
  assert.equal(again.ok, true, JSON.stringify(again.error));
  assert.equal(f.host.api.length, 1);
  assert.deepEqual(await readFile(join(f.root, CONFIG)), bytes);
  assert.ok((await f.events()).slice(count).every(event => !event.payload?.workspace && event.type !== 'WORKSPACE_CONFIGURED'));
  // A workspace instruction is never dropped silently on a genuine resumption.
  const instructed = await resume(f, { workspace: { replace: true, authority: instruction('Replace it.') } }, 'resume-instructed');
  assert.equal(instructed.ok, false);
  assert.match(instructed.error.message, /Workspace instructions apply only when resumption starts a fresh run/u);
  // Unchanged from before S8: genuinely resuming the existing run is not a run
  // start, so it is not subject to the branch check (no new records are created).
  await git(f.root, ['checkout', '-b', 'other-branch']);
  const elsewhere = await resume(f, {}, 'resume-elsewhere');
  assert.equal(elsewhere.ok, true, JSON.stringify(elsewhere.error));
  assert.equal(await exists(join(f.root, 'docs/issues/other-branch')), false);
  assert.deepEqual(await readFile(join(f.root, CONFIG)), bytes);
});

test('no GitHub remote: nothing is written, the run starts, status and merge preparation say what delivery needs', async t => {
  for (const remote of [null, 'https://gitlab.example/fixture/project.git']) {
    const f = await repository(t, { remote });
    await start(f);
    assert.equal(await exists(join(f.root, CONFIG)), false);
    assert.equal(await readFile(join(f.root, (await git(f.root, ['rev-parse', '--git-common-dir'])).trim(), 'info/exclude'), 'utf8').then(text => text.includes(CONFIG), () => false), false);
    assert.deepEqual(f.host.api, []);
    const [started] = await f.events();
    assert.equal(started.payload.workspace.status, 'unconfigured');
    assert.match(started.payload.workspace.reason, /no GitHub remote/u);
    const status = await f.request('status');
    assert.equal(status.workspace.configured, false); assert.equal(status.workspace.mode, 'legacy');
    assert.match(status.workspace.message, /Delivery needs a workspace configuration .*not written at run start because the repository has no GitHub remote.*workspace\.configure/u);
    assert.ok(status.actions.some(item => item.id === 'configure-workspace' && item.operation === 'workspace.configure'));
    // The standalone operation applies the same rules and reports why it cannot write.
    const configure = await f.result('workspace.configure', {}, 'configure');
    assert.equal(configure.ok, false); assert.match(configure.error.message, /was not written: the repository has no GitHub remote/u);
  }
});

test('merge preparation in an unconfigured workspace names workspace.configure through an available entry point', async t => {
  const f = await repository(t, { remote: null });
  await start(f);
  f.runtime.entryPoints = { adapter: '/opt/gatereeve/resources/protocol/plugin-adapter.js', cli: null };
  const prepared = await f.result('merge.prepare', { repository: 'repository', number: 12 }, 'prepare');
  assert.equal(prepared.ok, false);
  assert.match(prepared.error.message, /Merge preparation needs a workspace configuration \(\.agentic-workflow\.json\)/u);
  assert.match(prepared.error.message, /Write it with workspace\.configure \(bundled adapter: node '\/opt\/gatereeve\/resources\/protocol\/plugin-adapter\.js' --request-file <request\.json>, with request \{"operation":"workspace\.configure"/u);
  assert.doesNotMatch(prepared.error.message, /gatereeve workspace configure/u);
  assert.equal(prepared.error.details.operation, 'workspace.configure');
  f.runtime.entryPoints = { adapter: null, cli: '/usr/local/bin/gatereeve' };
  assert.match((await f.result('merge.prepare', { repository: 'repository', number: 12 })).error.message, /CLI: gatereeve workspace configure --help/u);
  f.runtime.entryPoints = { adapter: null, cli: null };
  assert.match((await f.result('merge.prepare', { repository: 'repository', number: 12 })).error.message, /No GateReeve entry point was found/u);
});

test('default branch unobservable: nothing is written, the run starts and the reason is recorded', async t => {
  const f = await repository(t);
  f.host.apiFailure = 'HTTP 403: Resource not accessible by integration';
  await start(f);
  assert.equal(await exists(join(f.root, CONFIG)), false);
  const [started] = await f.events();
  assert.equal(started.payload.workspace.status, 'unconfigured');
  assert.match(started.payload.workspace.reason, /the default branch of fixture\/project could not be observed \(GET repos\/fixture\/project: HTTP 403/u);
  assert.match((await f.request('status')).workspace.message, /could not be observed/u);
  // A malformed answer, and a run started on the default branch itself, also write nothing.
  for (const [setup, reason] of [[host => { host.apiFailure = null; host.defaultBranch = 'bad..name'; }, /did not report a usable default branch/u],
    [host => { host.defaultBranch = 'feature-x'; }, /is the default branch; start the run on a feature branch/u]]) {
    const g = await repository(t);
    setup(g.host);
    await start(g);
    assert.equal(await exists(join(g.root, CONFIG)), false);
    assert.match((await g.events())[0].payload.workspace.reason, reason);
  }
});

test('workspace.configure writes the configuration for an existing unconfigured run, once', async t => {
  const f = await repository(t);
  // No run: run.start is the operation that writes it.
  const early = await f.result('workspace.configure', {}, 'early');
  assert.equal(early.ok, false); assert.match(early.error.message, /No current run for this feature\. run\.start writes the workspace configuration/u);
  f.host.apiFailure = 'HTTP 502: Bad Gateway';
  await start(f);
  assert.equal(await exists(join(f.root, CONFIG)), false);
  f.host.apiFailure = null;
  const configured = await f.request('workspace.configure', {}, 'configure');
  assert.equal(configured.written, true); assert.equal(configured.workspace.status, 'created'); assert.equal(configured.workspace.operation, 'workspace.configure');
  assert.equal(configured.event.type, 'WORKSPACE_CONFIGURED');
  assert.deepEqual(JSON.parse(await readFile(join(f.root, CONFIG))), minimal('feature-x'));
  assert.deepEqual(await excludes(f), [`/${CONFIG}`]);
  const status = await f.request('status');
  assert.equal(status.workspace.configured, true); assert.equal(status.workspace.recorded.operation, 'workspace.configure');
  assert.equal(status.current.workspace.event, configured.event.hash);
  assert.ok(!status.actions.some(item => item.id === 'configure-workspace'));
  // Repeating it changes nothing and records nothing new.
  const again = await f.request('workspace.configure', {}, 'configure-again');
  assert.equal(again.written, false); assert.equal(again.workspace.status, 'configured');
  assert.equal((await f.events()).filter(event => event.type === 'WORKSPACE_CONFIGURED').length, 1);
});

// The end-to-end path R8 requires: a repository that had no configuration
// reaches a per-PR human merge into its default branch, in both rigors.
for (const rigor of ['full', 'light']) test(`freshly configured repository completes a per-PR human merge into the default branch (${rigor})`, async t => {
  const f = await repository(t);
  await mkdir(f.home, { recursive: true });
  if (rigor === 'light') await writeFile(join(f.home, 'brief.md'), BRIEF);
  else await writeFullDocuments(f.home);
  if (rigor === 'light') await lightStart(f);
  else await start(f);
  assert.equal((await f.request('status')).workspace.recorded.status, 'created');
  const commitments = async () => (await (await f.core()).commitments()).subject;
  if (rigor === 'light') await f.request('human.decide', { kind: 'authorize-implementation', subject: await commitments(), authority: instruction('The brief looks right.'), reason: 'Confirmed brief', consequences: 'May implement' }, 'authorize');
  else {
    const design = await (await f.core()).store.capture('design.md');
    await f.request('human.decide', { kind: 'approve-design', subject: design.hash, authority: instruction('Design approved.'), reason: 'Approved', consequences: 'Spec' }, 'design');
    await f.request('spec.validate', {}, 'spec');
    await f.request('human.decide', { kind: 'authorize-implementation', subject: await commitments(), authority: instruction('Implement it.'), reason: 'Approved scope', consequences: 'May implement' }, 'authorize');
  }
  await writeFile(join(f.root, 'app.js'), 'export const answer = 42;\n');
  await git(f.root, ['add', 'app.js']); await git(f.root, ['commit', '-m', 'answer 42']);
  await git(f.root, ['push', 'origin', 'HEAD:refs/heads/feature-x']);
  const head = (await git(f.root, ['rev-parse', 'HEAD'])).trim();
  const target = (await git(f.root, ['ls-remote', 'origin', 'refs/heads/main'])).split(/\s/u)[0];
  await f.request('candidate.prepare', { repositories: [{ alias: 'repository', base: f.base, head, target }], scope: 'SLICE', criteria: rigor === 'light' ? ['brief'] : ['R1'] }, 'candidate');
  await f.request('candidate.ready', {}, 'ready');
  const refs = [...(await f.request('gate.execute', { gates: ['verification'], configuration: { validation: { kind: 'alternative', reason: 'Fixture has no hosted CI', scope: 'The approved criterion' },
    checks: [{ repository: 'repository', command: process.execPath, args: ['-e', 'process.exit(0)'], purpose: 'Fixture verification' }] } }, 'verify')).event.payload.results];
  evaluator({ core: { runtime: f.runtime } });
  pairExistingEvaluator({ core: { runtime: f.runtime } });
  await f.request('review.select', selection(), 'select');
  refs.push(...(await f.request('review.execute', {}, 'review')).event.payload.outcomes.flatMap(row => row.results));
  refs.push(...(await f.request('gate.execute', { gates: ['context'] }, 'context')).event.payload.results);
  await f.request('gate.execute', { gates: ['packet'], consumed: refs }, 'packet');
  const subject = (await f.request('status')).current.candidate.hash;
  f.host.pr = { number: 12, state: 'OPEN', isDraft: true, headRefName: 'feature-x', baseRefName: 'main', headRefOid: head, baseRefOid: f.base, body: 'Change.', mergeStateStatus: 'CLEAN', reviewDecision: '' };
  const action = await f.request('merge.prepare', { repository: 'repository', number: 12 }, 'prepare');
  assert.equal(action.deliveryTarget, 'release');
  assert.deepEqual([action.headBranch, action.baseBranch, action.head], ['feature-x', 'main', head]);
  // integration == release: no standing authority exists.
  await assert.rejects(f.request('human.decide', { kind: 'authorize-standing', subject: await commitments(),
    scope: { actions: ['accept'], candidateScopes: ['SLICE'], repositories: [{ alias: 'repository', headPrefix: 'feature-x', baseBranch: 'main' }], expiresAt: null },
    authority: instruction('Merge slices overnight.'), reason: 'Unattended', consequences: 'Slices merge' }, 'standing'), /same branch \(main\); no standing acceptance or merge authority exists/u);
  await f.request('review.publish', { repository: 'repository', number: 12 }, 'publish');
  await f.request('human.decide', { kind: 'accept', subject, actions: ['authorize-merge'], action, authority: instruction('Merge #12 into main.'),
    reason: 'Per-PR instruction', consequences: 'Merge into the default branch' }, 'authorize-merge');
  await f.request('merge.execute', { repository: 'repository', number: 12 }, 'merge');
  assert.deepEqual(f.host.calls, ['edit', 'ready', 'checks', 'merge']);
  const status = await f.request('status');
  assert.equal(status.current.integrations.repository.branch, 'main');
  assert.equal(status.current.integrations.repository.integrationSha, head);
  assert.equal(status.dials.rigor, rigor);
});
