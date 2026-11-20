import { identity, requireThat } from './contracts.js';
import { runCheckProcess } from './execution.js';
import { configuredGit } from './authorization.js';
import { assertClean } from './evidence.js';

const html = text => String(text ?? '').replace(/[&<>"]/gu, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
}[char]));
const pathFor = (ref, name) => `.gatereeve-current/handoff/${ref.hash.slice(7)}/${name}`;

async function mutationEvidence(core, { pin, repository, state }) {
  const configuration = repository.mutationAdvisory;
  if (!configuration) return null;
  const execute = core.runtime.mutineer ?? ((args, path, timeoutMs) =>
    runCheckProcess({ command: 'mutineer', args, timeoutMs }, {}, path, process.env));
  const version = await execute(['--version'], repository.path, 30000);
  if (version.outcome !== 'PASS') return { status: 'unavailable', reason: 'Mutineer version could not be determined' };
  const input = { head: pin.head, target: pin.target, version: version.stdout.trim(), configuration };
  const job = `mutation_${identity(input).slice(7)}`;
  let retained = await core.store.job(job);
  if (!retained && await core.store.claimJob(job)) {
    const started = Date.now();
    let result;
    try {
      const git = configuredGit(core);
      const mergeBase = (await git(repository.path, ['merge-base', pin.head, pin.target])).trim();
      requireThat((await git(repository.path, ['rev-parse', 'HEAD'])).trim() === pin.head, 'Mutation checkout changed');
      const args = ['run', '--since', pin.target, '--json'];
      if (configuration.packages.length) args.push('--package', ...configuration.packages);
      const run = await execute(args, repository.path, configuration.timeoutMs);
      // Qualify our checkout as well as the range reported by the tool.
      requireThat((await git(repository.path, ['rev-parse', 'HEAD'])).trim() === pin.head, 'Mutation checkout changed during execution');
      await assertClean(repository, core.store);
      requireThat(run.outcome === 'PASS', run.termination?.reason ?? 'Mutation command unavailable');
      if (run.stdout.startsWith('Nothing to mutate: no source lines')) {
        result = { status: 'skipped', reason: 'No eligible changed production lines', mergeBase };
      } else {
        const record = JSON.parse(run.stdout);
        requireThat(record.commitPinned === true && record.commit === pin.head && record.baseRef === pin.target
          && record.mergeBase === mergeBase && record.scope?.ranges === true && Array.isArray(record.packages),
        'Mutineer result did not match the pinned source range');
        const counts = { generated: 0, killed: 0, survived: 0, uncovered: 0 };
        for (const pkg of record.packages) {
          counts.generated += Object.values(pkg.counts ?? {}).reduce((total, count) => total + count, 0);
          counts.killed += pkg.counts?.Killed ?? 0;
          counts.survived += pkg.counts?.Survived ?? 0;
          counts.uncovered += pkg.counts?.NoCoverage ?? 0;
        }
        result = { status: 'completed', mergeBase, counts, selectedPackages: record.packages.map(pkg => pkg.package), record };
      }
    } catch (error) {
      result = { status: 'unavailable', reason: error.message };
    }
    const report = await core.store.putJson({ ...input, ...result, durationMs: Date.now() - started });
    retained = { runId: state.runId, report };
    await core.store.saveJob(job, retained);
  }
  retained ??= await core.store.job(job);
  if (!retained) return { status: 'unavailable', reason: 'A matching run is active or its prior execution was interrupted' };
  const report = await core.store.json(retained.report);
  const { record, ...summary } = report;
  return { ...summary, reference: retained.report };
}

function handoffIdentity(target, outcomes) {
  return `handoff_${identity({
    candidate: target.state.candidate,
    review: target.review.ref,
    repository: target.pin.alias,
    number: target.number,
    mutationAdvisory: target.repository.mutationAdvisory ?? null,
    evidence: outcomes.map(row => ({ gate: row.id, outcome: row.outcome, result: row.result,
      reviews: row.reviews ?? [], exception: row.exception })),
  }).slice(7)}`;
}

export async function requireFinalHandoff(core, target) {
  const check = await core.check('acceptance');
  requireThat(check.allowed && check.runId === target.state.runId && check.eventCount === target.state.eventCount,
    'Acceptance evidence changed; prepare a current review handoff');
  const saved = await core.store.handoff(handoffIdentity(target, check.outcomes));
  requireThat(saved?.runId === target.state.runId && saved.handoff, 'Generate the current PR explainer with review.publish before merge');
  const handoff = await core.store.json(saved.handoff);
  await core.store.closure(handoff);
  await core.store.currentBytes({ ...handoff.reference, path: pathFor(handoff.reference, 'pr-explainer.html') });
  return handoff;
}

export async function finalHandoff(core, target) {
  const check = await core.check('acceptance');
  const { state, candidate, pin, ownerRepo, review } = target;
  if (!check.allowed) return null;
  requireThat(check.runId === state.runId && check.eventCount === state.eventCount, 'Acceptance evidence changed before final handoff');
  let mutation;
  try {
    const passed = check.outcomes.filter(row => ['review', 'verification'].includes(row.id) && row.outcome === 'PASS');
    mutation = passed.length === 2 ? await mutationEvidence(core, target)
      : target.repository.mutationAdvisory ? { status: 'skipped', reason: 'Verification and paired review did not both pass' } : null;
  }
  catch { mutation = { status: 'unavailable', reason: 'Mutation evidence could not be retained or retrieved' }; }
  const findings = (review.pair?.members ?? []).flatMap(member => (member.result.findings ?? [])
    .map(item => `<li><strong>${html(item.blocking ? 'Blocking' : 'Advisory')}:</strong> ${html(item.evidence)} <code>${html(item.path)}</code></li>`));
  const perspectives = (review.pair?.members ?? []).map(({ reviewer, result }) =>
    `<details><summary>${html(reviewer.model)} · ${html(reviewer.reasoningEffort)} · ${html(result.outcome)}</summary><p>${html(result.summary)}</p><ul>${(result.dimensions ?? []).map(item => `<li><b>${html(item.name)}</b> · ${html(item.outcome)} · ${html(item.evidence)}</li>`).join('')}</ul></details>`);
  const acceptance = (review.pair?.members ?? []).flatMap(({ result }) => result.criteria ?? []);
  const limitations = [...new Set((review.pair?.members ?? []).flatMap(({ result }) => result.coverage?.limitations ?? []))];
  const verification = check.outcomes.find(row => row.id === 'verification');
  const commands = verification.provenance?.agentRun ?? [];
  const comparison = `https://github.com/${ownerRepo}/compare/${pin.base}...${pin.head}`;
  const baseFiles = new Map(pin.baseFiles.map(file => [file.path, file]));
  const headFiles = new Map(pin.files.map(file => [file.path, file]));
  const changed = [...new Set([...baseFiles.keys(), ...headFiles.keys()])].sort().filter(path => {
    const base = baseFiles.get(path), head = headFiles.get(path);
    return base?.oid !== head?.oid || base?.mode !== head?.mode;
  });
  const files = changed.map(file => {
    const path = file.split('/').map(encodeURIComponent).join('/');
    const revision = headFiles.has(file) ? pin.head : pin.base;
    return `<li><a href="https://github.com/${html(ownerRepo)}/blob/${html(revision)}/${html(path)}">${html(file)}</a>${headFiles.has(file) ? '' : ' (removed)'}</li>`;
  }).join('');
  const exceptions = check.outcomes.flatMap(row => {
    const decision = row.exception ?? row.adjudication;
    return decision ? [`<li>${html(row.id)} · ${html(decision.reason)} ${html(decision.consequences ?? decision.stopReason)}</li>`] : [];
  });
  const mutationSummary = mutation?.counts
    ? `${mutation.counts.generated} generated, ${mutation.counts.killed} killed, ${mutation.counts.survived} surviving, ${mutation.counts.uncovered} uncovered`
    : mutation?.reason;
  if (mutation) mutation.summary = mutationSummary ?? mutation.status;
  const document = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PR explainer · ${html(ownerRepo)}</title>
<style>body{font:1rem/1.6 system-ui,sans-serif;max-width:52rem;margin:3rem auto;padding:0 1.25rem;color:#172439;background:#f6f8fc}h1{line-height:1.1}section{padding:1rem 1.35rem;background:white;border:1px solid #dce3ec;border-radius:.65rem;margin:1rem 0}code{overflow-wrap:anywhere}summary{cursor:pointer}a{color:#1456a2}</style>
<h1>PR explainer</h1><p>${html(ownerRepo)} · ${html(candidate.scope)} review · <a href="${html(comparison)}">Pinned comparison</a></p>
<p>Head <code>${html(pin.head)}</code><br>Base <code>${html(pin.base)}</code><br>Target <code>${html(pin.target)}</code></p>
<section><h2>Review summary</h2>${(review.pair?.members ?? []).map(({ result }) => `<p>${html(result.summary)}</p>`).join('')}</section>
<section><h2>Acceptance criteria</h2><ul>${acceptance.map(item => `<li>${html(item.id)} · ${html(item.outcome)} · ${html(item.evidence)}</li>`).join('')}</ul></section>
<section><h2>Verification</h2><ul>${check.outcomes.filter(row => ['context', 'verification'].includes(row.id)).map(row => `<li>${html(row.outcome)} · ${html(row.reason)}</li>`).join('')}${commands.map(row => `<li>${html(row.outcome)} · ${html(row.purpose)}</li>`).join('')}</ul></section>
<section><h2>Findings and limits</h2>${findings.length ? `<ul>${findings.join('')}</ul>` : '<p>No findings reported.</p>'}${limitations.length ? `<ul>${limitations.map(item => `<li>${html(item)}</li>`).join('')}</ul>` : ''}${perspectives.join('')}</section>
${exceptions.length ? `<section><h2>Acceptance decisions</h2><ul>${exceptions.join('')}</ul></section>` : ''}
<section><h2>Changed files</h2><ul>${files}</ul></section>
${mutation ? `<section data-evidence="${html(mutation.reference?.hash)}"><h2>Mutation testing advisory</h2><p>${html(mutation.status)} · ${html(mutation.summary)}</p>${mutation.selectedPackages?.length ? `<p>Packages ${html(mutation.selectedPackages.join(', '))} · ${Math.round(mutation.durationMs / 1000)}s</p>` : ''}${mutation.reference ? '<p><a href="mutineer.json">Detailed report</a></p>' : ''}<p>Pruning is available as a separate maintainer decision.</p></section>` : ''}</html>`;
  const latest = (await core.state()).state;
  requireThat(latest.runId === state.runId && latest.eventCount === state.eventCount, 'Acceptance evidence changed while preparing the explainer');
  await core.assertLiveInputs(state, 'acceptance', check.liveInputs);
  const ref = await core.store.put(document);
  if (mutation?.reference) mutation.path = await core.store.publishReport(pathFor(ref, 'mutineer.json'), mutation.reference);
  const path = await core.store.publishReport(pathFor(ref, 'pr-explainer.html'), ref);
  const handoff = { path, reference: ref, candidate: state.candidate, review: review.ref, mutation };
  const packet = await core.store.putJson({ ...handoff,
    evidence: check.outcomes.map(row => ({ gate: row.id, outcome: row.outcome, references: row.reviews ?? [row.result].filter(Boolean) })),
  });
  await core.store.publishReport(pathFor(ref, `${packet.hash.slice(7)}-packet.json`), packet);
  // Advance the pointer after all files are published. Previous packets
  // retain their independent, content-addressed artifacts.
  await core.store.saveHandoff(handoffIdentity(target, check.outcomes), { runId: state.runId, handoff: packet });
  return { ...handoff, packet };
}
