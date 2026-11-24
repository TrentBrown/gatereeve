// Shared steps for the round-policy and CI-after-convergence tests (spec AC6,
// AC9). Candidates are local commits that are never pushed unless a test says so.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
    validation: { kind: 'alternative', reason: 'Local round evidence before the single push', scope: 'Focused and affected suites', ciRequiredChecks: ['test'] }, checks } }, operationId);
}

// Commit a change locally (no push), prepare it as the candidate and record
// local Verification for it.
export async function revise(f, files, label, checks) {
  for (const [path, body] of Object.entries(files)) { await mkdir(dirname(join(f.repo, path)), { recursive: true }); await writeFile(join(f.repo, path), body); }
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

// Paired fake reviewers; `findings[provider]` makes that reviewer FAIL with
// those findings (each needs path and evidence, optionally blocking).
// `patch[provider](verdict, request)` adjusts that reviewer's verdict last.
export function reviewers(f, { findings = {}, unavailable = null, patch = {} } = {}) {
  const launches = pairedAdapters(f, { unavailable });
  for (const [provider, adapter] of Object.entries(f.core.runtime.evaluators)) {
    const run = adapter.runStage.bind(adapter);
    adapter.runStage = async request => {
      const result = await run(request);
      const rows = findings[provider];
      if (rows?.length) for (const verdict of result.output.verdicts) {
        verdict.outcome = 'FAIL';
        // A low finding never fails a responsibility; others fail the code dimension.
        if (rows.some(row => !/\[low\]/u.test(row.evidence ?? ''))) verdict.dimensions.find(row => row.name === 'code').outcome = 'FAIL';
        // A `[high|medium|low]` tag in the evidence sets the B1 severity field;
        // untagged rows are high, which blocks exactly like the reviewer flag.
        verdict.findings = rows.map((row, index) => ({ id: `${provider}-finding-${index}`, classId: 'fixture', classStatement: 'Fixture defect class',
          failureScenario: 'Fixture input -> wrong observable output', criterion: request.input.criteria[0], blocking: true,
          severity: /\[(high|medium|low)\]/u.exec(row.evidence ?? '')?.[1] ?? 'high', ...row }));
      }
      if (patch[provider]) for (const verdict of result.output.verdicts) patch[provider](verdict, request);
      result.receipt.digests.output = sha256Digest(result.output);
      return result;
    };
  }
  return launches;
}
