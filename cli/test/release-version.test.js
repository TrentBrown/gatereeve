import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveVerificationTag,
  resolveVersionPlan,
} from '../src/commands/release.js';
import {
  planReleaseVersion,
  releaseChoices,
  validateDeployedRelease,
} from '../src/plugin/release-version.js';

const sourceCommit = '274465dcbea886b59b9d9534bd58a58fe94d17e8';

function deployed(sourceTag = 'v0.1.0-rc.1', commit = sourceCommit) {
  return {
    schemaVersion: 1,
    plugin: 'agentic-development-workflow',
    marketplace: 'quality-code',
    version: sourceTag.slice(1),
    sourceTag,
    sourceCommit: commit,
  };
}

test('plans next RC, promotion, and release-line bumps from an RC', () => {
  const baseline = deployed();
  assert.equal(
    planReleaseVersion({ deployedRelease: baseline, action: 'next-rc' }).tag,
    'v0.1.0-rc.2'
  );
  const promotion = planReleaseVersion({
    deployedRelease: baseline,
    action: 'promote',
  });
  assert.equal(promotion.tag, 'v0.1.0');
  assert.equal(promotion.sourceCommit, sourceCommit);
  assert.equal(promotion.source, 'deployed-rc');
  for (const [bump, expected] of [
    ['patch', 'v0.1.1-rc.1'],
    ['minor', 'v0.2.0-rc.1'],
    ['major', 'v1.0.0-rc.1'],
  ]) {
    assert.equal(
      planReleaseVersion({ deployedRelease: baseline, action: 'bump', bump }).tag,
      expected
    );
  }
});

test('starts the next patch RC from stable and rejects invalid promotion baselines', () => {
  const stable = deployed('v2.3.4');
  assert.equal(
    planReleaseVersion({ deployedRelease: stable, action: 'next-rc' }).tag,
    'v2.3.5-rc.1'
  );
  assert.throws(
    () => planReleaseVersion({ deployedRelease: stable, action: 'promote' }),
    /Promotion requires an rc\.N baseline/
  );
  assert.throws(
    () =>
      planReleaseVersion({
        deployedRelease: deployed('v2.3.4-beta.1'),
        action: 'next-rc',
      }),
    /Next-RC requires a stable or rc\.N baseline/
  );
  assert.deepEqual(
    releaseChoices(stable).choices.map((item) => item.plan?.tag ?? 'custom'),
    ['v2.3.5-rc.1', 'v2.4.0-rc.1', 'v3.0.0-rc.1', 'custom']
  );
});

test('supports large semantic-version identifiers without number precision loss', () => {
  const baseline = deployed('v9007199254740993.4.8-rc.9007199254740993');
  assert.equal(
    planReleaseVersion({ deployedRelease: baseline, action: 'next-rc' }).tag,
    'v9007199254740993.4.8-rc.9007199254740994'
  );
  assert.equal(
    planReleaseVersion({ deployedRelease: baseline, action: 'bump', bump: 'major' })
      .tag,
    'v9007199254740994.0.0-rc.1'
  );
});

test('validates deployed release identity and exposes proposed interactive choices', () => {
  const baseline = deployed();
  const menu = releaseChoices(baseline);
  assert.equal(menu.baseline.tag, baseline.sourceTag);
  assert.deepEqual(
    menu.choices.map((item) => item.plan?.tag ?? 'custom'),
    [
      'v0.1.0-rc.2',
      'v0.1.0',
      'v0.1.1-rc.1',
      'v0.2.0-rc.1',
      'v1.0.0-rc.1',
      'custom',
    ]
  );
  assert.throws(
    () => validateDeployedRelease({ ...baseline, marketplace: 'wrong' }),
    /missing or internally inconsistent/
  );
  assert.throws(
    () => validateDeployedRelease({ ...baseline, sourceTag: 'not-semver' }),
    /valid release tag/
  );
});

test('requires one explicit selector for noninteractive publication', async () => {
  const loadDeployedRelease = async () => deployed();
  await assert.rejects(
    resolveVersionPlan({
      repositoryRoot: '/tmp/repository',
      options: {},
      loadDeployedRelease,
      interactiveTerminal: false,
    }),
    /requires --tag, --next-rc, --promote, or --bump/
  );
  await assert.rejects(
    resolveVersionPlan({
      repositoryRoot: '/tmp/repository',
      options: { tag: 'v1.0.0', nextRc: true },
      loadDeployedRelease,
    }),
    /Choose only one/
  );
  await assert.rejects(
    resolveVersionPlan({
      repositoryRoot: '/tmp/repository',
      options: { promote: true, commit: 'HEAD' },
      loadDeployedRelease,
    }),
    /--commit can be used only with an explicit --tag/
  );
});

test('resolves explicit, computed, and injected interactive plans', async () => {
  const loadDeployedRelease = async () => deployed();
  assert.equal(
    (
      await resolveVersionPlan({
        repositoryRoot: '/tmp/repository',
        options: { tag: 'v3.2.1-rc.4' },
        loadDeployedRelease,
      })
    ).tag,
    'v3.2.1-rc.4'
  );
  assert.equal(
    (
      await resolveVersionPlan({
        repositoryRoot: '/tmp/repository',
        options: { nextRc: true },
        loadDeployedRelease,
      })
    ).tag,
    'v0.1.0-rc.2'
  );
  assert.equal(
    (
      await resolveVersionPlan({
        repositoryRoot: '/tmp/repository',
        options: {},
        loadDeployedRelease,
        interactiveTerminal: true,
        interactiveSelection: async (release) =>
          planReleaseVersion({ deployedRelease: release, action: 'bump', bump: 'minor' }),
      })
    ).tag,
    'v0.2.0-rc.1'
  );
});

test('verification defaults to validated deployed metadata while retaining an exact override', async () => {
  assert.equal(
    await resolveVerificationTag({
      repositoryRoot: '/tmp/repository',
      loadDeployedRelease: async () => deployed(),
    }),
    'v0.1.0-rc.1'
  );
  assert.equal(
    await resolveVerificationTag({
      repositoryRoot: '/tmp/repository',
      tag: 'v2.0.0-rc.7',
      loadDeployedRelease: async () => {
        throw new Error('should not load deployed state');
      },
    }),
    'v2.0.0-rc.7'
  );
  await assert.rejects(
    resolveVerificationTag({
      repositoryRoot: '/tmp/repository',
      loadDeployedRelease: async () => null,
    }),
    /No deployed marketplace release/
  );
});
