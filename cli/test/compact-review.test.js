import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { buildCompactReviewInput, createPinnedRepositorySnapshot, executeAgentWorkflowGate,
  loadDefaultModel, sha256Digest } from '../../plugin-src/shared/resources/protocol/index.js';
import { createJudgeBundle } from '../../plugin-src/shared/resources/agent-workflows/judge/validator.js';

const exec = promisify(execFile);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve-compact-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = async (...args) => (await exec('git', ['-C', root, ...args])).stdout.trim();
  await git('init', '-q', '-b', 'tb-test');
  await git('config', 'user.name', 'Test'); await git('config', 'user.email', 'test@example.invalid');
  const featureHome = join(root, 'docs/issues/feature');
  await mkdir(featureHome, { recursive: true });
  await writeFile(join(featureHome, 'spec.md'), '# Spec\nApproved behavior\n| R1 | Behavior | Pass | Fail | Evidence |\n');
  await writeFile(join(featureHome, 'design.md'), '# Design\n\n**Status:** approved\n');
  await writeFile(join(root, 'app.txt'), 'before\n');
  await writeFile(join(featureHome, 'decisions.md'), 'PRIVATE REVIEW HISTORY SENTINEL\n');
  await git('add', '.'); await git('commit', '-qm', 'base');
  const baseSha = await git('rev-parse', 'HEAD');
  const commit = async () => { await git('add', '-A'); await git('commit', '-qm', 'change'); return git('rev-parse', 'HEAD'); };
  const build = (headSha, extra = {}) => buildCompactReviewInput({ repositoryRoot: root, featureHome,
    baseSha, headSha, scope: 'SLICE', ...extra });
  return { root, featureHome, git, baseSha, commit, build };
}

async function snapshot(f, compact, headSha) {
  return createPinnedRepositorySnapshot({ repositoryRoot: f.root, headSha,
    evidenceFiles: compact.evidenceFiles, excludedPaths: compact.excludedPaths,
    expectedEntries: compact.expectedEntries,
    reviewView: compact.change.reviewView });
}

test('history is absent from documents, patch chunks and repository view; allowed source remains', async (t) => {
  const f = await fixture(t);
  await mkdir(join(f.featureHome, 'pr-1/attempts/a1'), { recursive: true });
  await writeFile(join(f.featureHome, 'pr-1/attempts/a1/judge.md'), 'EARLIER FINDING SENTINEL\n');
  await writeFile(join(f.root, 'app.txt'), 'after\n');
  const head = await f.commit(); const compact = await f.build(head); t.after(compact.cleanup);
  const view = await snapshot(f, compact, head); t.after(view.cleanup);
  assert.deepEqual(Object.keys(compact.change.documents), ['spec.md', 'design.md']);
  assert.deepEqual(compact.change.changedFiles, ['app.txt']);
  assert.equal(JSON.stringify(compact.change).includes('PRIVATE REVIEW'), false);
  for (const path of compact.excludedPaths) await assert.rejects(access(join(view.repositoryPath, path)), /ENOENT/);
  const index = JSON.parse(await readFile(join(view.repositoryPath, compact.change.patch.path), 'utf8'));
  const text = (await Promise.all(index.chunks.map((ref) => readFile(join(view.repositoryPath, ref.path), 'utf8')))).join('');
  assert.match(text, /\+after/u); assert.equal(text.includes('SENTINEL'), false);
  assert.equal(await readFile(join(view.repositoryPath, 'app.txt'), 'utf8'), 'after\n');
  assert.ok(compact.audit.excludedPaths.includes('docs/issues/feature/decisions.md'));
  assert.equal(await access(join(view.repositoryPath, 'judge-view-audit.json')).then(() => true, () => false), false);
});

test('compact snapshots preserve exact source despite archive export attributes', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.root, '.gitattributes'), 'app.txt export-ignore\nsubstitute.txt export-subst\n');
  await writeFile(join(f.root, 'substitute.txt'), '$Format:%H$\n');
  await writeFile(join(f.root, 'app.txt'), 'required source\n');
  const head = await f.commit(); const compact = await f.build(head); t.after(compact.cleanup);
  const view = await snapshot(f, compact, head); t.after(view.cleanup);
  assert.equal(await readFile(join(view.repositoryPath, 'app.txt'), 'utf8'), 'required source\n');
  assert.equal(await readFile(join(view.repositoryPath, 'substitute.txt'), 'utf8'), '$Format:%H$\n');
  await assert.rejects(access(join(view.repositoryPath, '../objects/.git')), /ENOENT/);
});

test('declared criteria cannot omit whole-feature obligations or invent rubric IDs', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.featureHome, 'spec.md'), '# Spec\n| R1 | One | Pass | Fail | Evidence |\n| R2 | Two | Pass | Fail | Evidence |\n');
  const head = await f.commit();
  const slice = await f.build(head, { criteria: ['R1'] }); t.after(slice.cleanup);
  assert.deepEqual(slice.change.criteria, ['R1']);
  await assert.rejects(f.build(head, { scope: 'FEATURE', sliceBaseSha: f.baseSha, criteria: ['R1'] }), /full rubric/u);
  await assert.rejects(f.build(head, { criteria: ['R99'] }), /approved scope/u);
  await assert.rejects(f.build(head, { criteria: ['R1', 'R1'] }), /approved scope/u);
});

test('history aliases, symlinks and cross-boundary renames reject rather than hide production paths', async (t) => {
  for (const kind of ['copy', 'symlink', 'rename']) {
    const f = await fixture(t);
    const source = join(f.featureHome, 'decisions.md');
    if (kind === 'copy') await writeFile(join(f.root, 'alias.txt'), await readFile(source));
    if (kind === 'symlink') await symlink('docs/issues/feature/decisions.md', join(f.root, 'alias'));
    if (kind === 'rename') await rename(source, join(f.root, 'alias.txt'));
    await assert.rejects(f.build(await f.commit()), /aliased|symlink|boundary/u);
  }
});

test('missing approval and unclassified production code in record locations fail closed', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.featureHome, 'design.md'), '# Design\n**Status:** draft\n');
  await assert.rejects(f.build(await f.commit()), /reconciliation/u);
  await writeFile(join(f.featureHome, 'design.md'), '# Design\n**Status:** approved\n');
  await mkdir(join(f.featureHome, 'advisory/a1'), { recursive: true });
  await writeFile(join(f.featureHome, 'advisory/a1/production.js'), 'export const source = true;');
  await assert.rejects(f.build(await f.commit()), /Unclassified/u);
});

test('empty files shared with empty history do not contain leaked review information', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.featureHome, 'decisions.md'), '');
  await writeFile(join(f.root, 'empty.log'), '');
  const head = await f.commit(); const compact = await f.build(head); t.after(compact.cleanup);
  const view = await snapshot(f, compact, head); t.after(view.cleanup);
  assert.equal(await readFile(join(view.repositoryPath, 'empty.log'), 'utf8'), '');
  await assert.rejects(access(join(view.repositoryPath, 'docs/issues/feature/decisions.md')), /ENOENT/);
});

test('historical capture scripts remain source while their old verification logs are removed', async (t) => {
  const f = await fixture(t);
  const directory = join(f.featureHome, 'p12-verification'); await mkdir(directory);
  await writeFile(join(directory, 'capture.mjs'), 'export const capture = true;\n');
  await writeFile(join(directory, 'lint.log'), 'PREVIOUS VERIFICATION RESULT\n');
  await writeFile(join(f.featureHome, 'contract-review-response-20261012.md'), 'PREVIOUS REVIEW FINDINGS\n');
  const head = await f.commit(); const compact = await f.build(head); t.after(compact.cleanup);
  const view = await snapshot(f, compact, head); t.after(view.cleanup);
  assert.match(await readFile(join(view.repositoryPath, 'docs/issues/feature/p12-verification/capture.mjs'), 'utf8'), /capture/u);
  await assert.rejects(access(join(view.repositoryPath, 'docs/issues/feature/p12-verification/lint.log')), /ENOENT/);
  await assert.rejects(access(join(view.repositoryPath, 'docs/issues/feature/contract-review-response-20261012.md')), /ENOENT/);
});

test('rename edits and binary old/new content retain exact identities and accessible bytes', async (t) => {
  const f = await fixture(t);
  const before = Buffer.from([0, 1, 2, 3]); const after = Buffer.from([0, 4, 5, 6]);
  await writeFile(join(f.root, 'picture\tname.bin'), before);
  await writeFile(join(f.root, 'rename.txt'), 'stable line\n'.repeat(100));
  const baseSha = await f.commit();
  await writeFile(join(f.root, 'picture\tname.bin'), after);
  await rename(join(f.root, 'rename.txt'), join(f.root, 'renamed.txt'));
  await writeFile(join(f.root, 'renamed.txt'), 'stable line\n'.repeat(99) + 'edited\n');
  const head = await f.commit(); const compact = await f.build(head, { baseSha }); t.after(compact.cleanup);
  const view = await snapshot(f, compact, head); t.after(view.cleanup);
  const inventory = JSON.parse(compact.evidenceFiles[compact.change.inventory.path]);
  const binary = inventory.find((entry) => entry.newPath === 'picture\tname.bin');
  assert.equal(binary.binary, true);
  assert.deepEqual(await readFile(join(view.repositoryPath, binary.oldContent.path)), before);
  assert.deepEqual(await readFile(join(view.repositoryPath, binary.newContent.path)), after);
  assert.equal(binary.oldContent.hash, sha256Digest(before));
  const renamed = inventory.find((entry) => entry.newPath === 'renamed.txt');
  assert.match(renamed.status, /^R/u); assert.equal(renamed.oldPath, 'rename.txt');
  const index = JSON.parse(await readFile(join(view.repositoryPath, compact.change.patch.path), 'utf8'));
  const patch = (await Promise.all(index.chunks.map((ref) => readFile(join(view.repositoryPath, ref.path), 'utf8')))).join('');
  assert.match(patch, /rename from rename.txt/u); assert.match(patch, /\+edited/u);
  assert.equal(patch.includes('GIT binary patch'), false);
  assert.equal(compact.change.slicePatch.path, compact.change.patch.path);
  assert.ok(compact.audit.metrics.duplicatePatchBytesAvoided > 0);
});

test('905-file, 24 MiB review uses bounded chunks without changing mixed-feature scope', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 905; i += 1) await writeFile(join(f.root, `source-${i}.txt`), `source ${i}\n`);
  await writeFile(join(f.root, 'large.txt'), '0123456789abcdef\n'.repeat(Math.ceil(24 * 1024 * 1024 / 17)));
  const sliceBaseSha = await f.commit();
  await writeFile(join(f.root, 'app.txt'), 'final slice\n');
  const head = await f.commit();
  const compact = await f.build(head, { scope: 'FEATURE', sliceBaseSha }); t.after(compact.cleanup);
  assert.ok(compact.change.changedFiles.length >= 905);
  assert.ok(compact.change.patch.materialBytes >= 24 * 1024 * 1024);
  assert.ok(compact.audit.metrics.manifestBytes < 64 * 1024);
  assert.deepEqual(compact.change.sliceChangedFiles, ['app.txt']);
  assert.equal(compact.change.source.baseSha, f.baseSha);
  assert.equal(compact.change.source.headSha, head);
  const index = JSON.parse(compact.evidenceFiles[compact.change.patch.path]);
  assert.ok(index.chunks.length > 300);
  assert.ok(index.chunks.every((chunk) => chunk.bytes <= 64 * 1024));
  assert.equal(index.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0), index.bytes);
});

test('filtered input identity survives history-only changes but not source or requirement changes', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'app.txt'), 'review me\n');
  const first = await f.build(await f.commit()); t.after(first.cleanup);
  await writeFile(join(f.featureHome, 'decisions.md'), 'new review history\n');
  const second = await f.build(await f.commit()); t.after(second.cleanup);
  assert.equal(first.change.reviewView.inputIdentity, second.change.reviewView.inputIdentity);
  await writeFile(join(f.featureHome, 'spec.md'), '# Spec\nNew binding requirement\n| R1 | Behavior | Pass | Fail | Evidence |\n');
  const third = await f.build(await f.commit()); t.after(third.cleanup);
  assert.notEqual(second.change.reviewView.inputIdentity, third.change.reviewView.inputIdentity);
});

test('changed spooled evidence rejects before the snapshot is exposed', async (t) => {
  const f = await fixture(t); await writeFile(join(f.root, 'app.txt'), 'new\n');
  const head = await f.commit(); const compact = await f.build(head); t.after(compact.cleanup);
  const descriptor = Object.values(compact.evidenceFiles).find((value) => value.sourcePath);
  await writeFile(descriptor.sourcePath, 'changed');
  await assert.rejects(snapshot(f, compact, head), /changed during materialization/u);
});

test('adopted formal Judge receives filtered source and full Verification, then publishes a bound host audit', async (t) => {
  const f = await fixture(t); await writeFile(join(f.root, 'app.txt'), 'after\n');
  await mkdir(join(f.featureHome, 'pr-0'), { recursive: true });
  const image = Buffer.from([0, 20, 30, 40]);
  await writeFile(join(f.featureHome, 'pr-0/visual.png'), image);
  const head = await f.commit();
  const verification = '# Verification\nFull applicable checks passed on pinned source.\n![Current evidence](visual.png)\n';
  await writeFile(join(f.root, 'verification.md'), verification);
  const module = (await loadDefaultModel()).moduleGraph.modules.find((item) => item.id === 'gatereeve/judge');
  let recorded = null;
  const options = { repositoryRoot: f.root, featureHome: f.featureHome,
    artifactRoot: join(f.featureHome, 'pr-1'), modelHash: `sha256:${'a'.repeat(64)}`, module,
    prepared: { attempt: { id: 'a1', scope: 'SLICE', gates: [{ id: 'verification',
      moduleId: 'gatereeve/verification', outcome: 'PASS', recordedEventId: 'evt-verification',
      evidence: { path: 'verification.md', hash: sha256Digest(verification),
        attachments: [{ path: 'docs/issues/feature/pr-0/visual.png', hash: sha256Digest(image) }] } }] },
    target: { id: 'judge', dependsOn: ['verification'] },
    inputs: { context: { mergeBaseSha: f.baseSha, evaluatedSourceSha: head,
      privateReviewHistory: 'PREPARED HISTORY SENTINEL' } } },
    adapter: {
      describe: async () => ({ schemaVersion: 1, id: 'test/fresh', version: '1.0.0', provider: 'test',
        model: 'test-model', reasoningEffort: 'high', capabilityProfiles: ['high-capability-v1'], isolationMethods: ['test-fresh'] }),
      runStage: async (request) => {
        assert.equal(JSON.stringify(request.input).includes('SENTINEL'), false);
        await assert.rejects(access(join(request.repositoryPath, 'docs/issues/feature/decisions.md')), /ENOENT/);
        assert.equal(await readFile(join(request.repositoryPath, request.input.initial.dependencyEvidence.verification.path), 'utf8'), verification);
        const attached = request.input.initial.dependencyEvidence.verificationAttachments[0];
        assert.deepEqual(await readFile(join(request.repositoryPath, attached.path)), image);
        await assert.rejects(access(join(request.repositoryPath, 'docs/issues/feature/pr-0/visual.png')), /ENOENT/);
        assert.equal(await access(join(request.repositoryPath, 'judge-view-audit.json')).then(() => true, () => false), false);
        const check = { result: 'PASS', explanation: 'Fixture evidence.', evidence: [] };
        const output = { schemaVersion: 1, verdict: 'PASS', summary: 'Fixture result, not a live review.',
          criteria: [{ id: 'R1', title: 'Fixture criterion', ...check }],
          scopeCheck: check, gapCheck: check, contradictionCheck: check, findings: [],
          markdown: '# Fixture Judgment\n' + 'Fixture evidence only. '.repeat(10) };
        return { output, receipt: { schemaVersion: 1, kind: 'gatereeve-agent-workflow-receipt', protocolVersion: 1,
          runId: request.runId, attemptId: request.attemptId, module: request.module, stage: request.stage.id,
          capabilityProfile: request.capabilityProfile,
          provider: { id: 'test', adapterVersion: '1.0.0', model: 'test-model', reasoningEffort: 'high', contextId: 'fresh-fixture' },
          isolation: { method: 'test-fresh', freshContext: true, inheritedTurns: 0 },
          policy: { repositoryAccess: 'read-only-pinned', networkAccess: 'denied', scratch: 'disposable' },
          startedAt: '2026-10-12T00:00:00Z', completedAt: '2026-10-12T00:00:01Z', status: 'completed',
          digests: { instructions: sha256Digest(request.instructions), input: sha256Digest(request.input),
            output: sha256Digest(output), snapshot: request.snapshotDigest } } };
      },
    },
    resources: { loadResource: ({ path }) => readFile(new URL(`../../plugin-src/shared/${path}`, import.meta.url), 'utf8'),
      loadEvaluator: async () => createJudgeBundle },
    recordOutcome: async (value) => { recorded = value; return { event: { eventId: 'fixture-event' } }; },
  };
  const result = await executeAgentWorkflowGate(options);
  assert.equal(result.status, 'completed', JSON.stringify(result.failure)); assert.equal(recorded.outcome, 'PASS');
  const audit = JSON.parse(await readFile(join(f.featureHome, 'pr-1/attempts/a1/judge-view-audit.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(f.featureHome, 'pr-1/attempts/a1/judge.json'), 'utf8'));
  assert.equal(manifest.files.viewAudit.sha256, sha256Digest(JSON.stringify(audit) + '\n'));
  assert.ok(audit.excludedPaths.includes('docs/issues/feature/decisions.md'));
  assert.equal(manifest.source.headSha, head);
  const missing = structuredClone(options.prepared);
  missing.attempt.gates[0].evidence.attachments = [];
  await assert.rejects(executeAgentWorkflowGate({ ...options, prepared: missing }), /Bind referenced Verification/u);
  const changed = structuredClone(options.prepared);
  changed.attempt.gates[0].evidence.attachments[0].hash = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(executeAgentWorkflowGate({ ...options, prepared: changed }), /evidence is unavailable or changed/u);
});
