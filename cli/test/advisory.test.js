import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  initializeFeature,
  loadDefaultModel,
  recordFeatureTransition,
  proposeSlice,
  recordSliceTransition,
  readFeatureRecord,
  projectRecord,
  declareAdvisoryReadiness,
  checkAdvisoryDisposition,
  proceedWithoutCleanAdvisory,
  createCodexAgentAdapter,
  createClaudeCodeAgentAdapter,
  migrateFeatureModel,
  fingerprint,
  validateAdvisoryResult,
  pauseFeature,
  recordGateOutcome,
  resolveModuleGraph,
  executeAgentWorkflowGate,
  createPluginResourceAccess,
} from '../../plugin-src/shared/resources/protocol/index.js';
import { createJudgeBundle } from '../../plugin-src/shared/resources/agent-workflows/judge/validator.js';
import { executePluginRequest } from '../../plugin-src/shared/resources/protocol/plugin-adapter.js';
const exec = promisify(execFile);
const actor = { kind: 'agent', label: 'fixture implementer' };
const human = { kind: 'human-confirmed', label: 'fixture approval' };
const hash = (v) => 'sha256:' + createHash('sha256').update(v).digest('hex');
const historical = async () =>
  JSON.parse(
    await readFile(
      new URL('./fixtures/workflow-model-1.6.json', import.meta.url)
    )
  );
async function fixture(
  t,
  { oldModel = false, applicable = true, scope = 'SLICE' } = {}
) {
  const root = await mkdtemp(join(tmpdir(), 'gatereeve advisory '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = async (...args) =>
    (
      await exec('git', ['-c', 'core.hooksPath=/dev/null', '-C', root, ...args])
    ).stdout.trim();
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Advisory Fixture');
  await git('config', 'user.email', 'fixture@example.invalid');
  await writeFile(join(root, '.git/info/exclude'), '.agentic-workflow.json\n');
  const home = join(root, 'docs/issues/advisory-feature');
  const model = oldModel ? await historical() : await loadDefaultModel();
  if (!applicable) {
    const enabled = new Set(
      model.moduleGraph.enabledModuleIds.filter(
        (id) => id !== 'gatereeve/judge'
      )
    );
    const compiled = resolveModuleGraph({
      definitions: model.moduleGraph.modules,
      policy: {
        schemaVersion: 1,
        modules: model.moduleGraph.modules.map((m) => ({
          id: m.id,
          version: m.version,
          digest: m.digest,
          enabled: enabled.has(m.id),
        })),
      },
    });
    model.moduleGraph = {
      schemaVersion: compiled.schemaVersion,
      policyDigest: compiled.policyDigest,
      modules: compiled.modules,
      enabledModuleIds: compiled.enabledModuleIds,
    };
  }
  await initializeFeature({
    featureHome: home,
    featureId: 'advisory-feature',
    model,
    actor,
    eventId: 'evt-init',
  });
  await writeFile(
    join(home, 'spec.md'),
    '# Spec\n| R1 | behavior | pass | fail | evidence |\n| R2 | invariants | pass | fail | evidence |\n'
  );
  await writeFile(join(home, 'design.md'), '# Design\n**Status:** approved\n');
  await writeFile(join(root, 'app.mjs'), 'export const value = 1;\n');
  const commit = async (message = 'fixture') => {
    await git('add', '.');
    await git('commit', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const base = await commit('Original base');
  await git('update-ref', 'refs/remotes/origin/main', base);
  await git('switch', '-c', 'delivery');
  const config = {
    schemaVersion: 1,
    featureId: 'advisory-feature',
    repositories: {
      product: {
        path: '.',
        remote: 'origin',
        integrationBranch: 'main',
        featureBaseSha: base,
      },
    },
  };
  await writeFile(join(root, '.agentic-workflow.json'), JSON.stringify(config));
  await recordFeatureTransition(home, 'approve-design', { actor: human });
  await recordFeatureTransition(home, 'validate-spec', {
    actor,
    facts: { specValidationCurrent: true },
  });
  await recordFeatureTransition(home, 'authorize-plan', { actor: human });
  await proposeSlice(home, {
    sliceId: 's1',
    scope,
    rubricCriteria: ['R1', 'R2'],
    actor,
  });
  await recordSliceTransition(home, 'plan-slice', 's1', { actor });
  await recordSliceTransition(home, 'start-slice', 's1', {
    actor,
    facts: { sliceReadinessCurrent: true },
  });
  await writeFile(join(root, 'app.mjs'), 'export const value = 2;\n');
  await writeFile(
    join(root, 'app.test.mjs'),
    'import test from "node:test";import assert from "node:assert/strict";import {value} from "./app.mjs";test("behavior",()=>assert.equal(value,2));\n'
  );
  const source = await commit('Implemented source');
  await mkdir(join(home, 'runtime/advisory-checks'), { recursive: true });
  const fast = await exec(process.execPath, ['--check', 'app.mjs'], {
    cwd: root,
  });
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  const focused = await exec(process.execPath, ['--test', 'app.test.mjs'], {
    cwd: root,
    env: environment,
  });
  const save = async (path, bytes) => {
    await mkdir(join(home, path, '..'), { recursive: true });
    await writeFile(join(home, path), bytes);
    return { path, hash: hash(bytes) };
  };
  const fastRef = await save(
    'runtime/advisory-checks/fast.log',
    'node --check app.mjs PASS\n' + fast.stdout
  );
  const focusedRef = await save(
    'runtime/advisory-checks/focused.log',
    'node --test app.test.mjs exited 0\n' + focused.stdout
  );
  const input = {
    readinessId: 'ready-1',
    sliceId: 's1',
    repositoryRoot: root,
    scope,
    actor,
    execution: {
      provider: 'codex',
      model: 'fixture-model',
      reasoningEffort: 'high',
    },
    checks: [
      {
        kind: 'fast',
        command: 'node --check app.mjs',
        outcome: 'PASS',
        evidence: [fastRef],
      },
      {
        kind: 'focused',
        command: 'node --test app.test.mjs',
        outcome: 'PASS',
        evidence: [focusedRef],
      },
    ],
  };
  return { root, home, input, base, source, git, commit, save, config };
}
function cleanResult(initial) {
  const check = {
    result: 'SATISFIED',
    explanation: 'Reviewed reachable scope from pinned source.',
    evidence: ['app.mjs:1'],
  };
  return {
    schemaVersion: 1,
    outcome: 'READY_FOR_FORMAL_REVIEW',
    fullVerification: 'PENDING',
    summary:
      'Ready for independent formal review; full verification remains pending.',
    criteria: initial.change.criteria.map((id) => ({ id, ...check })),
    scopeCheck: { ...check },
    gapCheck: { ...check },
    contradictionCheck: { ...check },
    findings: [],
    checklist: initial.priorFindings.map((f) => ({
      findingId: f.id,
      result: 'RESOLVED',
      explanation: 'The invariant holds across the reviewed paths.',
      evidence: ['app.mjs:1'],
    })),
  };
}
function findingResult(initial) {
  const result = cleanResult(initial);
  result.outcome = 'FINDINGS';
  result.criteria[0].result = 'FINDING';
  result.findings = [
    {
      criterionIds: ['R1'],
      summary: 'Stale results overwrite newer intent.',
      invariant: 'Newer intent must survive a late response',
      affectedPaths: ['app.mjs'],
      evidence: ['app.mjs:1'],
    },
  ];
  return result;
}
function transport({
  output = cleanResult,
  failures = [],
  provider = 'codex',
  expectedSource = 'export const value = 2;\n',
} = {}) {
  let calls = 0;
  const requests = [];
  const runner = async (_executable, args, options) => {
    calls += 1;
    const prompt = provider === 'codex' ? options.input : args.at(-1);
    const initial = JSON.parse(
      prompt.split('<gatereeve-input>\n')[1].split('\n</gatereeve-input>')[0]
    ).initial;
    requests.push({ initial, args, options });
    if (failures[calls - 1])
      throw Object.assign(
        new Error('private provider transcript must not be retained'),
        { code: failures[calls - 1] }
      );
    assert.equal(
      await readFile(join(options.cwd, 'app.mjs'), 'utf8'),
      expectedSource
    );
    const value = output(initial, calls);
    if (provider === 'codex')
      await writeFile(
        args[args.indexOf('--output-last-message') + 1],
        JSON.stringify(value)
      );
    return {
      stdout:
        provider === 'codex'
          ? JSON.stringify({
              type: 'thread.started',
              thread_id: 'fresh-' + calls,
            }) + '\n'
          : JSON.stringify({
              session_id: 'fresh-' + calls,
              structured_output: value,
            }),
      stderr: '',
      code: 0,
      signal: null,
      startedAt: new Date('2026-10-12T12:00:00Z'),
      completedAt: new Date('2026-10-12T12:00:01Z'),
    };
  };
  const adapter =
    provider === 'codex'
      ? createCodexAgentAdapter({ model: 'fixture-model', runner })
      : createClaudeCodeAgentAdapter({ model: 'fixture-model', runner });
  return {
    adapter,
    requests,
    get calls() {
      return calls;
    },
  };
}

test('one readiness declaration automatically reviews complete scope in isolation without formal passage', async (t) => {
  const f = await fixture(t),
    provider = transport();
  const before = (await readFeatureRecord(f.home)).events;
  const reviewed = await declareAdvisoryReadiness(f.home, f.input, {
    adapter: provider.adapter,
  });
  assert.equal(reviewed.outcome, 'READY_FOR_FORMAL_REVIEW');
  assert.equal(provider.calls, 1);
  assert.equal(reviewed.record.fullVerification, 'PENDING');
  assert.equal(reviewed.record.receipts[0].isolation.inheritedTurns, 0);
  assert.equal(provider.requests[0].initial.fastFocusedEvidence.length, 2);
  assert.deepEqual(provider.requests[0].initial.change.criteria, ['R1', 'R2']);
  assert.deepEqual((await readFeatureRecord(f.home)).events, before);
  assert.equal(
    (
      await declareAdvisoryReadiness(f.home, f.input, {
        adapter: provider.adapter,
      })
    ).alreadyRecorded,
    true
  );
  assert.equal(provider.calls, 1);
  await f.commit('Track compact advisory evidence');
  const context = {
    schemaVersion: 1,
    repositoryRoot: f.root,
    repositoryAlias: 'product',
    evaluatedSourceSha: await f.git('rev-parse', 'HEAD'),
    mergeBaseSha: f.base,
    featureBaseSha: f.base,
  };
  const begun = await recordSliceTransition(f.home, 'begin-boundary', 's1', {
    actor,
    payload: {
      attemptId: 'a1',
      scope: 'SLICE',
      context,
      readinessId: 'ready-1',
      criteria: ['R1', 'R2'],
    },
  });
  assert.equal(begun.projection.slices[0].state, 'REVIEW_BOUNDARY');
  assert.ok(
    begun.projection.boundaryAttempts[0].gates.every(
      (g) => g.outcome === 'UNSET'
    )
  );
  assert.equal(
    begun.event.payload.advisoryDecision.outcome,
    'READY_FOR_FORMAL_REVIEW'
  );
});
test('formal entry cannot manufacture advisory facts or bypass missing retained reason', async (t) => {
  const f = await fixture(t),
    provider = transport({ output: findingResult });
  await declareAdvisoryReadiness(f.home, f.input, {
    adapter: provider.adapter,
  });
  const before = (await readFeatureRecord(f.home)).events.length;
  await assert.rejects(
    recordSliceTransition(f.home, 'begin-boundary', 's1', {
      actor,
      facts: { advisoryDispositionCurrent: true },
      payload: {
        attemptId: 'a1',
        scope: 'SLICE',
        context: {
          repositoryRoot: f.root,
          repositoryAlias: 'product',
          evaluatedSourceSha: f.source,
          mergeBaseSha: f.base,
        },
        readinessId: 'ready-1',
      },
    }),
    /current advisory/
  );
  assert.equal((await readFeatureRecord(f.home)).events.length, before);
  assert.equal(
    (
      await checkAdvisoryDisposition(f.home, {
        readinessId: 'ready-1',
        repositoryRoot: f.root,
      })
    ).eligible,
    false
  );
  await assert.rejects(
    proceedWithoutCleanAdvisory(f.home, {
      readinessId: 'ready-1',
      repositoryRoot: f.root,
      actor,
      reason: ' ',
    }),
    /reason/
  );
  await proceedWithoutCleanAdvisory(f.home, {
    readinessId: 'ready-1',
    repositoryRoot: f.root,
    actor,
    reason: 'Independent formal review will evaluate these supported concerns.',
  });
  const checked = await checkAdvisoryDisposition(f.home, {
    readinessId: 'ready-1',
    repositoryRoot: f.root,
  });
  assert.equal(checked.eligible, true, JSON.stringify(checked));
  assert.equal(checked.outcome, 'FINDINGS');
  assert.equal((await readFeatureRecord(f.home)).events.length, before);
  await f.commit('Retain source-bound proceed reason');
  const begun = await recordSliceTransition(f.home, 'begin-boundary', 's1', {
    actor,
    payload: {
      attemptId: 'a1',
      scope: 'SLICE',
      readinessId: 'ready-1',
      context: {
        repositoryRoot: f.root,
        repositoryAlias: 'product',
        evaluatedSourceSha: await f.git('rev-parse', 'HEAD'),
        mergeBaseSha: f.base,
      },
    },
  });
  assert.ok(
    begun.projection.boundaryAttempts[0].gates.every(
      (g) => g.outcome === 'UNSET'
    )
  );
});
test('inapplicable formal Judge does not launch an advisory provider', async (t) => {
  const f = await fixture(t, { applicable: false }),
    provider = transport();
  const result = await declareAdvisoryReadiness(f.home, f.input, {
    adapter: provider.adapter,
  });
  assert.equal(result.outcome, 'NOT_APPLICABLE');
  assert.equal(provider.calls, 0);
});
test('transient advisory execution retries once; persistent isolation/config/schema errors do not retry', async (t) => {
  for (const [name, failures, expected, calls] of [
    ['recover', ['AGENT_PROVIDER_TRANSIENT'], 'READY_FOR_FORMAL_REVIEW', 2],
    ['exhaust', ['ETIMEDOUT', 'ETIMEDOUT'], 'UNAVAILABLE', 2],
    ['config', ['AGENT_PROVIDER_CONFIGURATION'], 'UNAVAILABLE', 1],
  ])
    await t.test(name, async (t) => {
      const f = await fixture(t),
        provider = transport({ failures });
      const r = await declareAdvisoryReadiness(f.home, f.input, {
        adapter: provider.adapter,
      });
      assert.equal(r.outcome, expected);
      assert.equal(provider.calls, calls);
      assert.equal(
        JSON.stringify(r.record).includes('private provider transcript'),
        false
      );
    });
  await t.test('inherited context', async (t) => {
    const f = await fixture(t),
      provider = transport();
    const adapter = {
      describe: () => provider.adapter.describe(),
      runStage: async (request) => {
        const r = await provider.adapter.runStage(request);
        r.receipt.isolation.inheritedTurns = 1;
        return r;
      },
    };
    const r = await declareAdvisoryReadiness(f.home, f.input, { adapter });
    assert.equal(r.outcome, 'UNAVAILABLE');
    assert.equal(provider.calls, 1);
  });
  await t.test('missing model', async (t) => {
    const f = await fixture(t);
    delete f.input.execution.model;
    const r = await declareAdvisoryReadiness(f.home, f.input);
    assert.equal(r.outcome, 'UNAVAILABLE');
    await proceedWithoutCleanAdvisory(f.home, {
      readinessId: 'ready-1',
      repositoryRoot: f.root,
      actor,
      reason:
        'Advisory configuration unavailable; formal requirements remain mandatory.',
    });
    assert.equal(
      (
        await checkAdvisoryDisposition(f.home, {
          readinessId: 'ready-1',
          repositoryRoot: f.root,
        })
      ).eligible,
      true
    );
  });
});
test('clean advisory is reusable across evidence-only commits but each reviewed input change prevents reuse', async (t) => {
  for (const path of [
    'app.mjs',
    'app.test.mjs',
    'package.json',
    'dependency-lock.json',
    'docs/issues/advisory-feature/spec.md',
    'docs/issues/advisory-feature/design.md',
    'docs/issues/advisory-feature/runtime/advisory-checks/focused.log',
  ])
    await t.test(path, async (t) => {
      const f = await fixture(t),
        provider = transport();
      await declareAdvisoryReadiness(f.home, f.input, {
        adapter: provider.adapter,
      });
      await f.commit('Track records');
      assert.equal(
        (
          await checkAdvisoryDisposition(f.home, {
            readinessId: 'ready-1',
            repositoryRoot: f.root,
          })
        ).eligible,
        true
      );
      await writeFile(
        join(f.root, path),
        (await readFile(join(f.root, path), 'utf8').catch(() => '')) +
          '\nchanged reviewed input\n'
      );
      await f.commit('Misleading evidence-only message');
      const checked = await checkAdvisoryDisposition(f.home, {
        readinessId: 'ready-1',
        repositoryRoot: f.root,
      });
      assert.equal(checked.eligible, false);
    });
});
test('defect-class review and changed approach are required for revised readiness; reruns still inspect all criteria', async (t) => {
  const f = await fixture(t),
    first = transport({ output: findingResult });
  await declareAdvisoryReadiness(f.home, f.input, { adapter: first.adapter });
  const revised = { ...f.input, readinessId: 'ready-2' };
  await assert.rejects(
    declareAdvisoryReadiness(f.home, revised, { adapter: transport().adapter }),
    /defect-class/
  );
  revised.remediation = [
    {
      findingIds: ['advisory:ready-1:0'],
      invariant: 'Newer intent must survive a late response',
      examinedPaths: ['app.mjs'],
      approach: 'Inspect every write and add ordering coverage.',
      regressions: [
        {
          scenario: 'Late response after newer intent',
          command: 'node --test app.test.mjs',
          outcome: 'PASS',
          evidence: [f.input.checks[1].evidence[0]],
        },
      ],
    },
  ];
  const second = transport({
    output: (initial) => {
      const r = findingResult(initial);
      r.checklist = initial.priorFindings.map((f) => ({
        findingId: f.id,
        result: 'STILL_PRESENT',
        explanation: 'The invariant is still violated.',
        evidence: ['app.mjs:1'],
      }));
      return r;
    },
  });
  await declareAdvisoryReadiness(f.home, revised, { adapter: second.adapter });
  assert.equal(second.requests[0].initial.priorFindings.length, 1);
  assert.equal(second.requests[0].initial.change.criteria.length, 2);
  const third = {
    ...revised,
    readinessId: 'ready-3',
    remediation: [
      {
        ...revised.remediation[0],
        findingIds: ['advisory:ready-1:0', 'advisory:ready-2:0'],
      },
    ],
  };
  await assert.rejects(
    declareAdvisoryReadiness(f.home, third, { adapter: transport().adapter }),
    /failed-fix/
  );
  third.remediation[0].failedFixExplanation =
    'First fix missed a competing writer.';
  await assert.rejects(
    declareAdvisoryReadiness(f.home, third, { adapter: transport().adapter }),
    /changed remediation/
  );
  third.remediation[0].approach =
    'Centralize ownership of every write and test both response orders.';
  const clean = transport();
  const r = await declareAdvisoryReadiness(f.home, third, {
    adapter: clean.adapter,
  });
  assert.equal(r.outcome, 'READY_FOR_FORMAL_REVIEW');
  assert.equal(clean.requests[0].initial.priorFindings.length, 2);
});

test('evidence-only declarations reuse clean inputs and retain the original reviewed source', async (t) => {
  const f = await fixture(t),
    provider = transport();
  const first = await declareAdvisoryReadiness(f.home, f.input, {
    adapter: provider.adapter,
  });
  await f.commit('Retain evidence');
  const second = await declareAdvisoryReadiness(
    f.home,
    { ...f.input, readinessId: 'ready-2' },
    { adapter: provider.adapter }
  );
  assert.equal(second.reused, true);
  assert.equal(provider.calls, 1);
  assert.deepEqual(second.record.reviewedSource, first.record.source);
  assert.notEqual(
    second.record.source.headSha,
    second.record.reviewedSource.headSha
  );
  await f.commit('Retain reuse evidence');
  assert.equal(
    (
      await checkAdvisoryDisposition(f.home, {
        readinessId: 'ready-2',
        repositoryRoot: f.root,
      })
    ).eligible,
    true
  );
  const conflicting = {
    ...f.input,
    checks: [
      ...f.input.checks,
      { ...f.input.checks[0], command: 'additional intended check' },
    ],
  };
  await assert.rejects(
    declareAdvisoryReadiness(f.home, conflicting, {
      adapter: provider.adapter,
    }),
    /conflicts/
  );
  assert.equal(provider.calls, 1);
});
test('retained records reject tampering, unknown transcript fields and unsafe evidence before formal entry', async (t) => {
  for (const [name, mutate] of [
    [
      'outcome',
      (r) => {
        r.result.criteria[0].result = 'FINDING';
      },
    ],
    [
      'source',
      (r) => {
        r.source.headSha = 'f'.repeat(40);
      },
    ],
    [
      'receipt',
      (r) => {
        r.receipts[0].digests.output = 'sha256:' + 'f'.repeat(64);
      },
    ],
    [
      'transcript',
      (r) => {
        r.transcript = 'private history';
      },
    ],
    [
      'capability',
      (r) => {
        r.receipts[0].capabilityProfile.minimumReasoning = 'low';
      },
    ],
    [
      'provider model',
      (r) => {
        r.receipts[0].provider.model = 'another-model';
      },
    ],
    [
      'isolation method',
      (r) => {
        r.receipts[0].isolation.method = 'unrecognized-isolation';
      },
    ],
  ])
    await t.test(name, async (t) => {
      const f = await fixture(t);
      await declareAdvisoryReadiness(f.home, f.input, {
        adapter: transport().adapter,
      });
      const path = join(f.home, 'advisory/ready-1/review.json');
      const r = JSON.parse(await readFile(path));
      mutate(r);
      await writeFile(path, JSON.stringify(r));
      assert.equal(
        (
          await checkAdvisoryDisposition(f.home, {
            readinessId: 'ready-1',
            repositoryRoot: f.root,
          })
        ).eligible,
        false
      );
    });
  await t.test('symlink evidence', async (t) => {
    const f = await fixture(t);
    const ref = f.input.checks[0].evidence[0];
    await rm(join(f.home, ref.path));
    await symlink(
      join(f.home, f.input.checks[1].evidence[0].path),
      join(f.home, ref.path)
    );
    await assert.rejects(
      declareAdvisoryReadiness(f.home, f.input, {
        adapter: transport().adapter,
      }),
      /symlink/
    );
  });
  await t.test('untracked formal evidence', async (t) => {
    const f = await fixture(t);
    await declareAdvisoryReadiness(f.home, f.input, {
      adapter: transport().adapter,
    });
    const before = (await readFeatureRecord(f.home)).events.length;
    await assert.rejects(
      recordSliceTransition(f.home, 'begin-boundary', 's1', {
        actor,
        payload: {
          attemptId: 'untracked',
          scope: 'SLICE',
          readinessId: 'ready-1',
          context: {
            repositoryRoot: f.root,
            repositoryAlias: 'product',
            evaluatedSourceSha: f.source,
            mergeBaseSha: f.base,
          },
        },
      }),
      /current advisory/
    );
    assert.equal((await readFeatureRecord(f.home)).events.length, before);
  });
});
test('snapshot and output-schema failures are unavailable; valid code findings survive publication errors', async (t) => {
  await t.test('snapshot', async (t) => {
    const f = await fixture(t),
      p = transport();
    const r = await declareAdvisoryReadiness(f.home, f.input, {
      adapter: p.adapter,
      createSnapshot: async () => {
        throw new Error('configuration detail');
      },
    });
    assert.equal(r.outcome, 'UNAVAILABLE');
    assert.equal(p.calls, 0);
  });
  await t.test('output schema', async (t) => {
    const f = await fixture(t),
      p = transport({ output: () => ({ verdict: 'PASS' }) });
    const r = await declareAdvisoryReadiness(f.home, f.input, {
      adapter: p.adapter,
    });
    assert.equal(r.outcome, 'UNAVAILABLE');
    assert.equal(p.calls, 1);
  });
  await t.test('finding publication', async (t) => {
    const f = await fixture(t),
      p = transport({ output: findingResult });
    const r = await declareAdvisoryReadiness(f.home, f.input, {
      adapter: p.adapter,
      publishReview: async () => {
        throw new Error('publication configuration');
      },
    });
    assert.equal(r.outcome, 'FINDINGS');
    assert.equal(r.record.result.findings.length, 1);
    assert.equal(r.record.operationalErrors.length, 1);
    assert.equal(p.calls, 1);
    await assert.rejects(
      declareAdvisoryReadiness(
        f.home,
        { ...f.input, readinessId: 'ready-2' },
        { adapter: p.adapter }
      ),
      /defect-class/
    );
  });
});
test('advisory uses the formal whole-feature scope and portable Claude receipt contract', async (t) => {
  const f = await fixture(t, { scope: 'FEATURE_FINAL' }),
    p = transport({ provider: 'claude-code' });
  f.input.execution.provider = 'claude-code';
  const r = await declareAdvisoryReadiness(f.home, f.input, {
    adapter: p.adapter,
  });
  assert.equal(r.outcome, 'READY_FOR_FORMAL_REVIEW');
  assert.equal(p.requests[0].initial.source.scope, 'FEATURE');
  assert.deepEqual(p.requests[0].initial.change.criteria, ['R1', 'R2']);
  assert.equal(r.record.receipts[0].provider.id, 'claude-code');
  const checked = await checkAdvisoryDisposition(f.home, {
    readinessId: 'ready-1',
    repositoryRoot: f.root,
    scope: 'SLICE',
    boundaryContext: {
      repositoryAlias: 'product',
      evaluatedSourceSha: f.source,
      mergeBaseSha: f.base,
      featureBaseSha: f.base,
    },
  });
  assert.equal(checked.eligible, false);
});
test('adoption preserves historical boundaries and formal graph requirements; older features never auto-adopt', async (t) => {
  const f = await fixture(t, { oldModel: true });
  await assert.rejects(
    declareAdvisoryReadiness(f.home, f.input, { adapter: transport().adapter }),
    /explicit compatible/
  );
  const old = await readFeatureRecord(f.home);
  await recordSliceTransition(f.home, 'begin-boundary', 's1', {
    actor,
    payload: {
      attemptId: 'old-attempt',
      scope: 'SLICE',
      context: { headSha: f.source, mergeBaseSha: f.base },
    },
  });
  await recordSliceTransition(f.home, 'remediate-boundary', 's1', { actor });
  const before = (await readFeatureRecord(f.home)).events;
  const model = await loadDefaultModel();
  assert.deepEqual(model.moduleGraph, old.modelLock.model.moduleGraph);
  await migrateFeatureModel({
    featureHome: f.home,
    nextModel: model,
    confirmedBy: human,
    eventId: 'evt-adopt-advisory',
  });
  const adopted = await readFeatureRecord(f.home);
  assert.deepEqual(adopted.events.slice(0, -1), before);
  const projection = projectRecord(adopted);
  assert.equal(projection.boundaryAttempts[0].id, 'old-attempt');
  assert.equal(projection.slices[0].state, 'IMPLEMENTING');
  await f.commit('Explicit advisory adoption');
  const result = await declareAdvisoryReadiness(f.home, f.input, {
    adapter: transport().adapter,
  });
  assert.equal(result.outcome, 'READY_FOR_FORMAL_REVIEW');
});
test('ambiguous JSON and YAML configuration in evidence namespaces cannot gain evidence-only reuse', async (t) => {
  for (const name of ['runtime/config.json', 'runtime/config.yaml'])
    await t.test(name, async (t) => {
      const f = await fixture(t);
      await declareAdvisoryReadiness(f.home, f.input, {
        adapter: transport().adapter,
      });
      await writeFile(
        join(f.home, name),
        name.endsWith('.json')
          ? ' {"productionMode": "changed"}'
          : 'productionMode: changed\n'
      );
      await f.commit('Evidence-only label');
      const checked = await checkAdvisoryDisposition(f.home, {
        readinessId: 'ready-1',
        repositoryRoot: f.root,
      });
      assert.equal(checked.eligible, false);
      assert.match(checked.blockers[0].message, /ambiguous/);
    });
});

test('formal failures enter the full advisory fix checklist; formal Judge snapshots exclude every advisory record', async (t) => {
  const f = await fixture(t, { oldModel: true });
  const ctx = {
    repositoryRoot: f.root,
    repositoryAlias: 'product',
    evaluatedSourceSha: f.source,
    mergeBaseSha: f.base,
  };
  await recordSliceTransition(f.home, 'begin-boundary', 's1', {
    actor,
    payload: {
      attemptId: 'formal-1',
      scope: 'SLICE',
      criteria: ['R1', 'R2'],
      context: ctx,
    },
  });
  const current = {};
  for (const gateId of ['pinContext', 'reconcile', 'verification']) {
    const r = await recordGateOutcome(f.home, {
      attemptId: 'formal-1',
      gateId,
      outcome: 'PASS',
      inputs: { context: ctx },
      currentFingerprints: current,
      actor,
      evidence: f.input.checks[1].evidence[0],
      eventId: 'evt-' + gateId,
    });
    current[gateId] = r.inputFingerprint;
  }
  const record = await readFeatureRecord(f.home),
    projection = projectRecord(record, {
      gateFingerprints: { 'formal-1': current },
    });
  const module = record.modelLock.model.moduleGraph.modules.find(
    (m) => m.boundary?.gateId === 'judge'
  );
  const provider = transport({
    output: (initial) => {
      const check = {
        result: 'PASS',
        explanation: 'Fixture pinned behavior inspected.',
        evidence: ['app.mjs:1'],
      };
      return {
        schemaVersion: 1,
        verdict: 'FAIL',
        summary: 'Fixture code failure, not a live judgment.',
        criteria: initial.change.criteria.map((id) => ({
          id,
          title: 'Fixture criterion',
          ...check,
          result: id === 'R1' ? 'FAIL' : 'PASS',
        })),
        scopeCheck: check,
        gapCheck: check,
        contradictionCheck: check,
        findings: [
          {
            severity: 'concern',
            summary: 'Newer intent must survive a late response',
            evidence: ['app.mjs:1 loses the current write.'],
          },
        ],
        markdown:
          '# Fixture formal failure\n' +
          'Pinned application write violates the invariant. '.repeat(5),
      };
    },
  });
  const result = await executeAgentWorkflowGate({
    repositoryRoot: f.root,
    featureHome: f.home,
    artifactRoot: join(f.home, 'pr-1'),
    modelHash: record.modelLock.modelHash,
    module,
    prepared: {
      attempt: projection.boundaryAttempts[0],
      target: { id: 'judge', dependsOn: ['verification'] },
      inputs: { context: ctx },
    },
    adapter: provider.adapter,
    resources: createPluginResourceAccess({
      pluginRoots: {
        'agentic-development-workflow': new URL(
          '../../plugin-src/shared',
          import.meta.url
        ).pathname,
      },
    }),
    recordOutcome: (value) =>
      recordGateOutcome(f.home, {
        attemptId: 'formal-1',
        gateId: 'judge',
        inputs: { context: ctx },
        currentFingerprints: current,
        actor,
        eventId: 'evt-formal-fail',
        ...value,
      }),
  });
  assert.equal(result.outcome, 'FAIL');
  assert.equal(result.status, 'completed');
  await recordSliceTransition(f.home, 'remediate-boundary', 's1', { actor });
  await migrateFeatureModel({
    featureHome: f.home,
    nextModel: await loadDefaultModel(),
    confirmedBy: human,
  });
  await f.commit('Preserve formal failure and adopt advisory');
  await assert.rejects(
    declareAdvisoryReadiness(f.home, f.input, { adapter: transport().adapter }),
    /defect-class/
  );
  const input = {
    ...f.input,
    remediation: [
      {
        findingIds: ['formal:evt-formal-fail:0'],
        invariant: 'Newer intent must survive a late response',
        examinedPaths: ['app.mjs'],
        approach:
          'Review every competing writer and cover both response orders.',
        regressions: [
          {
            scenario: 'Late response ordering',
            command: 'node --test app.test.mjs',
            outcome: 'PASS',
            evidence: [f.input.checks[1].evidence[0]],
          },
        ],
      },
    ],
  };
  const rerun = transport();
  const reviewed = await declareAdvisoryReadiness(f.home, input, {
    adapter: rerun.adapter,
  });
  assert.equal(reviewed.outcome, 'READY_FOR_FORMAL_REVIEW');
  assert.equal(
    rerun.requests[0].initial.priorFindings[0].source.kind,
    'formal'
  );
  assert.equal(rerun.requests[0].initial.change.criteria.length, 2);
  await f.commit('Track advisory after independent formal failure');
  const head = await f.git('rev-parse', 'HEAD');
  const { buildCompactReviewInput, createPinnedRepositorySnapshot } =
    await import('../../plugin-src/shared/resources/protocol/index.js');
  const compact = await buildCompactReviewInput({
    repositoryRoot: f.root,
    featureHome: f.home,
    baseSha: f.base,
    headSha: head,
    scope: 'SLICE',
    criteria: ['R1', 'R2'],
  });
  t.after(compact.cleanup);
  assert.equal(
    JSON.stringify(compact.change).includes('formal:evt-formal-fail'),
    false
  );
  const snapshot = await createPinnedRepositorySnapshot({
    repositoryRoot: f.root,
    headSha: head,
    evidenceFiles: compact.evidenceFiles,
    excludedPaths: compact.excludedPaths,
    expectedEntries: compact.expectedEntries,
    reviewView: compact.change.reviewView,
  });
  t.after(snapshot.cleanup);
  for (const path of [
    'advisory/ready-1/readiness.json',
    'advisory/ready-1/review.json',
    'events.jsonl',
    'pr-1/attempts/formal-1/judge.json',
  ])
    await assert.rejects(
      readFile(
        join(snapshot.repositoryPath, 'docs/issues/advisory-feature', path)
      ),
      /ENOENT/
    );
  const root = join(f.home, result.evidence.path);
  const manifest = JSON.parse(await readFile(root));
  manifest.source.headSha = 'f'.repeat(40);
  await writeFile(root, JSON.stringify(manifest));
  await assert.rejects(
    declareAdvisoryReadiness(
      f.home,
      { ...input, readinessId: 'ready-2' },
      { adapter: transport().adapter }
    ),
    /bytes changed/
  );
});

test('optional CLI and plugin adapter share advisory operational results and read-only check behavior', async (t) => {
  const f = await fixture(t);
  delete f.input.execution.model;
  const request = await executePluginRequest({
    operation: 'advisory.declare-readiness',
    cwd: f.root,
    input: f.input,
  });
  assert.equal(request.ok, true);
  assert.equal(request.data.outcome, 'UNAVAILABLE');
  const path = join(f.root, 'request.json');
  await writeFile(path, JSON.stringify(f.input));
  await writeFile(
    join(f.root, '.git/info/exclude'),
    '.agentic-workflow.json\nrequest.json\n'
  );
  let invocation;
  try {
    invocation = await exec(process.execPath, [
      new URL('../bin/workflow.js', import.meta.url).pathname,
      'advisory',
      'declare-readiness',
      '--cwd',
      f.root,
      '--input-file',
      path,
      '--json',
    ]);
  } catch (error) {
    invocation = error;
  }
  assert.equal(invocation.code, 2, invocation.stdout + invocation.stderr);
  const cli = JSON.parse(invocation.stdout);
  assert.equal(cli.ok, true);
  assert.equal(cli.data.outcome, 'UNAVAILABLE');
  assert.equal(cli.data.alreadyRecorded, true);
  const before = (await readFeatureRecord(f.home)).events;
  const checked = await executePluginRequest({
    operation: 'advisory.check',
    cwd: f.root,
    input: { readinessId: 'ready-1' },
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.data.eligible, false);
  assert.deepEqual((await readFeatureRecord(f.home)).events, before);
});

test('ordinary edits never launch review; revised readiness selects revised pinned source', async (t) => {
  const f = await fixture(t),
    first = transport();
  await declareAdvisoryReadiness(f.home, f.input, { adapter: first.adapter });
  await writeFile(join(f.root, 'app.mjs'), 'export const value = 3;\n');
  await writeFile(
    join(f.root, 'app.test.mjs'),
    'import test from "node:test";import assert from "node:assert/strict";import {value} from "./app.mjs";test("revised behavior",()=>assert.equal(value,3));\n'
  );
  assert.equal(first.calls, 1);
  await f.commit('Revised slice source');
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  const focused = await exec(process.execPath, ['--test', 'app.test.mjs'], {
    cwd: f.root,
    env: environment,
  });
  const input = structuredClone(f.input);
  input.readinessId = 'ready-2';
  input.checks[1].evidence = [
    await f.save(
      'runtime/advisory-checks/focused.log',
      'Revised focused checks exited 0\n' + focused.stdout
    ),
  ];
  const revised = transport({ expectedSource: 'export const value = 3;\n' });
  const result = await declareAdvisoryReadiness(f.home, input, {
    adapter: revised.adapter,
  });
  assert.equal(result.outcome, 'READY_FOR_FORMAL_REVIEW');
  assert.equal(revised.calls, 1);
  assert.equal(result.record.source.headSha, await f.git('rev-parse', 'HEAD'));
});
test('tracked compact advisory evidence remains usable in a fresh checkout', async (t) => {
  const f = await fixture(t);
  await declareAdvisoryReadiness(f.home, f.input, {
    adapter: transport().adapter,
  });
  await f.commit('Track compact records and fast evidence');
  const root = await mkdtemp(join(tmpdir(), 'advisory portable clone '));
  t.after(() => rm(root, { recursive: true, force: true }));
  await exec('git', ['clone', '--no-hardlinks', f.root, root]);
  await writeFile(join(root, '.git/info/exclude'), '.agentic-workflow.json\n');
  await writeFile(
    join(root, '.agentic-workflow.json'),
    JSON.stringify(f.config)
  );
  const home = join(root, 'docs/issues/advisory-feature');
  const result = await checkAdvisoryDisposition(
    home,
    { readinessId: 'ready-1', repositoryRoot: root },
    { requireTracked: true }
  );
  assert.equal(result.eligible, true, JSON.stringify(result));
  assert.equal(result.outcome, 'READY_FOR_FORMAL_REVIEW');
});

test('defect-class readiness requires affected-path coverage and historical evidence is tracked before formal entry', async (t) => {
  const f = await fixture(t);
  await declareAdvisoryReadiness(f.home, f.input, {
    adapter: transport({ output: findingResult }).adapter,
  });
  const revised = {
    ...f.input,
    readinessId: 'ready-2',
    remediation: [
      {
        findingIds: ['advisory:ready-1:0'],
        invariant: 'Newer intent must survive a late response',
        examinedPaths: ['app.test.mjs'],
        approach: 'Inspect ownership and response order.',
        regressions: [
          {
            scenario: 'Late response ordering',
            command: 'node --test app.test.mjs',
            outcome: 'PASS',
            evidence: [f.input.checks[1].evidence[0]],
          },
        ],
      },
    ],
  };
  await assert.rejects(
    declareAdvisoryReadiness(f.home, revised, { adapter: transport().adapter }),
    /every identified affected path/
  );
  revised.remediation[0].examinedPaths.push('app.mjs');
  await declareAdvisoryReadiness(f.home, revised, {
    adapter: transport().adapter,
  });
  await f.git(
    'add',
    'docs/issues/advisory-feature/advisory/ready-2',
    'docs/issues/advisory-feature/runtime'
  );
  await f.git(
    'commit',
    '-m',
    'Deliberately omit earlier advisory record fixture'
  );
  const checked = await checkAdvisoryDisposition(
    f.home,
    { readinessId: 'ready-2', repositoryRoot: f.root },
    { requireTracked: true }
  );
  assert.equal(checked.eligible, false);
  assert.match(checked.blockers[0].message, /commit each advisory record/);
});
