import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Reviewer history is evidence the evaluator reads, not prompt text it must
// receive whole. Every selected prior report is copied in full into the
// read-only review view (evidence/<hex>), and history/index.json lists a
// projection of every entry. The prompt carries as many projections as fit a
// fixed budget, chosen deterministically by what the reviewer must act on, then
// compact references, then nothing beyond the index path. Selection itself is
// unchanged and has no record-count cutoff, so a failed round can never make
// review impossible. Verdict validation always uses the full server-side reports.
export const HISTORY_FORMAT = 'history-projection/1';
export const HISTORY_GUIDE = 'Each history entry projects one prior report: findings with evidence, disposition statuses, non-PASS criterion evidence, coverage completeness and limitations, and historyAssessment. Its full report is the read-only file named by report; every object a report references by sha256:<hex> is at evidence/<hex>. Entries with inline:false carry only their reference; historyIndex.indexOnly counts further entries that appear only in history/index.json, which lists every selected entry in full projection, in run order. Read the full report or index whenever a projection is insufficient. Omission from the prompt is a size bound, never a statement that the history passed or was unavailable; historyGaps alone reports unavailable evidence.';
// Budgets in characters of serialized JSON. The first tier whose complete
// prompt fits the provider limit is used; later tiers only shrink history.
export const HISTORY_TIERS = Object.freeze([
  Object.freeze({ inline: 160 * 1024, references: 32 * 1024 }),
  Object.freeze({ inline: 48 * 1024, references: 32 * 1024 }),
  Object.freeze({ inline: 0, references: 16 * 1024 }),
  Object.freeze({ inline: 0, references: 0 }),
]);
// Lower rank is more important for the reviewer to see inline.
export const HISTORY_PRIORITY = Object.freeze({ open: 0, reconsider: 1, requested: 2, context: 3 });

export const evidencePath = ref => `evidence/${ref.hash.slice(7)}`;
const originalHash = entry => entry.reviewerResult.originalResultHash ?? entry.reference.hash;

export function projectReport(entry) {
  const report = entry.reviewerResult;
  const projection = { reference: entry.reference, report: evidencePath(entry.reference), gate: report.gate, outcome: report.outcome };
  if (report.mode) projection.mode = report.mode;
  if (report.evidenceUnavailable) Object.assign(projection, { evidenceUnavailable: true, originalResultHash: report.originalResultHash });
  if (report.coverage) projection.coverage = { complete: report.coverage.complete, limitations: report.coverage.limitations ?? [] };
  projection.criteria = (report.criteria ?? []).map(({ id, outcome, evidence }) => outcome === 'PASS' ? { id, outcome } : { id, outcome, evidence });
  projection.findings = report.findings ?? [];
  if (report.unvalidatedFindings?.length) projection.unvalidatedFindings = report.unvalidatedFindings;
  projection.dispositions = (report.dispositions ?? []).map(({ id, status }) => ({ id, status }));
  projection.historyAssessment = report.historyAssessment ?? null;
  return projection;
}
export function referenceReport(entry) {
  const report = entry.reviewerResult;
  return { reference: entry.reference, report: evidencePath(entry.reference), gate: report.gate, outcome: report.outcome, inline: false };
}

// priorities: Map of original result hash -> HISTORY_PRIORITY rank.
export function shapeHistory(history, priorities, tier) {
  const rows = history.map((entry, position) => {
    const full = projectReport(entry), reference = referenceReport(entry);
    return { position, full, reference, rank: priorities.get(originalHash(entry)) ?? HISTORY_PRIORITY.context,
      fullSize: JSON.stringify(full).length, referenceSize: JSON.stringify(reference).length };
  });
  const order = [...rows].sort((a, b) => a.rank - b.rank || b.position - a.position);
  let inline = tier.inline, references = tier.references;
  for (const row of order) {
    if (row.fullSize <= inline) { row.shape = 'inline'; inline -= row.fullSize; }
    else if (row.referenceSize <= references) { row.shape = 'reference'; references -= row.referenceSize; }
    else row.shape = 'index';
  }
  const count = shape => rows.filter(row => row.shape === shape).length;
  return {
    entries: rows.filter(row => row.shape !== 'index').map(row => row.shape === 'inline' ? row.full : row.reference),
    summary: { format: HISTORY_FORMAT, guide: HISTORY_GUIDE, index: 'history/index.json', total: rows.length,
      inline: count('inline'), references: count('reference'), indexOnly: count('index') },
  };
}

export async function writeHistoryIndex(root, history) {
  await mkdir(join(root, 'history'));
  await writeFile(join(root, 'history', 'index.json'), JSON.stringify({ format: HISTORY_FORMAT, guide: HISTORY_GUIDE,
    entries: history.map(projectReport) }, null, 1), { mode: 0o400, flag: 'wx' });
}

// Fit the complete prompt: the first tier whose measured prompt fits wins.
export function fitHistory(history, priorities, measure, limit) {
  let chosen = null;
  for (const [index, tier] of HISTORY_TIERS.entries()) {
    const shaped = shapeHistory(history, priorities, tier);
    const characters = measure(shaped);
    chosen = { ...shaped, tier: index, characters };
    if (characters <= limit) return { ...chosen, fits: true };
  }
  return { ...chosen, fits: false };
}
