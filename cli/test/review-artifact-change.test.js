import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyReviewArtifactPaths,
  parseChangedPaths,
  reviewArtifactFeatureHomes,
} from '../../ci/review-artifact-change.mjs';

test('review artifact classifier admits only lifecycle evidence surfaces', () => {
  const paths = [
    'docs/issues/tb-release-conductor/events.jsonl',
    'docs/issues/tb-release-conductor/completion-report.md',
    'docs/issues/tb-release-conductor/pr-52/boundary.json',
    'docs/issues/tb-release-conductor/pr-52/explain-diff.html',
  ];
  assert.equal(classifyReviewArtifactPaths(paths), 'review-artifacts');
  assert.deepEqual(reviewArtifactFeatureHomes(paths), [
    'docs/issues/tb-release-conductor',
  ]);
});

test('review artifact classifier fails closed for empty, source, and requirement changes', () => {
  assert.equal(classifyReviewArtifactPaths([]), 'full');
  for (const path of [
    'cli/src/commands/release.js',
    'docs/issues/tb-release-conductor/spec.md',
    'docs/issues/tb-release-conductor/plan.md',
    'docs/issues/tb-release-conductor/pr-52/unrecognized.md',
    'docs/issues/unsafe feature/events.jsonl',
  ]) {
    assert.equal(classifyReviewArtifactPaths([path]), 'full', path);
  }
});

test('changed path parser supports NUL-delimited Git output', () => {
  assert.deepEqual(
    parseChangedPaths(Buffer.from('docs/issues/a/events.jsonl\0docs/issues/b/tracker.md\0')),
    ['docs/issues/a/events.jsonl', 'docs/issues/b/tracker.md'],
  );
});
