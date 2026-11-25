import { identity, requireThat } from './contracts.js';
import { contentIdentity } from './evidence.js';

// Low never blocks; findings from earlier contracts (no severity) keep their flag (AC3, AC11).
const severityBlocks = finding => Boolean(finding?.blocking) && finding?.severity !== 'low';

// Recovery context is finding evidence, never replacement execution proof.
// Copy scope facts while the original inputs can still be read, so later
// qualification need not make unavailable artifacts dependencies again.
export function reviewScope(candidate, configuration) {
  return { repositories: candidate.repositories.map(({ alias, identity }) => ({ alias, identity })),
    criteria: candidate.criteria, contentIdentity: contentIdentity(candidate),
    provider: configuration.provider, model: configuration.model,
    reviewerSelection: configuration.reviewerSelection ?? null };
}

export async function retainedReviewScope(core, report) {
  if (report.kind === 'historical-context') return report.scope ?? null;
  const input = await core.store.json(report.input);
  return reviewScope(await core.store.json(input.candidate), input.configuration);
}

// `blocks(finding, prior)` applies the round schedule (round-policy.js); prior
// is true for findings already disclosed in supplied history. The default is
// the reviewer's blocking flag, where low never blocks (legacy and rounds 1-3).
export async function findingObligations(core, state, candidate, inputs, result, blocks = severityBlocks) {
  const known = new Map(), provided = new Set();
  const withheld = state.reviewRounds.find(round => round.event === inputs.reviewRound)?.withheld ?? [];
  const history = await Promise.all([...new Map([...withheld, ...(inputs.history ?? [])].map(ref => [ref.hash, ref])).values()]
    .map(async reference => ({ reference, report: await core.store.json(reference) })));
  const position = ({ reference, report }) => state.results.findIndex(ref => ref.hash === (report.originalResultHash ?? reference.hash));
  history.sort((a, b) => position(a) - position(b));
  // Peer reviews of one round are judged together: a finding counts as
  // resolved only when no reviewer of that round still marks it present, so a
  // disagreement keeps the finding and its original regression status (AC6).
  const roundKey = new Map(), presentInRound = new Map();
  for (const { reference, report } of history) {
    let key = reference.hash;
    try { if (report.input) key = (await core.store.json(report.input)).reviewRound ?? key; } catch { /* lost input: its own round */ }
    roundKey.set(reference.hash, key);
    const present = presentInRound.get(key) ?? new Set();
    for (const row of report.dispositions ?? []) if (row.status === 'present') present.add(row.id);
    presentInRound.set(key, present);
  }
  for (const { reference, report } of history) {
    if (report.gate !== 'review') continue;
    if ((inputs.history ?? []).some(ref => ref.hash === reference.hash)) {
      for (const row of [...(report.findings ?? []), ...(report.dispositions ?? [])]) provided.add(row.id);
    }
    const scope = await retainedReviewScope(core, report);
    // Older context has already been scoped by history preparation. Its
    // available finding facts can remain obligations, but cannot prove PASS.
    if (scope && !scope.repositories.some(repo => candidate.repositories.some(selected => identity(repo.identity) === identity(selected.identity)))) continue;
    // The raising review's candidate keeps a prior finding's regression status (AC6).
    let origin = null;
    try { origin = report.input ? (await core.store.json(report.input)).candidate?.hash ?? null : null; } catch { /* Lost input: no regression evidence. */ }
    for (const finding of report.findings ?? []) if ((candidate.criteria.includes(finding.criterion) || finding.criterion === 'gate:review')
      && (candidate.repositories.some(repo => finding.path.startsWith(`${repo.alias}/`)) || /^(requirements|planning)\//u.test(finding.path))) {
      // The first review that raised an ID keeps its origin (regression status).
      const first = known.get(finding.id)?.resolved ? origin : known.get(finding.id)?.origin ?? origin;
      known.set(finding.id, { finding, origin: first, open: blocks(finding, true, first) });
    }
    const peersPresent = presentInRound.get(roundKey.get(reference.hash)) ?? new Set();
    for (const disposition of report.dispositions ?? []) if (known.has(disposition.id)) {
      if (['resolved', 'unsupported'].includes(disposition.status) && peersPresent.has(disposition.id)) continue;
      if (['resolved', 'unsupported', 'present-low'].includes(disposition.status)) known.get(disposition.id).open = false;
      // A resolved finding that is raised again later is judged afresh.
      if (['resolved', 'unsupported'].includes(disposition.status)) Object.assign(known.get(disposition.id), { origin: null, resolved: true });
      if (disposition.status === 'present') {
        const row = known.get(disposition.id);
        // Present again after resolution: a reintroduction judged from this review.
        if (row.resolved) Object.assign(row, { origin, resolved: false });
        row.open = blocks(row.finding, true, row.origin);
      }
    }
  }
  const unreconciled = [...known.values()].filter(row => row.open && !result.findings?.some(finding => finding.id === row.finding.id && blocks(finding))
    && !result.dispositions?.some(disposition => provided.has(disposition.id) && disposition.id === row.finding.id
    && ['resolved', 'unsupported', 'present', 'present-low'].includes(disposition.status))).map(row => row.finding.id);
  // A current report of a resolved ID is a reintroduction: judged afresh
  // against the current fix's changed paths, not as history.
  const historical = id => known.has(id) && !known.get(id).resolved;
  const material = new Map((result.findings ?? []).filter(finding => blocks(finding, historical(finding.id), known.get(finding.id)?.origin)).map(finding => [finding.id, finding]));
  for (const disposition of result.dispositions ?? []) if (disposition.status === 'present' && !material.has(disposition.id)) {
    const original = result.findings?.find(finding => finding.id === disposition.id) ?? known.get(disposition.id)?.finding;
    requireThat(original, 'A present finding needs retained identity in the supplied reviewer history');
    if (blocks(original, historical(disposition.id) || !known.has(disposition.id), known.get(disposition.id)?.origin ?? null)) material.set(disposition.id, { ...original, evidence: disposition.evidence });
  }
  return { materialFindings: [...material.values()], unreconciledFindings: unreconciled,
    knownFindings: new Map([...known].map(([id, row]) => [id, row.finding])) };
}
