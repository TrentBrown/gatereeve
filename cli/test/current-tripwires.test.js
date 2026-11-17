// Escalation tripwires (spec AC4, R6): built-in category classifiers,
// repository configuration, and supervised dispositions. Delegated hits are in
// current-delegation.test.js.
import assert from 'node:assert/strict';
import { isolatedTests } from './helpers/isolated-tests.js';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { git } from '../../plugin-src/shared/resources/protocol/current/evidence.js';
import { treeEntries } from '../../plugin-src/shared/resources/protocol/current/git-source.js';
import { evaluateTripwires, globExpression, parseTripwireConfig, tripwireSubject, TRIPWIRE_CONFIG } from '../../plugin-src/shared/resources/protocol/current/tripwires.js';
import { TRIPWIRE_CATEGORIES } from '../../plugin-src/shared/resources/protocol/current/contracts.js';
import { fixture, human, branchWith, candidate, gates, acceptanceMissing, writeFullDocuments } from './helpers/lightweight-fixture.js';

const test = isolatedTests(import.meta.url);

// A minimal repository and candidate-shaped value over two commits.
async function diff(t, before, after) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gatereeve-tripwire-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, ['init', '-b', 'main']);
  await git(root, ['config', 'user.email', 'fixture@example.test']); await git(root, ['config', 'user.name', 'Fixture']);
  await git(root, ['config', 'commit.gpgsign', 'false']);
  const commit = async files => {
    for (const [path, body] of Object.entries(files)) {
      if (body === null) { await git(root, ['rm', '-q', path]); continue; }
      await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), body);
    }
    await git(root, ['add', '-A']); await git(root, ['commit', '--allow-empty', '-m', 'step']);
    return (await git(root, ['rev-parse', 'HEAD'])).trim();
  };
  const base = await commit({ 'README.md': '# Fixture\n', ...before });
  const head = await commit(after);
  const repository = { alias: 'app', path: root };
  const value = { repositories: [{ alias: 'app', base, head, baseFiles: await treeEntries(repository, base, 'sha1'), files: await treeEntries(repository, head, 'sha1') }] };
  return evaluateTripwires({ repositories: [repository] }, value);
}
const categories = evaluation => [...new Set(evaluation.hits.map(hit => hit.category))].sort();
const rules = evaluation => evaluation.hits.map(hit => `${hit.category}:${hit.rule}:${hit.path}${hit.line ? `:${hit.line}` : ''}`);

test('each built-in category triggers on a representative diff', async t => {
  const cases = {
    'migrations-schema': { 'db/migrations/0001_users.sql': 'CREATE TABLE users (id integer);\n' },
    'auth-security': { 'src/auth/session.js': 'export const ttl = 60;\n' },
    secrets: { 'src/config.js': 'export const region = "eu";\nexport const awsKey = "AKIAABCDEFGHIJKLMNOP";\n' },
    'public-api': { 'api/openapi.yaml': 'openapi: 3.0.0\n' },
    'data-deletion': { 'scripts/cleanup.js': 'export async function purge(db) {\n  await db.users.deleteMany({});\n}\n' },
  };
  assert.deepEqual(Object.keys(cases).sort(), [...TRIPWIRE_CATEGORIES].sort());
  for (const [category, change] of Object.entries(cases)) {
    const evaluation = await diff(t, {}, change);
    assert.ok(categories(evaluation).includes(category), `${category}: ${rules(evaluation).join(', ')}`);
    assert.ok(evaluation.subject, category);
  }
  const secret = await diff(t, {}, cases.secrets);
  assert.deepEqual(rules(secret), ['secrets:aws-access-key:src/config.js:2']);
  // Content hits record the rule and line, never the matched text.
  assert.doesNotMatch(JSON.stringify(secret), /AKIAABCDEFGHIJKLMNOP/);
  assert.deepEqual(rules(await diff(t, {}, cases['data-deletion'])), ['data-deletion:bulk-delete-call:scripts/cleanup.js:2']);
  const migration = await diff(t, {}, cases['migrations-schema']);
  assert.deepEqual(rules(migration), ['migrations-schema:ddl-statement:db/migrations/0001_users.sql:1',
    'migrations-schema:migration-directory:db/migrations/0001_users.sql', 'migrations-schema:sql-file:db/migrations/0001_users.sql']);
  // More forms: env file, private key, SQL deletion, protobuf, deleted migration.
  assert.deepEqual(rules(await diff(t, {}, { '.env.local': 'X=1\n' })), ['secrets:env-file:.env.local']);
  assert.deepEqual(rules(await diff(t, {}, { 'keys/deploy.txt': '-----BEGIN OPENSSH PRIVATE KEY-----\n' })), ['secrets:private-key:keys/deploy.txt:1']);
  assert.deepEqual(rules(await diff(t, {}, { 'jobs/prune.py': 'cursor.execute("DELETE FROM sessions WHERE stale")\n' })), ['data-deletion:sql-delete:jobs/prune.py:1']);
  assert.deepEqual(rules(await diff(t, {}, { 'proto/service.proto': 'syntax = "proto3";\n' })), ['public-api:protobuf:proto/service.proto']);
  assert.deepEqual(rules(await diff(t, { 'migrations/0001.py': 'pass\n' }, { 'migrations/0001.py': null })), ['migrations-schema:migration-directory:migrations/0001.py']);
});

test('ordinary changes, unchanged lines and prose do not trigger', async t => {
  assert.deepEqual((await diff(t, { 'src/app.js': 'export const a = 1;\n' }, { 'src/app.js': 'export const a = 2;\n', 'docs/guide.md': 'Delete from the list and drop the table of contents.\n' })).hits, []);
  // A matching line already in the base is not an addition.
  const unchanged = await diff(t, { 'src/db.js': 'run("DELETE FROM cache");\n' }, { 'src/db.js': 'run("DELETE FROM cache");\nexport const x = 1;\n' });
  assert.deepEqual(unchanged.hits, []); assert.equal(unchanged.subject, null);
  // "author" is not auth; binary files are classified by path only.
  assert.deepEqual((await diff(t, {}, { 'src/author.js': 'x\n', 'img/logo.bin': Buffer.from([0, 1, 2, 3]) })).hits, []);
  const binary = await diff(t, {}, { 'img/logo.bin': Buffer.concat([Buffer.from('AKIAABCDEFGHIJKLMNOP'), Buffer.from([0])]) });
  assert.deepEqual(binary.hits, []); assert.deepEqual(binary.skipped, [{ repository: 'app', path: 'img/logo.bin', reason: 'binary' }]);
});

test('repository configuration extends and narrows categories from the pinned base', async t => {
  const config = JSON.stringify({ schemaVersion: 1, categories: {
    'public-api': { paths: ['contracts/**'], content: [{ pattern: 'export\\s+interface', ignoreCase: true }] },
    secrets: { excludePaths: ['test/fixtures/**'] },
    'auth-security': { builtIn: false },
  } });
  const evaluation = await diff(t, { [TRIPWIRE_CONFIG]: config }, {
    'contracts/platform.json': '{}\n', 'src/types.ts': 'EXPORT INTERFACE Shape {}\n',
    'test/fixtures/key.pem': 'not a key\n', 'src/auth/login.js': 'x\n', 'other/id.pem': 'y\n' });
  assert.deepEqual(evaluation.hits.map(hit => `${hit.category}:${hit.source}:${hit.path}`), [
    'public-api:repository:src/types.ts', 'public-api:repository:contracts/platform.json', 'secrets:built-in:other/id.pem']);
  assert.equal(evaluation.configurations[0].oid !== null, true);
  // The head cannot weaken its own tripwires; changing the configuration is itself a hit.
  const weakened = await diff(t, {}, { [TRIPWIRE_CONFIG]: JSON.stringify({ schemaVersion: 1, categories: { 'public-api': { builtIn: false } } }), 'api/openapi.json': '{}\n' });
  assert.deepEqual(rules(weakened), ['auth-security:tripwire-configuration:.gatereeve/tripwires.json', 'public-api:openapi-document:api/openapi.json']);
  const disabled = await diff(t, { [TRIPWIRE_CONFIG]: JSON.stringify({ schemaVersion: 1, categories: { 'auth-security': { builtIn: false } } }) },
    { [TRIPWIRE_CONFIG]: JSON.stringify({ schemaVersion: 1, categories: {} }) });
  assert.deepEqual(rules(disabled), ['auth-security:tripwire-configuration:.gatereeve/tripwires.json']);
  // Invalid configuration fails closed: evaluation is unavailable, never empty.
  for (const [bytes, pattern] of [['{', /not valid JSON/], [JSON.stringify({ schemaVersion: 2 }), /schemaVersion/],
    [JSON.stringify({ schemaVersion: 1, categories: { performance: {} } }), /unknown tripwire category performance/],
    [JSON.stringify({ schemaVersion: 1, categories: { secrets: { paths: 'x' } } }), /must be an array/],
    [JSON.stringify({ schemaVersion: 1, categories: { secrets: { content: ['('] } } }), /Invalid tripwire content pattern/]]) {
    assert.throws(() => parseTripwireConfig(Buffer.from(bytes)), pattern);
    await assert.rejects(diff(t, { [TRIPWIRE_CONFIG]: bytes }, { 'src/a.js': 'x\n' }), pattern);
  }
  assert.ok(globExpression('*.sql').test('db/x.sql')); assert.ok(globExpression('db/**/*.sql').test('db/a/b/x.sql'));
  assert.ok(globExpression('db/**/*.sql').test('db/x.sql')); assert.ok(!globExpression('db/*.sql').test('db/a/x.sql'));
  assert.ok(globExpression('{api,contracts}/**').test('contracts/a.json'));
});

test('supervised light: a hit blocks acceptance until a hit-bound human stay-light decision', async t => {
  const f = await fixture(t);
  const head = await branchWith(f, 'topic', { 'app.js': 'export const answer = 42;\n', 'db/migrations/0001.sql': 'ALTER TABLE t ADD COLUMN c int;\n' });
  const prepared = await candidate(f, 'SLICE', head);
  assert.deepEqual(prepared.tripwires.hits.map(hit => hit.rule).sort(), ['add-column', 'ddl-statement', 'migration-directory', 'sql-file']);
  assert.equal(prepared.tripwires.escalated, false);
  let status = await f.request('status');
  assert.equal(status.tripwires.stage, 'candidate.prepare'); assert.equal(status.tripwires.subject, prepared.tripwires.subject);
  assert.equal(status.dials.rigor.value, 'light');
  await gates(f);
  const missing = await acceptanceMissing(f);
  assert.match(missing, /tripwire: 4 tripwire hits \(migrations-schema\).*escalate to full \(run\.set-dial rigor full\) or record a human stay-light decision/);
  const { currentSnapshot } = await import('../../plugin-src/shared/resources/protocol/current/adapter.js');
  const snapshot = await currentSnapshot(f.context, {}, { gh: f.core.runtime.gh, entryPoints: { adapter: null, cli: null } });
  assert.equal(snapshot.tripwires.hits.length, 4);
  assert.ok(snapshot.blockers.some(item => item.type === 'tripwire' && /Stop for the human/.test(item.message)));
  await assert.rejects(f.request('milestone.pass', { name: 'acceptance' }, 'blocked'), /blocked/);
  const stay = (subject, operationId, authority = { ...human, instruction: 'Stay light; the migration is a test fixture.' }) => f.request('human.decide', {
    kind: 'stay-light', subject, authority, reason: 'Fixture-only migration', consequences: 'Accepted at light rigor despite the hit' }, operationId);
  await assert.rejects(stay(`sha256:${'0'.repeat(64)}`, 'wrong-subject'), /must bind the current tripwire hit set/);
  // The agent cannot record it: a non-human authority is refused.
  await assert.rejects(stay(prepared.tripwires.subject, 'agent', { kind: 'agent', instruction: 'x', context: 'y' }), /observed human instruction/);
  await assert.rejects(stay(prepared.tripwires.subject, 'delegated-kind', { kind: 'delegated-evaluator', delegation: `sha256:${'1'.repeat(64)}`, evaluation: `sha256:${'2'.repeat(64)}` }), /Delegated authority covers only approve-design and authorize-implementation/);
  const decided = await stay(prepared.tripwires.subject, 'stay');
  assert.deepEqual(decided.event.payload.hits.length, 4);
  const check = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(check.allowed, true, check.missing.join('; '));
  assert.equal(check.tripwires.coveredByStayLight, true);
  status = await f.request('status');
  assert.ok(!status.milestones.find(item => item.name === 'acceptance').missing.some(item => item.startsWith('tripwire')));
  await f.request('milestone.pass', { name: 'acceptance' }, 'acceptance');

  // A new hit needs a new decision: the earlier one does not cover it.
  const second = await branchWith(f, 'topic', { 'src/auth/token.js': 'export const ttl = 5;\n' });
  const next = await candidate(f, 'SLICE', second, 'candidate-two');
  assert.notEqual(next.tripwires.subject, prepared.tripwires.subject);
  await gates(f, '-two');
  assert.match(await acceptanceMissing(f), /tripwire: 5 tripwire hits \(auth-security, migrations-schema\)/);
  await assert.rejects(stay(prepared.tripwires.subject, 'stale-subject'), /must bind the current tripwire hit set/);
  await stay(next.tripwires.subject, 'stay-two');
  assert.equal((await f.request('milestone.check', { name: 'acceptance' })).allowed, true);
});

test('supervised light: escalating to full is the other way past a hit; full runs are not classified', async t => {
  const f = await fixture(t);
  const head = await branchWith(f, 'topic', { 'app.js': 'export const answer = 42;\n', 'src/security/policy.js': 'export default {};\n' });
  await candidate(f, 'SLICE', head);
  await f.request('run.set-dial', { dial: 'rigor', value: 'full', actor: 'agent', reason: 'Tripwire hit on security policy' }, 'raise');
  const status = await f.request('status');
  assert.equal(status.dials.rigor.value, 'full'); assert.equal(status.phase, 'DESIGNING');
  // Full commitments now apply; stay-light is meaningless once rigor is full.
  await writeFullDocuments(f.home);
  const missing = await acceptanceMissing(f);
  assert.match(missing, /current implementation authorization/); assert.doesNotMatch(missing, /tripwire/);
  await assert.rejects(f.request('human.decide', { kind: 'stay-light', subject: status.tripwires.subject, authority: human, reason: 'x', consequences: 'y' }, 'stay'), /already full rigor/);

  const full = await fixture(t, { rigor: 'full' });
  const fullHead = await branchWith(full, 'topic', { 'app.js': 'export const answer = 42;\n', 'db/migrations/1.sql': 'DROP TABLE t;\n' });
  const prepared = await candidate(full, 'SLICE', fullHead);
  assert.equal(prepared.tripwires, undefined);
  assert.equal((await full.request('status')).tripwires, null);
});

test('a light run without hits is unaffected', async t => {
  const f = await fixture(t);
  const head = await branchWith(f, 'topic', 'export const answer = 42;\n');
  const prepared = await candidate(f, 'SLICE', head);
  assert.deepEqual(prepared.tripwires, { hits: [], subject: null, escalated: false });
  await gates(f);
  const check = await f.request('milestone.check', { name: 'acceptance' });
  assert.equal(check.allowed, true, check.missing.join('; '));
  assert.deepEqual(check.tripwires.hits, []);
  const status = await f.request('status');
  assert.equal(status.dials.rigor.value, 'light');
  assert.equal(tripwireSubject([]).startsWith('sha256:'), true);
});
