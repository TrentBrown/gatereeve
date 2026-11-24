// Shared steps for the round-policy and CI-after-convergence tests (spec AC6,
// AC9). Candidates are local commits that are never pushed unless a test says so.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { git } from '../../../plugin-src/shared/resources/protocol/current/evidence.js';
import { identity } from '../../../plugin-src/shared/resources/protocol/current/contracts.js';
import { ROUND_POLICY } from '../../../plugin-src/shared/resources/protocol/current/round-policy.js';
import { sha256Digest } from '../../../plugin-src/shared/resources/protocol/agent-workflow.js';
import { candidate } from './lightweight-fixture.js';
import { pairedAdapters } from './paired-review-fixture.js';

export const focusedCheck = (purpose = 'Focused fixture check', extra = {}) => ({ repository: 'app', command: process.execPath,
  args: ['-e', `process.exit(0) // ${purpose}`], purpose, ...extra });

export async function localVerification(f, operationId, checks = [focusedCheck()]) {
  return f.request('gate.execute', { gates: ['verification'], configuration: {
    validation: { kind: 'alternative', reason: 'Local round evidence before the single push', scope: 'Focused and affected suites' }, checks } }, operationId);
}

// Commit a change locally (no push), prepare it as the candidate and record
// local Verification for it.
export async function revise(f, files, label, checks) {
  for (const [path, body] of Object.entries(files)) await writeFile(join(f.repo, path), body);
  await git(f.repo, ['add', '-A']); await git(f.repo, ['commit', '-q', '-m', `local ${label}`]);
  const head = (await git(f.repo, ['rev-parse', 'HEAD'])).trim();
  await candidate(f, 'SLICE', head, `candidate-${label}`);
  await localVerification(f, `verify-${label}`, checks);
  return head;
}

// Earlier rounds of this scope, recorded as the projection counts them, so a
// test can start at a late round. Each seed reuses the current candidate as the
// revision's source; only the revision identity differs.
export async function seedRounds(f, count, scope = 'slice') {
  for (let index = 1; index <= count; index++) {
    const { state } = await f.core.state();
    const payload = { candidate: state.candidate, selection: state.reviewerSelection.event, round: identity({ seed: index }), outcomes: [],
      roundPolicy: { policy: ROUND_POLICY, scope, revision: identity({ seededRevision: index, scope }) } };
    await f.core.append(state, 'BOUNDARY_REVIEWED', payload, { id: `seed-round-${scope}-${index}`, hash: identity(payload) });
  }
}

// The reviewer contract from PR B1 adds `severity`; this build's schema does
// not accept it yet. Simulate it by reading a `[high|medium|low]` tag in the
// finding evidence when stored review results are read back.
export function simulateSeverity(f) {
  const read = f.core.store.json.bind(f.core.store);
  f.core.store.json = async ref => {
    const value = await read(ref);
    if (value?.kind === 'result' && value.gate === 'review' && Array.isArray(value.findings)) {
      return { ...value, findings: value.findings.map(finding => {
        const severity = /\[(high|medium|low)\]/u.exec(finding.evidence ?? '')?.[1];
        return severity ? { ...finding, severity } : finding;
      }) };
    }
    return value;
  };
}

// Paired fake reviewers; `findings[provider]` makes that reviewer FAIL with
// those findings (each needs path and evidence, optionally blocking).
export function reviewers(f, { findings = {}, unavailable = null } = {}) {
  const launches = pairedAdapters(f, { unavailable });
  for (const [provider, adapter] of Object.entries(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => {
      const result = await run(request);
      const rows = findings[provider];
      if (rows?.length) for (const verdict of result.output.verdicts) {
        verdict.outcome = 'FAIL';
        verdict.dimensions.find(row => row.name === 'code').outcome = 'FAIL';
        verdict.findings = rows.map((row, index) => ({ id: `${provider}-finding-${index}`, classId: 'fixture', criterion: request.input.criteria[0], blocking: true, ...row }));
      }
      result.receipt.digests.output = sha256Digest(result.output);
      return result;
    };
  }
  return launches;
}
