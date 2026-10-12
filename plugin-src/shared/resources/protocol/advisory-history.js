import { advisoryAssert, underlyingFindingKey } from './advisory-contract.js';
import { advisoryFile } from './advisory-storage.js';
import { validateAgentWorkflowReceipt } from './agent-workflow.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { validateJudgeBundle } = await import(
  pathToFileURL(
    resolve(
      import.meta.dirname,
      '..',
      'agent-workflows',
      'judge',
      'validator.js'
    )
  ).href
);

// Only explicitly published failure evidence for this slice enters the advisory
// checklist. The formal Judge's view continues to exclude this entire history.
export async function formalAdvisoryFindings(record, sliceId) {
  const starts = new Map(
    record.events
      .filter(
        (e) => e.type === 'BOUNDARY_STARTED' && e.payload.sliceId === sliceId
      )
      .map((e) => [e.payload.attemptId, e])
  );
  const findings = [];
  for (const event of record.events.filter(
    (e) =>
      e.type === 'GATE_OUTCOME_RECORDED' &&
      e.payload.gateId === 'judge' &&
      e.payload.outcome === 'FAIL' &&
      starts.has(e.payload.attemptId)
  )) {
    const root = await advisoryFile(
      record.featureHome,
      event.payload.evidence,
      { json: true }
    );
    const started = starts.get(event.payload.attemptId);
    advisoryAssert(
      root.kind === 'workflow-judge' &&
        root.outcome === 'FAIL' &&
        root.source.attemptId === event.payload.attemptId &&
        root.source.inputFingerprint === event.payload.inputFingerprint &&
        root.source.headSha ===
          (started.payload.context.evaluatedSourceSha ??
            started.payload.context.headSha),
      'formal failure checklist provenance is invalid'
    );
    const directory = event.payload.evidence.path.slice(
      0,
      event.payload.evidence.path.lastIndexOf('/') + 1
    );
    const binding = root.files.result;
    advisoryAssert(
      binding.path === 'judge-result.json',
      'formal failure result path is ambiguous'
    );
    const result = await advisoryFile(
      record.featureHome,
      { path: directory + binding.path, hash: binding.sha256 },
      { json: true }
    );
    const markdown = await advisoryFile(
      record.featureHome,
      {
        path: directory + root.files.markdown.path,
        hash: root.files.markdown.sha256,
      },
      { text: true }
    );
    const receipt = await advisoryFile(
      record.featureHome,
      {
        path: directory + root.files.receipt.path,
        hash: root.files.receipt.sha256,
      },
      { json: true }
    );
    const viewAudit = root.files.viewAudit
      ? await advisoryFile(
          record.featureHome,
          {
            path: directory + root.files.viewAudit.path,
            hash: root.files.viewAudit.sha256,
          },
          { json: true }
        )
      : null;
    validateAgentWorkflowReceipt(receipt);
    validateJudgeBundle({
      manifest: root,
      result,
      markdown,
      receipt,
      viewAudit,
    });
    advisoryAssert(
      receipt.attemptId === event.payload.attemptId &&
        receipt.module.id === root.module.id &&
        receipt.module.digest === root.module.digest,
      'formal failure receipt belongs to another attempt/module'
    );
    advisoryAssert(
      result.verdict === 'FAIL',
      'formal finding report is not a code failure'
    );
    const supported = result.findings.filter((f) => f.severity === 'concern');
    advisoryAssert(
      supported.length > 0,
      'formal code failure needs structured supported findings before revised readiness'
    );
    for (const [index, finding] of supported.entries()) {
      const paths = [
        ...new Set(
          finding.evidence.flatMap((e) =>
            [
              ...e.matchAll(
                /(?:^|\s|`)([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+|[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+)(?::\d+|\b)/gu
              ),
            ].map((m) => m[1])
          )
        ),
      ].sort();
      advisoryAssert(
        paths.length > 0,
        'formal finding needs affected paths for defect-class reconciliation'
      );
      const invariant = finding.summary
        .trim()
        .toLowerCase()
        .replace(/\s+/gu, ' ');
      const value = { invariant, affectedPaths: paths };
      findings.push({
        id: 'formal:' + event.eventId + ':' + index,
        underlyingKey: underlyingFindingKey(value),
        source: {
          kind: 'formal',
          eventId: event.eventId,
          reference: event.payload.evidence,
          bindings: Object.values(root.files).map((binding) => ({
            path: directory + binding.path,
            hash: binding.sha256,
          })),
        },
        criterionIds: result.criteria
          .filter((c) => c.result === 'FAIL')
          .map((c) => c.id),
        summary: finding.summary,
        evidence: finding.evidence,
        ...value,
      });
    }
  }
  return findings;
}
