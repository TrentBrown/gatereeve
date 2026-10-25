import { clear, node } from './dom.js';

const title = value => String(value ?? '').toLowerCase().replace(/(^|[-_ ])\w/gu, part => part.replace(/[-_]/gu, ' ').toUpperCase());
const phaseDocs = { DESIGNING: 'interview.md', SPECIFYING: 'spec.md', PLANNING: 'plan.md', IMPLEMENTING: 'issues.md', ACCEPTING: 'tracker.md', INTEGRATED: 'tracker.md', COMPLETE: 'tracker.md' };

export function renderCurrentOverview(snapshot, elements, { openArtifact, copy, readResult } = {}) {
  const phase = snapshot?.current?.phase ?? 'NOT_STARTED';
  for (const id of ['slices-surface', 'boundary-surface', 'closeout-surface', 'finalization-surface']) elements[id].hidden = true;
  clear(elements['global-alerts']);
  for (const blocker of snapshot?.blockers ?? []) elements['global-alerts'].append(node('p', { className: 'notice', text: blocker.message }));
  for (const pending of snapshot?.current?.pendingDecisions ?? []) elements['global-alerts'].append(node('p', { className: 'notice', text: `Pending human instruction: ${pending.decision.reason}. Requested continuation has not been authorized.` }));
  for (const grant of snapshot?.current?.standingAuthorizations ?? []) elements['global-alerts'].append(node('p', { className: 'notice', text: `Standing authorization ${grant.grant}: ${grant.allowed ? 'active' : grant.reason}. Scope: ${JSON.stringify(grant.scope)}. Applications: ${JSON.stringify(grant.applications ?? [])}. Deployment requires separate authorization.` }));
  for (const gap of snapshot?.current?.historyGaps ?? []) elements['global-alerts'].append(node('p', { className: 'notice', text: `Historical evidence unavailable: ${gap.resultHash}. Fresh proof can replace its current role; the lost record is not reconstructed.` }));
  const cleanup = snapshot?.current?.sourceCleanup;
  if (cleanup) elements['global-alerts'].append(node('p', { className: 'notice', text: `Source retention: ${cleanup.status}. ${cleanup.errors?.map(item => item.reason).join('; ') || 'Completed-run references released; later reuse checks source availability.'}` }));
  for (const view of snapshot?.current?.temporaryViews ?? []) elements['global-alerts'].append(node('p', { className: 'notice', text: `Review view ${view.id}: ${view.status}.` }));
  clear(elements['state-rail']);
  for (const id of snapshot?.phases ?? []) {
    const button = node('button', { type: 'button', className: 'state-select', text: title(id), attributes: { 'aria-current': id === phase ? 'step' : 'false' } });
    button.addEventListener('click', () => {
      const artifact = snapshot.artifacts.find(item => item.id === phaseDocs[id] && item.exists && !item.unsafe);
      if (artifact) openArtifact?.(artifact);
    });
    elements['state-rail'].append(node('li', { className: `state-node${id === phase ? ' current' : ''}` }, [button]));
  }
  elements['phase-context-surface'].hidden = false;
  elements['phase-context-kicker'].textContent = snapshot?.featureId ?? 'Current feature';
  elements['phase-context-title'].textContent = title(phase);
  elements['phase-context-description'].textContent = snapshot?.current?.paused
    ? 'Work is explicitly paused. Diagnosis remains available; continuation needs the recorded human instruction.'
    : 'The model chooses work and check order within the authorized phase. Milestone passage requires current proof and authority.';
  clear(elements['phase-context-uses']); clear(elements['phase-context-produces']);
  const milestones = clear(elements.milestones); milestones.hidden = false;
  for (const milestone of snapshot?.milestones ?? []) {
    const card = node('details', { className: 'action-card' }, [node('summary', { text: `${title(milestone.name)} · ${milestone.historical ? (milestone.allowed ? 'Recorded' : 'Recorded; evidence unavailable') : milestone.allowed ? 'Ready' : 'Blocked'}` })]);
    const missing = node('ul');
    for (const reason of milestone.missing) missing.append(node('li', { text: reason }));
    card.append(missing); milestones.append(card);
  }
  elements['actions-surface'].hidden = false;
  elements['guidance-context'].textContent = 'Current operations · explicit execution';
  clear(elements.actions);
  for (const action of snapshot?.actions ?? []) {
    const command = action.copyCommand ?? action.command;
    const button = node('button', { type: 'button', className: 'secondary', text: 'Copy command' });
    button.addEventListener('click', () => copy?.(command, 'Command copied'));
    elements.actions.append(node('article', { className: 'action-card' }, [node('strong', { text: action.label }), node('pre', { text: command }), button]));
  }
  renderCurrentObligations(snapshot, elements, readResult);
}

export function renderCurrentObligations(snapshot, elements, readResult) {
  const list = clear(elements['module-settings-list']);
  elements['module-policy-state'].textContent = 'Required proof';
  elements['module-policy-path'].textContent = 'Execution order is chosen by the model. Optional whiteboard policy is selected when the run starts.';
  for (const id of ['module-preview-surface', 'module-apply', 'module-discard', 'module-reload', 'module-settings-alert']) elements[id].hidden = true;
  const outcomes = new Map((snapshot?.milestones ?? []).flatMap(item => item.outcomes ?? []).map(item => [item.id, item]));
  for (const gate of snapshot?.obligations ?? []) {
    const result = outcomes.get(gate.id);
    const card = node('article', { className: 'provenance-card' }, [
      node('h3', { text: gate.label }),
      node('p', { text: `${title(gate.at)} · ${gate.role} · ${result?.outcome ?? 'UNAVAILABLE'}` }),
    ]);
    if (result?.exception) card.append(node('p', { className: 'notice', text: `Accepted exception: ${result.exception.reason}. ${result.exception.consequences}` }));
    if (result?.reason) card.append(node('p', { text: result.reason }));
    if (result?.result) {
      const button = node('button', { type: 'button', text: 'Inspect evidence' });
      button.addEventListener('click', () => readResult?.(result.result.hash));
      card.append(button);
    }
    list.append(card);
  }
  list.append(node('article', { className: 'notice' }, [node('strong', { text: 'Enforcement coverage' }), node('pre', { text: JSON.stringify(snapshot?.enforcement ?? {}, null, 2) })]));
}

export function renderCurrentModel(detail, elements) {
  clear(elements['model-provenance']).append(node('p', { text: 'One current protocol. The phase diagram guides planning; milestone predicates enforce passage. Proof inputs do not impose an execution schedule.' }));
  clear(elements['model-graph']);
  for (const phase of detail.data.phases) elements['model-graph'].append(node('article', { className: 'model-state', text: title(phase) }));
  elements['model-mermaid'].textContent = detail.data.graph.mermaid;
  elements['copy-mermaid'].disabled = false;
}
