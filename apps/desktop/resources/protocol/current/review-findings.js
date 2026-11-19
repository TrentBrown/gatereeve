import { identity, requireThat } from './contracts.js';

export async function findingObligations(core, state, candidate, inputs, result) {
  const known = new Map(), provided = new Set();
  const withheld = state.reviewRounds.find(round => round.event === inputs.reviewRound)?.withheld ?? [];
  const history = [...new Map([...withheld, ...(inputs.history ?? [])].map(ref => [ref.hash, ref])).values()]
    .sort((a, b) => state.results.findIndex(ref => ref.hash === a.hash) - state.results.findIndex(ref => ref.hash === b.hash));
  for (const reference of history) {
    const report = await core.store.json(reference);
    if (report.gate !== 'review') continue;
    if ((inputs.history ?? []).some(ref => ref.hash === reference.hash)) {
      for (const row of [...(report.findings ?? []), ...(report.dispositions ?? [])]) provided.add(row.id);
    }
    const input = await core.store.json(report.input), historic = await core.store.json(input.candidate);
    if (!historic.repositories.some(repo => candidate.repositories.some(selected => identity(repo.identity) === identity(selected.identity)))) continue;
    for (const finding of report.findings ?? []) if ((candidate.criteria.includes(finding.criterion) || finding.criterion === 'gate:review')
      && (candidate.repositories.some(repo => finding.path.startsWith(`${repo.alias}/`)) || /^(requirements|planning)\//u.test(finding.path))) {
      known.set(finding.id, { finding, open: finding.blocking });
    }
    for (const disposition of report.dispositions ?? []) if (known.has(disposition.id)) {
      if (['resolved', 'unsupported'].includes(disposition.status)) known.get(disposition.id).open = false;
      if (disposition.status === 'present') known.get(disposition.id).open = known.get(disposition.id).finding.blocking;
    }
  }
  const unreconciled = [...known.values()].filter(row => row.open && !result.findings?.some(finding => finding.id === row.finding.id && finding.blocking)
    && !result.dispositions?.some(disposition => provided.has(disposition.id) && disposition.id === row.finding.id
    && ['resolved', 'unsupported', 'present'].includes(disposition.status))).map(row => row.finding.id);
  const material = new Map((result.findings ?? []).filter(finding => finding.blocking).map(finding => [finding.id, finding]));
  for (const disposition of result.dispositions ?? []) if (disposition.status === 'present' && !material.has(disposition.id)) {
    const original = known.get(disposition.id)?.finding;
    requireThat(original, 'A present finding needs retained identity in the supplied reviewer history');
    if (original.blocking) material.set(disposition.id, { ...original, evidence: disposition.evidence });
  }
  return { materialFindings: [...material.values()], unreconciledFindings: unreconciled };
}
