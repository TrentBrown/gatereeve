import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapCommandCompletion,
  parseCommandStructuredOutput,
  parseModuleProviderResponse,
  validateModuleProviderRequest,
} from '../../plugin-src/shared/resources/protocol/index.js';

const digest = `sha256:${'a'.repeat(64)}`;
const fingerprint = `sha256:${'b'.repeat(64)}`;

function request() {
  return {
    schemaVersion: 1,
    requestId: 'request-1',
    operation: 'observe',
    provider: { id: 'example/check-provider', version: '1.2.3' },
    module: { id: 'example/check', version: '2.0.0', digest },
    input: {
      featureId: 'feature-1',
      attemptId: 'attempt-1',
      scope: 'SLICE',
      inputFingerprint: fingerprint,
      dependencyEventIds: { prerequisite: 'event-1' },
      evidence: null,
    },
  };
}

function response(overrides = {}) {
  return {
    schemaVersion: 1,
    requestId: 'request-1',
    provider: { id: 'example/check-provider', version: '1.2.3' },
    module: { id: 'example/check', version: '2.0.0', digest },
    observedInputFingerprint: fingerprint,
    live: {
      status: 'running',
      detail: 'Checking',
      updatedAt: '2026-09-03T12:00:00.000Z',
      stages: [], actions: [], attempts: [], evidence: [], links: [], failure: null,
    },
    outcome: null,
    evidence: null,
    ...overrides,
  };
}

test('provider request and response bind exact provider, module, request, and input identities', () => {
  assert.equal(validateModuleProviderRequest(request()).operation, 'observe');
  assert.equal(parseModuleProviderResponse(JSON.stringify(response()), request()).live.status, 'running');
  assert.throws(
    () => parseModuleProviderResponse(JSON.stringify(response({ observedInputFingerprint: digest })), request()),
    /stale or mismatched input fingerprint/,
  );
  assert.throws(
    () => parseModuleProviderResponse('{not json', request()),
    /malformed JSON/,
  );
  assert.throws(
    () => parseModuleProviderResponse(JSON.stringify({ ...response(), extra: true }), request()),
    /invalid shape/,
  );
});

test('command completion is fail-closed and provider observation cannot override process failure', () => {
  assert.deepEqual(mapCommandCompletion({ exitCode: 0 }), {
    attemptStatus: 'passed', outcome: 'PASS', reason: 'Command completed successfully',
  });
  assert.equal(mapCommandCompletion({ exitCode: 0, observed: true }).outcome, 'UNSET');
  assert.equal(mapCommandCompletion({ exitCode: 3, observed: true }).outcome, 'FAIL');
  assert.equal(mapCommandCompletion({ exitCode: 0, signal: 'SIGTERM' }).outcome, 'FAIL');
  assert.equal(mapCommandCompletion({ exitCode: 0, timedOut: true }).outcome, 'FAIL');
  assert.deepEqual(mapCommandCompletion({ exitCode: 0, cancelled: true }), {
    attemptStatus: 'cancelled', outcome: 'UNSET', reason: 'Cancelled by user',
  });
});

test('command structured output is optional enrichment without an outcome field', () => {
  assert.deepEqual(parseCommandStructuredOutput('progress\n{"schemaVersion":1,"detail":"done","evidence":{"id":"log"}}\n'), {
    schemaVersion: 1, detail: 'done', evidence: { id: 'log' },
  });
  assert.equal(parseCommandStructuredOutput('{"schemaVersion":1,"outcome":"PASS"}'), null);
  assert.equal(parseCommandStructuredOutput('ordinary terminal output'), null);
});
