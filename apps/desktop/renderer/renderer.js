import { clear, node, renderJson, renderMarkdown } from './dom.js';
import { createWorkspaceStore, workspaceDefaults } from './workspace-state.js';
import {
  actionMeaning,
  artifactContext,
  attemptArtifact,
  attemptLabel,
  diagnosticCanShowGovernedViews,
  eventLabel,
  featureStateLabel,
  featureStates,
  formatTime,
  gateArtifact,
  globalAlert,
  humanize,
  selectedAttempt,
  selectedSlice,
  sourceLabel,
  stateArtifact,
} from './presentation.js';

const desktop = window.gatereeveDesktop;

const ids = [
  'chooser', 'choose', 'choose-empty', 'recents', 'chooser-error', 'workspace', 'refresh', 'activity',
  'candidate-diagnostic', 'candidate-diagnostic-title', 'candidate-diagnostic-message',
  'candidate-diagnostic-facts', 'candidate-diagnostic-checks', 'candidate-diagnostic-choose-another',
  'brand-version', 'project-sidebar', 'main-tabs', 'toggle-sidebar',
  'toggle-inspector', 'inspector-panel', 'inspector-resizer', 'inspector-tabs',
  'source-dialog', 'source-dialog-close', 'source-dialog-list', 'global-alerts', 'state-rail',
  'milestones', 'slices-surface', 'slices',
  'boundary-surface', 'attempt-select', 'boundary-summary', 'gate-dag',
  'closeout-surface', 'closeout-status', 'closeout-summary',
  'actions-surface', 'actions', 'guidance-context', 'artifact-count', 'artifact-list', 'artifact-viewer', 'history-count',
  'history-list', 'history-detail', 'model-provenance', 'model-graph', 'model-mermaid',
  'copy-mermaid', 'session-list', 'session-detail', 'toast',
  'notifications', 'open-setup', 'setup-shell', 'setup-summary', 'setup-prerequisites',
  'setup-agents', 'setup-recheck', 'setup-open-worktree', 'setup-return', 'save-agents',
  'agent-selection', 'agent-codex', 'agent-claude', 'desktop-version', 'historical-reading',
  'check-updates', 'update-banner', 'update-title', 'update-detail', 'open-update',
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const workspaceStore = createWorkspaceStore();

let currentState = null;
let currentUpdate = null;
let currentView = 'overview';
let selectedAttemptId = null;
let modelDetail = null;
let modelKey = null;
let modelPromise = null;
let eventsDetail = null;
let eventsKey = null;
let eventsPromise = null;
let sessionInventory = null;
let sessionPromise = null;
let selectedArtifactId = null;
let selectedArtifactFingerprint = null;
let artifactInFlightFingerprint = null;
let artifactFailedFingerprint = null;
let artifactReadSequence = 0;
let artifactHasContent = false;
let toastTimer = null;
let renderedOnce = false;
let renderedDiagnosticKey = null;
let inspectorExpanded = false;

function projectPath() {
  return currentState?.selection?.worktreePath ?? '__empty__';
}

function workspaceState() {
  return workspaceStore.get(projectPath());
}

function statusClass(value) {
  return String(value ?? 'unknown').toLowerCase().replaceAll(/[^a-z-]+/g, '-');
}

function statusPill(value) {
  return node('span', { className: `status ${statusClass(value)}`, text: humanize(value) });
}

function exactId(value) {
  return node('small', { className: 'path', text: value, title: `Exact protocol ID: ${value}` });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2_000);
  toastTimer?.unref?.();
}

function renderUpdate(update) {
  currentUpdate = update;
  elements['check-updates'].disabled = update.status === 'checking';
  elements['check-updates'].textContent = update.status === 'checking'
    ? 'Checking…'
    : 'Check for Updates';
  const available = update.status === 'available' ? update.available : null;
  elements['update-banner'].hidden = available === null;
  elements['open-update'].disabled = available === null;
  if (available !== null) {
    elements['update-title'].textContent = `GateReeve Desktop ${available.version} is available`;
    elements['update-detail'].textContent = `${available.channel === 'rc' ? 'Early Access RC' : 'Stable release'} · You have ${update.currentVersion}. GateReeve will open the exact official GitHub release; it will not download or install anything.`;
  }
}

async function copy(value, message = 'Copied to clipboard') {
  await desktop.copyText(value);
  showToast(message);
}

function sourceItem(name, source) {
  const presented = sourceLabel(name, source);
  return node('section', { className: 'source-dialog-item' }, [
    node('div', { className: 'card-header' }, [
      node('strong', { text: presented.name }),
      statusPill(presented.status),
    ]),
    node('p', { text: source?.detail ?? 'No additional detail.' }),
  ]);
}

function openSourceDialog() {
  if (!currentState?.selection) return;
  const list = clear(elements['source-dialog-list']);
  for (const name of ['local', 'git', 'github']) {
    list.append(sourceItem(name, currentState.snapshot?.sources?.[name]));
  }
  if (typeof elements['source-dialog'].showModal === 'function') {
    elements['source-dialog'].showModal();
  } else {
    elements['source-dialog'].setAttribute('open', '');
  }
}

function switchView(view) {
  const setup = view === 'setup';
  const selected = currentState?.selection !== null && currentState?.selection !== undefined;
  if (!setup && !workspaceDefaults.mainViews.includes(view)) return;
  if (!setup) {
    currentView = view;
    workspaceStore.setMainView(projectPath(), view);
  }
  elements['setup-shell'].hidden = !setup;
  elements.workspace.hidden = setup;
  elements.chooser.hidden = setup || selected;
  elements['main-tabs'].hidden = setup || !selected;
  for (const page of document.querySelectorAll('[data-page]')) {
    page.hidden = setup || !selected || page.dataset.page !== view;
  }
  for (const button of document.querySelectorAll('[data-view]')) {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (view === 'history') void ensureHistory();
  if (view === 'model') void ensureModel();
  if (view === 'session') void ensureSession();
}

function appendRemediation(container, value) {
  if (!value) return;
  container.append(node('p', { className: 'remediation-summary', text: value.summary }));
  if (value.command) {
    container.append(node('pre', { className: 'command', text: value.command }));
    const button = node('button', { className: 'secondary', text: 'Copy native command', type: 'button' });
    button.addEventListener('click', () => void copy(
      value.command,
      'Native command copied — GateReeve did not execute it',
    ));
    container.append(button);
  }
  container.append(node('p', { className: 'guidance-url path', text: value.guideUrl }));
  const guide = node('button', { className: 'text-button', text: 'Copy official guide link', type: 'button' });
  guide.addEventListener('click', () => void copy(value.guideUrl, 'Official guidance link copied'));
  container.append(guide);
}

function setupCard(title, status, detail, remediationValue = null) {
  const card = node('article', { className: 'setup-card' }, [
    node('div', { className: 'card-header' }, [
      node('h4', { text: title }),
      statusPill(status),
    ]),
    node('p', { text: detail }),
  ]);
  appendRemediation(card, remediationValue);
  return card;
}

function renderSetup(state) {
  const setup = state.setup;
  const selected = state.preferences.selectedAgents;
  const readyAgents = setup.agents.filter((agent) => agent.status === 'ready');
  const incompleteAgents = setup.agents.filter((agent) => agent.status !== 'ready');
  elements['agent-codex'].checked = selected.includes('codex');
  elements['agent-claude'].checked = selected.includes('claude');
  elements['desktop-version'].textContent = `Desktop ${setup.desktop.version}`;
  elements['setup-return'].hidden = false;
  elements['setup-recheck'].disabled = setup.phase === 'checking' || selected.length === 0;
  elements['save-agents'].disabled = setup.phase === 'checking';
  elements['historical-reading'].hidden = setup.operationalReady;

  const summary = elements['setup-summary'];
  summary.className = `notice ${setup.operationalReady ? 'success' : setup.phase === 'checking' ? 'info' : ''}`.trim();
  summary.textContent = setup.phase === 'unconfigured'
    ? 'Choose Codex, Claude Code, or both. No agent installation has been examined yet.'
    : setup.phase === 'checking'
      ? 'Checking only the selected agents and their workflow prerequisites…'
      : setup.operationalReady
        ? `Operational setup is ready through ${readyAgents.map((agent) => agent.label).join(' and ')}.${incompleteAgents.length > 0 ? ` ${incompleteAgents.map((agent) => agent.label).join(' and ')} still needs attention.` : ''}`
        : 'Operational setup is incomplete. Existing records remain available for historical or offline inspection.';

  clear(elements['setup-prerequisites']);
  if (setup.prerequisites.length === 0) {
    elements['setup-prerequisites'].append(node('p', {
      className: 'muted',
      text: selected.length === 0 ? 'Save an agent selection to check shared prerequisites.' : 'Checking prerequisites…',
    }));
  } else {
    for (const item of setup.prerequisites) {
      elements['setup-prerequisites'].append(setupCard(
        item.label,
        item.status,
        item.detail,
        item.remediation,
      ));
    }
  }

  clear(elements['setup-agents']);
  if (setup.agents.length === 0) {
    elements['setup-agents'].append(node('p', {
      className: 'muted',
      text: selected.length === 0 ? 'No agents selected.' : 'Checking selected agents…',
    }));
  }
  for (const agent of setup.agents) {
    const card = node('article', { className: 'setup-agent' }, [
      node('div', { className: 'card-header' }, [node('h3', { text: agent.label }), statusPill(agent.status)]),
      setupCard(
        `Agent${agent.cli.version ? ` ${agent.cli.version}` : ''}`,
        agent.cli.authenticated === false ? 'unauthenticated' : agent.cli.status,
        agent.cli.detail,
        agent.cli.remediation,
      ),
      setupCard(
        `GateReeve Plugin${agent.plugin.version ? ` ${agent.plugin.version}` : ''}`,
        agent.plugin.compatibility === 'not-checked' ? agent.plugin.status : agent.plugin.compatibility,
        agent.plugin.detail,
        agent.plugin.remediation,
      ),
    ]);
    if (agent.plugin.evidence) {
      card.append(node('p', { className: 'path', text: `Compatibility evidence: ${agent.plugin.evidence}` }));
    }
    if (agent.plugin.recommendation) {
      card.append(node('div', { className: 'notice info', text: agent.plugin.recommendation }));
    }
    elements['setup-agents'].append(card);
  }
}

function renderRecents(state) {
  clear(elements.recents);
  const activePath = state.selection?.worktreePath ?? null;
  const projects = state.projects ?? state.preferences.projectPaths.map((path) => ({
    path,
    name: path.split('/').filter(Boolean).at(-1) ?? path,
    status: 'ready',
    featureId: null,
    workflowState: null,
  }));
  const names = new Map();
  for (const project of projects) {
    if (!names.has(project.name)) names.set(project.name, []);
    names.get(project.name).push(project);
  }
  for (const [index, project] of projects.entries()) {
    const duplicate = names.get(project.name).length > 1;
    const parent = project.path.split('/').filter(Boolean).at(-2) ?? project.path;
    const context = [
      duplicate ? parent : null,
      project.featureId,
      project.workflowState ? featureStateLabel(project.workflowState) : null,
    ].filter(Boolean).join(' · ');
    const select = node('button', {
      className: 'project-select',
      type: 'button',
      attributes: {
        role: 'option',
        'aria-current': project.path === activePath ? 'true' : 'false',
        'aria-selected': project.path === activePath ? 'true' : 'false',
        'aria-label': `${project.name}${project.status === 'needs-attention' ? ', Needs attention' : ''}`,
      },
    }, [
      node('strong', { text: project.name }),
      node('small', { text: context || project.path }),
      ...(project.status === 'needs-attention'
        ? [node('small', { className: 'needs-attention', text: '⚠ Needs attention' })]
        : []),
    ]);
    select.addEventListener('click', async () => render(await desktop.activateProject(project.path)));
    const reorder = async (offset) => {
      const paths = projects.map((item) => item.path);
      const target = index + offset;
      if (target < 0 || target >= paths.length) return;
      [paths[index], paths[target]] = [paths[target], paths[index]];
      render(await desktop.reorderProjects(paths));
    };
    const up = node('button', { className: 'project-action', text: '↑', type: 'button', disabled: index === 0, attributes: { 'aria-label': `Move ${project.name} up` } });
    const down = node('button', { className: 'project-action', text: '↓', type: 'button', disabled: index === projects.length - 1, attributes: { 'aria-label': `Move ${project.name} down` } });
    const remove = node('button', { className: 'project-action', text: '×', type: 'button', attributes: { 'aria-label': `Remove ${project.name} from GateReeve`, title: 'Remove only GateReeve’s saved reference; the directory is never changed.' } });
    up.addEventListener('click', () => void reorder(-1));
    down.addEventListener('click', () => void reorder(1));
    remove.addEventListener('click', async () => {
      const next = await desktop.removeProject(project.path);
      workspaceStore.discard(project.path);
      render(next);
      showToast('Removed saved reference only; project files were not changed');
    });
    const row = node('div', { className: 'project-row', attributes: { draggable: 'true', 'data-project-path': project.path } }, [
      select,
      node('div', { className: 'project-actions' }, [up, down, remove]),
    ]);
    row.addEventListener('dragstart', (event) => event.dataTransfer?.setData('text/plain', project.path));
    row.addEventListener('dragover', (event) => event.preventDefault());
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const source = event.dataTransfer?.getData('text/plain');
      if (!source || source === project.path) return;
      const paths = projects.map((item) => item.path).filter((path) => path !== source);
      paths.splice(paths.indexOf(project.path), 0, source);
      void desktop.reorderProjects(paths).then(render);
    });
    elements.recents.append(row);
  }
  if (projects.length === 0) {
    elements.recents.append(node('p', { className: 'muted', text: 'No saved projects yet.' }));
  }
}

function renderCandidateDiagnostic(diagnostic) {
  const report = elements['candidate-diagnostic'];
  if (diagnostic === null || diagnostic === undefined) {
    report.hidden = true;
    document.body.classList.remove('diagnostic-only');
    renderedDiagnosticKey = null;
    return;
  }
  const diagnosticKey = [diagnostic.classification, diagnostic.selectedPath, diagnostic.message].join('\u0000');
  if (diagnosticKey !== renderedDiagnosticKey) report.open = true;
  renderedDiagnosticKey = diagnosticKey;
  elements['candidate-diagnostic-title'].textContent = diagnostic.title;
  elements['candidate-diagnostic-message'].textContent = diagnostic.message;
  clear(elements['candidate-diagnostic-facts']);
  const facts = [
    ['Classification', humanize(diagnostic.classification)],
    ['Selected directory', diagnostic.selectedPath],
    ['Feature record', diagnostic.featureHome ?? 'Not resolved'],
    ['Pinned model', diagnostic.pinnedModel ?? 'Not reported'],
    ['Supported model', diagnostic.supportedModel ?? 'Not reported'],
  ];
  for (const [label, value] of facts) {
    elements['candidate-diagnostic-facts'].append(
      node('div', {}, [node('dt', { text: label }), node('dd', { text: value })]),
    );
  }
  clear(elements['candidate-diagnostic-checks']);
  for (const check of diagnostic.failedChecks.length > 0
    ? diagnostic.failedChecks
    : ['The selected directory did not pass governed-project admission.']) {
    elements['candidate-diagnostic-checks'].append(node('li', { text: check }));
  }
  report.hidden = false;
  if (inspectorExpanded) setInspectorExpanded(false);
  document.body.classList.add('diagnostic-only');
}

function renderGlobalAlert(snapshot) {
  const alert = globalAlert(snapshot, currentState?.error);
  const container = clear(elements['global-alerts']);
  container.hidden = alert === null;
  if (alert === null) return;
  container.className = `notice ${alert.tone === 'danger' ? 'danger' : ''}`.trim();
  container.append(node('strong', { text: alert.title }));
  const list = node('ul');
  for (const item of alert.items) list.append(node('li', { text: item }));
  container.append(list);
}

function renderStateRail(snapshot) {
  clear(elements['state-rail']);
  const workspace = workspaceState();
  const currentStateId = snapshot?.projection?.feature?.state ?? null;
  const presented = featureStates(snapshot, modelDetail, workspace.selectedFeatureState);
  const stateIds = presented.map((state) => state.id);
  const previous = workspace.selectedFeatureState;
  const selectedFeatureState = stateIds.includes(previous)
    ? previous
    : currentStateId ?? stateIds[0] ?? null;
  const initialized = previous === null && selectedFeatureState !== null;
  workspaceStore.setHierarchy(projectPath(), { selectedFeatureState });
  const states = featureStates(snapshot, modelDetail, selectedFeatureState);
  if (states.length === 0) {
    elements['state-rail'].append(node('li', {
      className: 'state-node current selected',
      text: currentStateId
        ? `${humanize(currentStateId)} · Current · Selected`
        : 'Pinned model detail unavailable',
    }));
    return;
  }
  for (const state of states) {
    const button = node('button', {
      className: 'state-select',
      type: 'button',
      attributes: {
        'aria-pressed': String(state.selected),
        'aria-label': [state.label, state.current ? 'Current workflow state' : null, state.selected ? 'Selected for inspection' : null].filter(Boolean).join(', '),
      },
    }, [
      node('strong', { text: state.label }),
    ]);
    button.addEventListener('click', () => {
      workspaceStore.setHierarchy(projectPath(), { selectedFeatureState: state.id });
      renderOverview(snapshot);
      const artifact = stateArtifact(snapshot, state.id);
      if (artifact) void openArtifact(artifact);
    });
    elements['state-rail'].append(node('li', {
      className: `state-node ${state.position}${state.selected ? ' selected' : ''}`,
      attributes: { 'aria-current': state.current ? 'step' : 'false' },
    }, [button]));
  }
  if (initialized) {
    const artifact = stateArtifact(snapshot, selectedFeatureState);
    if (artifact) void openArtifact(artifact);
  }
}

function renderMilestones(snapshot) {
  const container = clear(elements.milestones);
  const selectedFeatureState = workspaceState().selectedFeatureState
    ?? snapshot?.projection?.feature?.state;
  const milestones = (snapshot?.milestones ?? []).filter(
    (item) => item.state === selectedFeatureState,
  );
  container.hidden = milestones.length === 0;
  for (const milestone of milestones) {
    const item = node('span', {
      className: 'milestone',
      text: milestone.label,
      title: `Exact milestone ID: ${milestone.id}`,
    });
    item.dataset.status = milestone.status;
    container.append(item);
  }
}

function renderSlices(snapshot) {
  clear(elements.slices);
  const slices = snapshot?.projection?.slices ?? [];
  if (slices.length === 0) {
    elements.slices.append(node('p', { className: 'muted', text: 'No delivery slices have been proposed.' }));
    return;
  }
  const workspace = workspaceState();
  const selectedSliceId = selectedSlice(snapshot, workspace.selectedSliceId);
  workspaceStore.setHierarchy(projectPath(), { selectedSliceId });
  const activeSliceId = snapshot?.projection?.activeSliceId ?? snapshot?.active?.sliceId ?? null;
  for (const slice of slices) {
    const selected = slice.id === selectedSliceId;
    const active = slice.id === activeSliceId;
    const card = node('button', {
      className: `card slice-card ordered-item status-${statusClass(slice.state)}${selected ? ' selected' : ''}`,
      type: 'button',
      attributes: {
        'aria-pressed': String(selected),
        'aria-label': [
          `Slice ${slice.deliveryOrdinal}, ${slice.name}`,
          humanize(slice.state),
          active ? 'Active delivery slice' : null,
          selected ? 'Selected for inspection' : null,
        ].filter(Boolean).join(', '),
      },
    }, [
      node('span', { className: 'order-marker', text: String(slice.deliveryOrdinal), attributes: { 'aria-hidden': 'true' } }),
      node('span', { className: 'ordered-content' }, [
        node('span', { className: 'card-header' }, [
          node('span', {}, [node('strong', { text: slice.name }), exactId(slice.id)]),
          statusPill(slice.state),
        ]),
        node('span', { className: 'slice-meta', text: [slice.branch, slice.planSteps?.join(', '), slice.scope].filter(Boolean).join(' · ') }),
      ]),
    ]);
    card.addEventListener('click', () => {
      const targetAttemptId = selectedAttempt(snapshot, slice.id, null);
      workspaceStore.setHierarchy(projectPath(), {
        selectedSliceId: slice.id,
        selectedAttemptId: targetAttemptId,
        selectedGateId: null,
      });
      selectedAttemptId = targetAttemptId;
      renderSlices(snapshot);
      renderBoundary(snapshot);
      const artifact = attemptArtifact(snapshot, targetAttemptId);
      if (artifact) void openArtifact(artifact);
      elements['boundary-surface'].scrollIntoView?.({ block: 'nearest' });
    });
    elements.slices.append(card);
  }
}

function blockerText(blocker) {
  return blocker.message ?? blocker.reason ?? blocker.type ?? 'Unknown blocker';
}

function gateStatusPill(value) {
  const pill = statusPill(value);
  if (value === 'NOT_APPLICABLE') {
    pill.textContent = 'N/A';
    pill.title = 'Not applicable';
    pill.setAttribute('aria-label', 'Not applicable');
  }
  return pill;
}

function gateConnector(fromCount, toCount) {
  const kind = toCount > 1 ? 'fan-out' : fromCount > 1 ? 'fan-in' : 'simple';
  const branchCount = Math.max(fromCount, toCount);
  const connector = node('div', {
    className: `gate-connector gate-connector-${kind}`,
    attributes: { 'aria-hidden': 'true' },
  });
  connector.style.setProperty('--branch-count', String(branchCount));
  connector.append(node('span', { className: 'connector-trunk' }));
  if (kind !== 'simple') {
    connector.append(node('span', { className: 'connector-bar' }));
    for (let index = 0; index < branchCount; index += 1) {
      const stem = node('span', { className: 'connector-stem' });
      stem.style.setProperty('--stem-index', String(index));
      connector.append(stem);
    }
  }
  return connector;
}

function gateCard(attempt, gate, selected) {
  const displayedStatus = gate.outcome === 'UNSET' ? gate.freshness : gate.outcome;
  const button = node('button', {
    className: `gate-card ordered-item status-${statusClass(displayedStatus)}${selected ? ' selected' : ''}`,
    type: 'button',
    attributes: {
      'aria-pressed': String(selected),
      'aria-label': `Gate ${gate.orderLabel}, ${humanize(gate.id)}, ${humanize(displayedStatus)}${selected ? ', Selected for inspection' : ''}`,
    },
  }, [
    node('span', { className: 'order-marker', text: gate.orderLabel, attributes: { 'aria-hidden': 'true' } }),
    node('span', { className: 'ordered-content' }, [
      node('span', { className: 'card-header' }, [
        node('strong', { text: humanize(gate.id), title: `Exact gate ID: ${gate.id}` }),
        gateStatusPill(displayedStatus),
      ]),
      ...(gate.reason ? [node('span', { className: 'object-condition', text: gate.reason })] : []),
      ...((gate.blockers ?? []).map((blocker) => node('span', {
        className: 'object-condition',
        text: blockerText(blocker),
      }))),
    ]),
  ]);
  button.addEventListener('click', () => renderGateDetail(attempt, gate));
  return button;
}

function renderGateDetail(attempt, gate) {
  workspaceStore.setHierarchy(projectPath(), { selectedGateId: gate.id });
  renderBoundary(currentState?.snapshot);
  const artifact = gateArtifact(currentState?.snapshot, attempt.id, gate.id);
  if (artifact) void openArtifact(artifact);
  else {
    workspaceStore.openGate(projectPath(), attempt.id, gate);
    renderInspector(currentState?.snapshot);
  }
}

function renderBoundary(snapshot) {
  const sliceId = workspaceState().selectedSliceId;
  const attempts = (snapshot?.projection?.boundaryAttempts ?? []).filter(
    (attempt) => attempt.sliceId === sliceId,
  );
  const select = elements['attempt-select'];
  const previous = workspaceState().selectedAttemptId ?? selectedAttemptId;
  clear(select);
  if (attempts.length === 0) {
    select.disabled = true;
    workspaceStore.setHierarchy(projectPath(), { selectedAttemptId: null, selectedGateId: null });
    clear(elements['boundary-summary']).append(node('p', { text: 'No PR boundary has started for the selected slice.' }));
    clear(elements['gate-dag']);
    return;
  }
  select.disabled = false;
  for (const attempt of [...attempts].reverse()) {
    const option = node('option', { text: attemptLabel(attempt) });
    option.value = attempt.id;
    select.append(option);
  }
  selectedAttemptId = selectedAttempt(snapshot, sliceId, previous);
  const attempt = attempts.find((item) => item.id === selectedAttemptId) ?? attempts.at(-1);
  const previousGateId = workspaceState().selectedGateId;
  const selectedGateId = attempt.gates.some((gate) => gate.id === previousGateId)
    ? previousGateId
    : null;
  const initialized = previous === null;
  workspaceStore.setHierarchy(projectPath(), { selectedAttemptId, selectedGateId });
  for (const option of select.querySelectorAll('option')) {
    if (option.value === selectedAttemptId) option.setAttribute('selected', '');
    else option.removeAttribute('selected');
  }
  clear(elements['boundary-summary']).append(
    statusPill(attempt.state),
    document.createTextNode(` ${attempt.scope} boundary for ${attempt.sliceId}`),
    exactId(attempt.id),
  );
  const inspect = node('button', { className: 'text-button', text: 'Load exact attempt detail', type: 'button' });
  inspect.addEventListener('click', async () => {
    inspect.disabled = true;
    try {
      const detail = await desktop.readDetail('attempt', attempt.id);
      const disclosure = node('details', { className: 'raw' }, [
        node('summary', { text: 'Exact attempt JSON' }),
        node('pre', { text: JSON.stringify(detail.data.attempt, null, 2) }),
      ]);
      elements['boundary-summary'].append(disclosure);
    } catch (error) {
      elements['boundary-summary'].append(node('div', { className: 'notice danger', text: error.message ?? String(error) }));
    } finally {
      inspect.disabled = false;
    }
  });
  elements['boundary-summary'].append(inspect);
  const graph = clear(elements['gate-dag']);
  const stages = [];
  for (const gate of attempt.gates) {
    const stageNumber = Number.parseInt(gate.orderLabel, 10);
    let stage = stages.find((candidate) => candidate.number === stageNumber);
    if (!stage) {
      stage = { number: stageNumber, gates: [] };
      stages.push(stage);
    }
    stage.gates.push(gate);
  }
  stages.forEach((stage, index) => {
    if (index > 0) graph.append(gateConnector(stages[index - 1].gates.length, stage.gates.length));
    const wrapper = node('div', {
      className: `gate-stage${stage.gates.length > 1 ? ' gate-stage-branch' : ''}`,
      attributes: { 'aria-label': `Gate dependency stage ${stage.number}` },
    });
    wrapper.style.setProperty('--stage-columns', String(stage.gates.length));
    for (const gate of stage.gates) {
      wrapper.append(gateCard(attempt, gate, gate.id === selectedGateId));
    }
    graph.append(wrapper);
  });
  if (initialized) {
    const artifact = attemptArtifact(snapshot, selectedAttemptId);
    if (artifact) void openArtifact(artifact);
  }
}

function renderCloseout(snapshot) {
  const blockers = snapshot?.blockers ?? [];
  const blockedActions = (snapshot?.actions ?? []).filter((action) => action.readiness === 'blocked');
  const activeSliceId = snapshot?.projection?.activeSliceId ?? null;
  const blocked = blockers.length > 0 || blockedActions.length > 0;
  const readiness = blocked ? 'blocked' : activeSliceId ? 'active' : 'ready';
  elements['closeout-status'].className = `status ${readiness}`;
  elements['closeout-status'].textContent = readiness === 'active' ? 'In progress' : humanize(readiness);
  const summary = clear(elements['closeout-summary']);
  summary.append(node('article', { className: 'card' }, [
    node('strong', {
      text: blocked
        ? 'Completion has outstanding conditions'
        : activeSliceId ? 'Completion remains in progress' : 'Completion readiness is clear',
    }),
    node('p', {
      text: blocked
        ? `${blockers.length + blockedActions.length} projected condition${blockers.length + blockedActions.length === 1 ? '' : 's'} remain.`
        : activeSliceId
          ? `The active delivery slice ${activeSliceId} must finish before closeout is ready.`
          : 'No projected workflow blocker currently prevents closeout review.',
    }),
  ]));
  const conditions = [
    ...blockers.map((item) => blockerText(item)),
    ...blockedActions.flatMap((action) => action.reasons?.length ? action.reasons : [humanize(action.command)]),
  ];
  if (conditions.length > 0) {
    const list = node('ul');
    for (const condition of conditions) list.append(node('li', { text: condition }));
    summary.append(node('article', { className: 'card' }, [node('strong', { text: 'Outstanding closeout conditions' }), list]));
  }
  summary.append(node('article', { className: 'card' }, [
    node('strong', { text: 'Additional delivery slice' }),
    node('p', { text: activeSliceId
      ? `Required work remains active in ${activeSliceId}.`
      : readiness === 'ready'
        ? 'No additional delivery slice is indicated by the current projection.'
        : 'Another delivery slice may be required to clear the outstanding conditions.' }),
  ]));
}

function renderActions(snapshot) {
  clear(elements.actions);
  const actions = snapshot?.actions ?? [];
  elements['actions-surface'].hidden = actions.length === 0;
  elements['guidance-context'].textContent = snapshot?.projection?.feature?.state
    ? `Current: ${featureStateLabel(snapshot.projection.feature.state)}`
    : 'Current governed state unavailable';
  if (actions.length === 0) {
    return;
  }
  for (const action of actions) {
    const card = node('details', { className: 'action-card' });
    card.append(
      node('summary', { className: 'action-summary' }, [
        node('span', {}, [node('strong', { text: humanize(action.command) }), exactId(action.id)]),
        statusPill(action.readiness),
      ]),
      node('div', { className: 'action-detail' }, [
        node('p', { text: actionMeaning(action.command) }),
        node('div', { className: 'action-meta' }, [
          statusPill(action.authority),
          node('span', { className: 'status', text: `${action.inputs.length} input${action.inputs.length === 1 ? '' : 's'}` }),
        ]),
      ]),
    );
    if (action.reasons?.length) {
      const list = node('ul', { className: 'action-reasons' });
      for (const reason of action.reasons) list.append(node('li', { text: reason }));
      card.querySelector('.action-detail').append(node('strong', { text: 'Conditions' }), list);
    }
    if (action.inputs.length > 0) {
      const list = node('ul', { className: 'action-inputs' });
      for (const input of action.inputs) list.append(node('li', {
        text: typeof input === 'string' ? input : input.label ?? input.id ?? JSON.stringify(input),
      }));
      card.querySelector('.action-detail').append(node('strong', { text: 'Required inputs' }), list);
    }
    card.querySelector('.action-detail').append(node('pre', { className: 'command', text: action.copyCommand }));
    const button = node('button', { className: 'secondary', text: 'Copy command', type: 'button' });
    button.addEventListener('click', () => void copy(action.copyCommand, 'Command copied — GateReeve Desktop did not execute it'));
    card.querySelector('.action-detail').append(button);
    elements.actions.append(card);
  }
}

function renderOverview(snapshot) {
  renderGlobalAlert(snapshot);
  renderStateRail(snapshot);
  renderMilestones(snapshot);
  const selectedFeatureState = workspaceState().selectedFeatureState;
  const delivering = selectedFeatureState === 'DELIVERING_SLICES';
  const finalizing = selectedFeatureState === 'FINALIZING';
  elements['slices-surface'].hidden = !delivering;
  elements['boundary-surface'].hidden = !delivering;
  elements['closeout-surface'].hidden = !finalizing;
  if (delivering) {
    renderSlices(snapshot);
    renderBoundary(snapshot);
  } else {
    clear(elements.slices);
    clear(elements['gate-dag']);
  }
  if (finalizing) renderCloseout(snapshot);
  renderActions(snapshot);
}

function artifactButton(artifact) {
  const button = node('button', {
    className: 'collection-item',
    type: 'button',
    disabled: artifact.unsafe === true,
  }, [
    node('div', { className: 'card-header' }, [
      node('strong', { text: artifact.label }),
      statusPill(artifact.status),
    ]),
    node('small', { text: artifact.path ?? artifactContext(artifact) }),
    exactId(artifact.id),
  ]);
  button.dataset.artifactId = artifact.id;
  const activeTab = workspaceState().tabs.find((tab) => tab.id === workspaceState().activeTabId);
  button.classList.toggle('selected', activeTab?.kind === 'artifact' && (
    activeTab.path === artifact.path || activeTab.artifactId === artifact.id
  ));
  button.addEventListener('click', () => void openArtifact(artifact));
  return button;
}

function artifactFingerprint(artifact) {
  return `${artifact.modifiedAt ?? 'unknown'}\0${artifact.size ?? 'unknown'}`;
}

function resetArtifactSelection(message = 'Select an artifact') {
  artifactReadSequence += 1;
  selectedArtifactId = null;
  selectedArtifactFingerprint = null;
  artifactInFlightFingerprint = null;
  artifactFailedFingerprint = null;
  artifactHasContent = false;
  clear(elements['artifact-viewer']).append(node('div', { className: 'empty-state' }, [
    node('h3', { text: message }),
    node('p', {
      text: message === 'Select an artifact'
        ? 'Content is loaded only when requested.'
        : 'Choose another artifact from the canonical inventory.',
    }),
  ]));
}

function renderArtifacts(snapshot) {
  const artifacts = snapshot?.artifacts ?? [];
  elements['artifact-count'].textContent = `${artifacts.length} expected`;
  clear(elements['artifact-list']);
  if (artifacts.length === 0) {
    elements['artifact-list'].append(node('p', { className: 'muted', text: 'No artifact inventory is available in this mode.' }));
    return;
  }
  for (const artifact of artifacts) elements['artifact-list'].append(artifactButton(artifact));
}

function applyLayout() {
  const workspace = workspaceState();
  elements.workspace.classList.toggle('sidebar-hidden', !workspace.sidebarVisible);
  elements['project-sidebar'].hidden = !workspace.sidebarVisible;
  elements['inspector-panel'].hidden = !workspace.inspectorVisible;
  elements.workspace.style.setProperty(
    '--inspector-width',
    workspace.inspectorVisible ? `${workspace.inspectorWidth}px` : '0px',
  );
  elements['toggle-sidebar'].setAttribute('aria-pressed', String(workspace.sidebarVisible));
  elements['toggle-sidebar'].setAttribute('aria-label', `${workspace.sidebarVisible ? 'Hide' : 'Show'} project sidebar`);
  elements['toggle-inspector'].setAttribute('aria-pressed', String(workspace.inspectorVisible));
  elements['toggle-inspector'].setAttribute('aria-label', `${workspace.inspectorVisible ? 'Hide' : 'Show'} inspector`);
  elements['inspector-resizer'].setAttribute('aria-valuenow', String(workspace.inspectorWidth));
  elements['inspector-resizer'].setAttribute('aria-valuemin', String(workspaceDefaults.minInspectorWidth));
  elements['inspector-resizer'].setAttribute('aria-valuemax', String(workspaceDefaults.maxInspectorWidth));
}

function renderInspectorTabs() {
  const workspace = workspaceState();
  clear(elements['inspector-tabs']);
  for (const tab of workspace.tabs) {
    const active = tab.id === workspace.activeTabId;
    const activate = node('button', {
      className: 'inspector-tab',
      text: tab.label,
      type: 'button',
      title: tab.path ?? `${tab.attemptId ?? ''} ${tab.gateId ?? ''}`.trim(),
      attributes: {
        role: 'tab',
        'aria-selected': String(active),
        tabindex: active ? '0' : '-1',
      },
    });
    activate.addEventListener('click', () => {
      workspaceStore.activateTab(projectPath(), tab.id);
      selectedArtifactFingerprint = null;
      artifactFailedFingerprint = null;
      renderInspector(currentState?.snapshot);
    });
    const close = node('button', {
      className: 'close-tab',
      text: '×',
      type: 'button',
      attributes: { 'aria-label': `Close ${tab.label}` },
    });
    close.addEventListener('click', () => {
      const wasActive = workspace.activeTabId === tab.id;
      workspaceStore.closeTab(projectPath(), tab.id);
      if (wasActive) {
        artifactReadSequence += 1;
        selectedArtifactId = null;
        selectedArtifactFingerprint = null;
        artifactFailedFingerprint = null;
        artifactHasContent = false;
      }
      renderInspector(currentState?.snapshot);
      document.querySelector('[role="tab"][aria-selected="true"]')?.focus?.();
    });
    elements['inspector-tabs'].append(node('div', {
      className: `inspector-tab-wrap${active ? ' active' : ''}`,
    }, [activate, close]));
  }
}

function renderUnavailableTab(tab) {
  artifactReadSequence += 1;
  selectedArtifactId = null;
  artifactHasContent = false;
  clear(elements['artifact-viewer']).append(
    node('div', { className: 'viewer-toolbar' }, [
      node('div', {}, [node('h3', { text: tab.label }), node('p', { className: 'path', text: tab.path ?? tab.id })]),
      statusPill(tab.status ?? 'unavailable'),
    ]),
    node('div', { className: 'notice unavailable-detail', text: 'This expected artifact is unavailable in the current canonical snapshot. GateReeve will not show stale content.' }),
  );
}

function renderGateTab(tab, snapshot) {
  artifactReadSequence += 1;
  selectedArtifactId = null;
  artifactHasContent = false;
  const attempt = snapshot?.projection?.boundaryAttempts?.find((item) => item.id === tab.attemptId);
  const gate = attempt?.gates?.find((item) => item.id === tab.gateId);
  if (!attempt || !gate) {
    renderUnavailableTab({ ...tab, status: 'unavailable' });
    return;
  }
  const viewer = clear(elements['artifact-viewer']);
  viewer.append(node('div', { className: 'viewer-toolbar' }, [
    node('p', { className: 'path', text: `${attempt.id} · ${gate.id}` }),
    gateStatusPill(gate.outcome),
  ]));
  const facts = node('dl', { className: 'facts' }, [
    node('div', {}, [node('dt', { text: 'Outcome' }), node('dd', { text: humanize(gate.outcome) })]),
    node('div', {}, [node('dt', { text: 'Freshness' }), node('dd', { text: humanize(gate.freshness) })]),
    node('div', {}, [node('dt', { text: 'Dependencies' }), node('dd', { text: gate.dependsOn?.length ? gate.dependsOn.join(', ') : 'Entry gate' })]),
    node('div', {}, [node('dt', { text: 'Recorded event' }), node('dd', { className: 'path', text: gate.recordedEventId ?? 'None' })]),
  ]);
  viewer.append(facts);
  if (gate.reason) viewer.append(node('p', { text: gate.reason }));
  if (gate.blockers?.length) {
    const list = node('ul');
    for (const blocker of gate.blockers) list.append(node('li', { text: blockerText(blocker) }));
    viewer.append(node('h3', { text: 'Blockers' }), list);
  }
}

function renderInspector(snapshot) {
  const workspace = workspaceStore.reconcile(projectPath(), snapshot?.artifacts ?? []);
  applyLayout();
  renderArtifacts(snapshot);
  const tab = workspace.tabs.find((item) => item.id === workspace.activeTabId) ?? null;
  if (tab === null) {
    resetArtifactSelection('No open tabs');
    return;
  }
  if (tab.kind === 'gate') {
    renderGateTab(tab, snapshot);
    return;
  }
  if (!tab.available) {
    renderUnavailableTab(tab);
    return;
  }
  const artifact = snapshot?.artifacts?.find((item) => (
    (tab.path !== null && item.path === tab.path) || item.id === tab.artifactId
  ));
  if (!artifact?.exists || artifact.unsafe) {
    renderUnavailableTab({ ...tab, status: 'unavailable' });
    return;
  }
  selectedArtifactId = artifact.id;
  const fingerprint = artifactFingerprint(artifact);
  if (
    fingerprint !== selectedArtifactFingerprint
    && fingerprint !== artifactInFlightFingerprint
    && fingerprint !== artifactFailedFingerprint
  ) {
    void readArtifact(artifact, { preserveContent: artifactHasContent });
  }
}

function toggleSidebar(force = undefined) {
  const activeInside = elements['project-sidebar'].contains(document.activeElement);
  const workspace = workspaceStore.toggleSidebar(projectPath(), force);
  applyLayout();
  if (!workspace.sidebarVisible && activeInside) elements['toggle-sidebar'].focus();
  if (workspace.sidebarVisible) {
    const target = elements.recents.querySelector('[aria-current="true"]') ?? elements.choose;
    target.focus({ preventScroll: true });
  }
}

function toggleInspector(force = undefined) {
  const activeInside = elements['inspector-panel'].contains(document.activeElement);
  const workspace = workspaceStore.toggleInspector(projectPath(), force);
  if (!workspace.inspectorVisible && inspectorExpanded) setInspectorExpanded(false);
  applyLayout();
  if (!workspace.inspectorVisible && activeInside) elements['toggle-inspector'].focus();
  if (workspace.inspectorVisible) {
    renderInspector(currentState?.snapshot);
    elements['artifact-viewer'].focus?.({ preventScroll: true });
  }
}

function selectCollection(selector, value, dataKey) {
  for (const item of document.querySelectorAll(selector)) {
    item.classList.toggle('selected', item.dataset[dataKey] === value);
  }
}

function captureArtifactScroll() {
  const viewer = elements['artifact-viewer'];
  const scrollTop = Number(viewer.scrollTop) || 0;
  const scrollHeight = Number(viewer.scrollHeight) || 0;
  const clientHeight = Number(viewer.clientHeight) || 0;
  const maximum = Math.max(0, scrollHeight - clientHeight);
  return { scrollTop, nearBottom: maximum - scrollTop <= 48 };
}

function restoreArtifactScroll(position) {
  if (position === null) return;
  const viewer = elements['artifact-viewer'];
  const maximum = Math.max(
    0,
    (Number(viewer.scrollHeight) || 0) - (Number(viewer.clientHeight) || 0),
  );
  viewer.scrollTop = position.nearBottom
    ? maximum
    : Math.min(position.scrollTop, maximum);
}

function iconMarkup(name) {
  const icons = {
    rendered: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.6"></circle>',
    source: '<path d="m8 9-3 3 3 3"></path><path d="m16 9 3 3-3 3"></path><path d="m14 6-4 12"></path>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>',
    expand: '<path d="M8 3H3v5"></path><path d="m3 3 6 6"></path><path d="M16 3h5v5"></path><path d="m21 3-6 6"></path><path d="M8 21H3v-5"></path><path d="m3 21 6-6"></path><path d="M16 21h5v-5"></path><path d="m21 21-6-6"></path>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

function iconButton(name, label) {
  const button = node('button', {
    className: 'secondary viewer-icon',
    type: 'button',
    title: label,
    attributes: { 'aria-label': label },
  });
  button.innerHTML = iconMarkup(name);
  return button;
}

function setInspectorExpanded(expanded) {
  inspectorExpanded = expanded;
  document.body.classList.toggle('inspector-expanded', expanded);
  const button = elements['artifact-viewer'].querySelector('[data-expand-inspector]');
  if (!button) return;
  button.setAttribute('aria-pressed', String(expanded));
  button.setAttribute('aria-label', expanded ? 'Restore artifact viewer' : 'Expand artifact viewer');
  button.title = expanded ? 'Restore artifact viewer (Escape)' : 'Expand artifact viewer';
}

function artifactActions(artifact, capabilities = {
  editors: [],
  preferredEditorId: null,
  githubAvailable: false,
}, detail = null) {
  const actions = node('div', { className: 'viewer-actions' });
  const copyContent = iconButton('copy', 'Copy artifact contents');
  copyContent.disabled = detail === null;
  copyContent.addEventListener('click', () => {
    const value = detail?.data?.content
      ?? (detail?.data?.structured === undefined ? '' : JSON.stringify(detail.data.structured, null, 2));
    void copy(value, 'Artifact contents copied');
  });
  const preferred = capabilities.editors.find(
    (editor) => editor.id === capabilities.preferredEditorId,
  );
  const openLabel = preferred ? `Open in ${preferred.label}` : 'Open in default application';
  const runAction = async (operation, successMessage = null) => {
    try {
      const completed = await operation();
      if (completed !== false && successMessage) showToast(successMessage);
      return completed;
    } catch (error) {
      showToast(error.message ?? String(error));
      return false;
    }
  };
  const open = node('button', {
    className: 'secondary', text: 'Open', type: 'button', title: openLabel,
    attributes: { 'aria-label': openLabel },
  });
  open.addEventListener('click', () => void runAction(
    () => desktop.openArtifact(artifact.id),
  ));
  const reveal = node('button', { className: 'secondary', text: 'Reveal in Finder', type: 'button' });
  reveal.addEventListener('click', () => void runAction(
    () => desktop.revealArtifact(artifact.id),
  ));
  const copyPath = node('button', { className: 'secondary', text: 'Copy path', type: 'button' });
  copyPath.addEventListener('click', () => void copy(artifact.absolutePath ?? artifact.path, 'Artifact path copied'));
  const menuItems = node('div', { className: 'open-menu-items' });
  const group = (label, buttons) => {
    if (buttons.length === 0) return;
    const headingId = `artifact-menu-${label.toLowerCase().replaceAll(' ', '-')}`;
    menuItems.append(node('div', {
      className: 'open-menu-group',
      attributes: { role: 'group', 'aria-labelledby': headingId },
    }, [
      node('p', { className: 'open-menu-heading', text: label, attributes: { id: headingId } }),
      ...buttons,
    ]));
  };
  const editorButtons = capabilities.editors.map((editor) => {
    const selected = editor.id === capabilities.preferredEditorId;
    const button = node('button', {
      className: 'secondary',
      text: `${selected ? '✓ ' : ''}${editor.label}`,
      type: 'button',
      title: `Open in ${editor.label} and use it for Open`,
    });
    button.addEventListener('click', () => void (async () => {
      if (await runAction(() => desktop.openArtifact(artifact.id, editor.id, true))) {
        applyPreferredEditor(editor.id);
      }
    })());
    return button;
  });
  const defaultApp = node('button', {
    className: 'secondary',
    text: `${capabilities.preferredEditorId === null ? '✓ ' : ''}Default application`,
    type: 'button',
    title: 'Open in the default application and use it for Open',
  });
  const applyPreferredEditor = (editorId) => {
    const selectedEditor = capabilities.editors.find((editor) => editor.id === editorId);
    const label = selectedEditor ? `Open in ${selectedEditor.label}` : 'Open in default application';
    open.title = label;
    open.setAttribute('aria-label', label);
    editorButtons.forEach((button, index) => {
      const editor = capabilities.editors[index];
      button.textContent = `${editor.id === editorId ? '✓ ' : ''}${editor.label}`;
    });
    defaultApp.textContent = `${editorId === null ? '✓ ' : ''}Default application`;
  };
  defaultApp.addEventListener('click', () => void (async () => {
    if (await runAction(() => desktop.openArtifact(artifact.id, 'default', true))) {
      applyPreferredEditor(null);
    }
  })());
  const chooseApplication = node('button', { className: 'secondary', text: 'Choose Application…', type: 'button' });
  chooseApplication.addEventListener('click', () => void runAction(
    () => desktop.chooseArtifactApplication(artifact.id),
  ));
  group('Open with', [...editorButtons, defaultApp, chooseApplication]);
  reveal.textContent = 'Show in Finder';
  const locationButtons = [reveal];
  if (capabilities.githubAvailable) {
    const github = node('button', { className: 'secondary', text: 'Open on GitHub', type: 'button' });
    github.addEventListener('click', () => void runAction(
      () => desktop.openArtifactGithub(artifact.id),
    ));
    locationButtons.push(github);
  }
  group('File location', locationButtons);
  const saveAs = node('button', { className: 'secondary', text: 'Save As…', type: 'button' });
  saveAs.addEventListener('click', () => void runAction(
    () => desktop.saveArtifactAs(artifact.id),
    'Artifact copy saved',
  ));
  const saveDownloads = node('button', { className: 'secondary', text: 'Save to Downloads', type: 'button' });
  saveDownloads.addEventListener('click', () => void runAction(
    () => desktop.saveArtifactDownloads(artifact.id),
    'Artifact saved to Downloads',
  ));
  group('Save a copy', [saveAs, saveDownloads]);
  group('Utilities', [copyPath]);
  const menu = node('details', { className: 'open-menu' }, [
    node('summary', { text: '⌄', title: 'More file actions', attributes: { 'aria-label': 'More file actions' } }),
    menuItems,
  ]);
  for (const button of menuItems.querySelectorAll('button')) {
    button.addEventListener('click', () => { menu.open = false; });
  }
  const split = node('div', { className: 'open-split' }, [open, menu]);
  const expand = iconButton('expand', inspectorExpanded ? 'Restore artifact viewer' : 'Expand artifact viewer');
  expand.dataset.expandInspector = '';
  expand.setAttribute('aria-pressed', String(inspectorExpanded));
  expand.addEventListener('click', () => setInspectorExpanded(!inspectorExpanded));
  actions.append(copyContent, split, expand);
  return actions;
}

function normalizeArtifactPath(currentPath, targetPath) {
  if (
    targetPath === ''
    || targetPath.startsWith('/')
    || targetPath.includes('\\')
    || targetPath.includes('?')
  ) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(targetPath);
  } catch {
    return null;
  }
  if (decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('?')) return null;
  const segments = String(currentPath).split('/').slice(0, -1);
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

function resolveMarkdownLink(currentArtifact, rawTarget) {
  const target = String(rawTarget).trim();
  if (target === '') return null;
  if (/^https?:/iu.test(target)) {
    try {
      const url = new URL(target);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      return { kind: 'external', url: url.href };
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(target) || target.startsWith('//')) return null;
  if (target.startsWith('#')) {
    try {
      return { kind: 'fragment', fragment: decodeURIComponent(target.slice(1)) };
    } catch {
      return null;
    }
  }
  const hash = target.indexOf('#');
  const pathTarget = hash === -1 ? target : target.slice(0, hash);
  let fragment = null;
  if (hash !== -1) {
    try {
      fragment = decodeURIComponent(target.slice(hash + 1));
    } catch {
      return null;
    }
  }
  const resolvedPath = normalizeArtifactPath(currentArtifact.path, pathTarget);
  if (resolvedPath === null) return null;
  const artifact = currentState?.snapshot?.artifacts?.find(
    (candidate) => candidate.path === resolvedPath && candidate.exists && !candidate.unsafe,
  );
  if (!artifact) return null;
  return { kind: 'artifact', artifactId: artifact.id, fragment };
}

function scrollToArtifactFragment(fragment) {
  if (!fragment) return;
  const target = [...elements['artifact-viewer'].querySelectorAll('[id]')]
    .find((candidate) => candidate.id === fragment);
  target?.scrollIntoView?.();
}

async function activateMarkdownLink(link) {
  try {
    if (link.kind === 'external') {
      await desktop.openExternalLink(link.url);
      return;
    }
    if (link.kind === 'fragment') {
      scrollToArtifactFragment(link.fragment);
      return;
    }
    if (link.kind === 'artifact') {
      const artifact = currentState?.snapshot?.artifacts?.find(
        (candidate) => candidate.id === link.artifactId && candidate.exists && !candidate.unsafe,
      );
      if (!artifact) return;
      await openArtifact(artifact);
      scrollToArtifactFragment(link.fragment);
    }
  } catch (error) {
    showToast(error.message ?? String(error));
  }
}

function renderArtifactDetail(detail, capabilities, requestSequence, position) {
  const viewer = clear(elements['artifact-viewer']);
  const current = detail.data.artifact;
  const filename = current.path?.split('/').filter(Boolean).at(-1) ?? current.label;
  const type = filename.includes('.') ? filename.split('.').at(-1).toUpperCase() : current.format.toUpperCase();
  const identity = node('div', { className: 'artifact-identity' }, [
    node('p', { className: 'path', text: filename, title: current.absolutePath ?? current.path }),
    node('span', { className: 'artifact-type', text: type }),
  ]);
  const actions = artifactActions(current, capabilities, detail);
  const content = node('div');
  const renderContent = (mode = 'rendered') => {
    if (current.format === 'markdown' && mode === 'source') {
      clear(content).append(node('pre', { className: 'artifact-source', text: detail.data.content }));
    } else if (current.format === 'markdown') {
      renderMarkdown(content, detail.data.content, {
        resolveLink: (target) => resolveMarkdownLink(current, target),
        activateLink: (link) => void activateMarkdownLink(link),
      });
    } else if (current.format === 'json' || current.format === 'jsonl') {
      renderJson(content, detail.data.structured);
    } else if (current.format === 'html') {
      clear(content).append(node('iframe', {
        title: `${current.label} interactive explanation`,
        attributes: {
          src: `gatereeve-artifact://desktop/${encodeURIComponent(current.id)}?refresh=${requestSequence}`,
        },
      }));
    } else {
      clear(content).append(node('pre', { text: detail.data.content }));
    }
  };
  if (current.format === 'markdown') {
    const modes = node('div', { className: 'view-modes' });
    const rendered = iconButton('rendered', 'Show rendered Markdown');
    const source = iconButton('source', 'Show Markdown source');
    rendered.setAttribute('aria-pressed', 'true');
    source.setAttribute('aria-pressed', 'false');
    const selectMode = (mode) => {
      renderContent(mode);
      rendered.setAttribute('aria-pressed', String(mode === 'rendered'));
      source.setAttribute('aria-pressed', String(mode === 'source'));
    };
    rendered.addEventListener('click', () => selectMode('rendered'));
    source.addEventListener('click', () => selectMode('source'));
    modes.append(rendered, source);
    actions.prepend(modes);
  }
  const toolbar = node('div', { className: 'viewer-toolbar' }, [
    identity,
    actions,
  ]);
  viewer.append(toolbar, content);
  renderContent();
  artifactHasContent = true;
  restoreArtifactScroll(position);
}

function showArtifactRefreshFailure(artifact, error) {
  const viewer = elements['artifact-viewer'];
  viewer.querySelector('.artifact-refresh-warning')?.remove();
  if (!artifactHasContent) {
    const toolbar = node('div', { className: 'viewer-toolbar' }, [
      node('div', {}, [
        node('p', { className: 'path', text: artifact.path?.split('/').at(-1) ?? artifact.label }),
      ]),
      artifactActions(artifact),
    ]);
    clear(viewer).append(toolbar);
  }
  const warning = node('div', {
    className: 'notice danger artifact-refresh-warning',
    text: `Refresh failed. Showing the last successfully loaded content when available. ${error.message ?? String(error)}`,
  });
  const toolbar = viewer.querySelector('.viewer-toolbar');
  viewer.insertBefore(warning, toolbar?.nextSibling ?? viewer.firstChild);
}

async function readArtifact(artifact, { preserveContent = false, force = false } = {}) {
  selectedArtifactId = artifact.id;
  const fingerprint = artifactFingerprint(artifact);
  artifactInFlightFingerprint = fingerprint;
  if (force) artifactFailedFingerprint = null;
  selectCollection('[data-artifact-id]', artifact.id, 'artifactId');
  const position = preserveContent ? captureArtifactScroll() : null;
  const requestSequence = ++artifactReadSequence;
  if (!preserveContent) {
    artifactHasContent = false;
    clear(elements['artifact-viewer']).append(node('div', { className: 'empty-state' }, [
      node('h3', { text: 'Loading artifact…' }),
    ]));
  }
  try {
    const [detail, capabilities] = await Promise.all([
      desktop.readDetail('artifact', artifact.id),
      desktop.getArtifactActions(artifact.id),
    ]);
    if (requestSequence !== artifactReadSequence || selectedArtifactId !== artifact.id) return;
    renderArtifactDetail(detail, capabilities, requestSequence, position);
    selectedArtifactFingerprint = fingerprint;
    artifactFailedFingerprint = null;
  } catch (error) {
    if (requestSequence !== artifactReadSequence || selectedArtifactId !== artifact.id) return;
    artifactFailedFingerprint = fingerprint;
    showArtifactRefreshFailure(artifact, error);
    restoreArtifactScroll(position);
  } finally {
    if (requestSequence === artifactReadSequence) artifactInFlightFingerprint = null;
  }
}

async function openArtifact(artifact) {
  artifactReadSequence += 1;
  workspaceStore.openArtifact(projectPath(), artifact);
  selectedArtifactFingerprint = null;
  artifactInFlightFingerprint = null;
  artifactFailedFingerprint = null;
  artifactHasContent = false;
  renderInspector(currentState?.snapshot);
}

function renderHistoryList(events) {
  clear(elements['history-list']);
  elements['history-count'].textContent = `${events.length} events`;
  for (const event of [...events].reverse()) {
    const button = node('button', {
      className: 'collection-item',
      type: 'button',
    }, [
      node('div', { className: 'card-header' }, [
        node('strong', { text: `#${event.sequence} · ${eventLabel(event)}` }),
        statusPill(event.actor.kind),
      ]),
      node('small', { text: `${formatTime(event.recordedAt)} · ${event.actor.label}` }),
      exactId(event.eventId),
    ]);
    button.dataset.eventId = event.eventId;
    button.dataset.human = String(event.actor.kind === 'human-confirmed');
    button.addEventListener('click', () => renderEvent(event));
    elements['history-list'].append(button);
  }
}

function renderEvent(event) {
  selectCollection('[data-event-id]', event.eventId, 'eventId');
  const viewer = clear(elements['history-detail']);
  viewer.append(node('div', { className: 'viewer-toolbar' }, [
    node('div', {}, [
      node('h3', { text: `#${event.sequence} · ${eventLabel(event)}` }),
      node('p', { className: 'path', text: event.eventId }),
    ]),
    statusPill(event.actor.kind),
  ]));
  const facts = node('dl', { className: 'facts' }, [
    node('div', {}, [node('dt', { text: 'Recorded' }), node('dd', { text: formatTime(event.recordedAt) })]),
    node('div', {}, [node('dt', { text: 'Actor' }), node('dd', { text: `${event.actor.kind} · ${event.actor.label}` })]),
    node('div', {}, [node('dt', { text: 'Model hash' }), node('dd', { className: 'path', text: event.modelHash })]),
    node('div', {}, [node('dt', { text: 'Passage' }), node('dd', { text: humanize(event.payload?.passage?.transitionId ?? 'none') })]),
  ]);
  viewer.append(facts, node('h3', { text: 'Payload' }), node('pre', { text: JSON.stringify(event.payload, null, 2) }));
}

async function ensureHistory() {
  const snapshot = currentState?.snapshot;
  if (!snapshot || snapshot.featureId === null) return;
  const key = snapshot.events?.lastEventId;
  if (eventsDetail && eventsKey === key) {
    renderHistoryList(eventsDetail.data.events);
    return;
  }
  if (eventsPromise) return eventsPromise;
  clear(elements['history-list']).append(node('p', { className: 'muted', text: 'Loading complete journal…' }));
  eventsPromise = desktop.readDetail('events', null)
    .then((detail) => {
      eventsDetail = detail;
      eventsKey = key;
      renderHistoryList(detail.data.events);
      return detail;
    })
    .catch((error) => {
      clear(elements['history-list']).append(node('div', { className: 'notice danger', text: error.message ?? String(error) }));
    })
    .finally(() => { eventsPromise = null; });
  return eventsPromise;
}

function renderModel(detail) {
  const provenance = detail.data.provenance;
  clear(elements['model-provenance']);
  for (const [label, value] of [
    ['Pinned model', provenance.pinned],
    ['Bundled observer', provenance.bundled],
    ['Migration relationship', {
      relationship: provenance.migration.relationship,
      available: String(provenance.migration.available),
    }],
  ]) {
    const card = node('article', { className: 'provenance-card' }, [node('h3', { text: label })]);
    const list = node('dl');
    for (const [key, entry] of Object.entries(value)) {
      if (entry === null || typeof entry === 'object') continue;
      list.append(node('dt', { text: humanize(key) }), node('dd', { text: entry }));
    }
    card.append(list);
    elements['model-provenance'].append(card);
  }
  if (provenance.migration.available && provenance.migration.impact) {
    const impact = node('article', { className: 'provenance-card' }, [
      node('h3', { text: 'Read-only migration impact' }),
      node('p', {
        className: 'muted',
        text: 'The bundled model is newer. This report does not migrate or reinterpret the selected feature.',
      }),
      node('pre', { text: JSON.stringify(provenance.migration.impact, null, 2) }),
    ]);
    elements['model-provenance'].append(impact);
  }
  const graph = detail.data.graph;
  clear(elements['model-graph']);
  const groups = new Map();
  for (const item of graph.nodes) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
  }
  for (const [group, items] of groups) {
    const section = node('section', { className: 'model-group' }, [node('h4', { text: group })]);
    const list = node('div', { className: 'model-node-grid' });
    for (const state of items) {
      const outgoing = graph.edges.filter((edge) => edge.from === state.id);
      list.append(node('article', { className: 'model-state' }, [
        node('strong', { text: state.label }),
        node('small', { text: state.id }),
        node('p', {
          className: 'muted',
          text: outgoing.length
            ? outgoing.map((edge) => `${edge.label} → ${edge.to}${edge.authority ? ` [${edge.authority}]` : ''}`).join(' · ')
            : 'Terminal node',
        }),
      ]));
    }
    section.append(list);
    elements['model-graph'].append(section);
  }
  elements['model-mermaid'].textContent = graph.mermaid;
  elements['copy-mermaid'].disabled = false;
}

async function ensureModel() {
  const snapshot = currentState?.snapshot;
  if (!snapshot?.model || snapshot.featureId === null) return;
  const key = snapshot.model.pinned.hash;
  if (modelDetail && modelKey === key) {
    renderModel(modelDetail);
    renderStateRail(snapshot);
    return modelDetail;
  }
  if (modelPromise) return modelPromise;
  modelPromise = desktop.readDetail('model', null)
    .then((detail) => {
      modelDetail = detail;
      modelKey = key;
      renderModel(detail);
      renderStateRail(currentState?.snapshot);
      return detail;
    })
    .catch((error) => {
      clear(elements['model-graph']).append(node('div', { className: 'notice danger', text: error.message ?? String(error) }));
    })
    .finally(() => { modelPromise = null; });
  return modelPromise;
}

function renderSessionList(inventory) {
  clear(elements['session-list']);
  if (inventory.items.length === 0) {
    elements['session-list'].append(node('p', { className: 'muted', text: 'No checkpoint or handoff is present in this worktree.' }));
    return;
  }
  for (const item of inventory.items) {
    const button = node('button', { className: 'collection-item', type: 'button' }, [
      node('div', { className: 'card-header' }, [
        node('strong', { text: item.label }),
        statusPill(item.kind),
      ]),
      node('small', { text: `${item.path} · ${formatTime(item.modifiedAt)}` }),
      exactId(item.id),
    ]);
    button.dataset.sessionId = item.id;
    button.addEventListener('click', () => void openSession(item));
    elements['session-list'].append(button);
  }
}

async function openSession(item) {
  selectCollection('[data-session-id]', item.id, 'sessionId');
  const viewer = clear(elements['session-detail']);
  viewer.append(node('div', { className: 'empty-state' }, [node('h3', { text: 'Loading Session context…' })]));
  try {
    const detail = await desktop.readSession(item.id);
    clear(viewer).append(node('div', { className: 'viewer-toolbar' }, [
      node('div', {}, [
        node('h3', { text: detail.item.label }),
        node('p', { className: 'path', text: `${detail.item.path} · non-authoritative` }),
      ]),
      statusPill(detail.item.kind),
    ]));
    viewer.append(renderMarkdown(node('div'), detail.content));
  } catch (error) {
    clear(viewer).append(node('div', { className: 'notice danger', text: error.message ?? String(error) }));
  }
}

async function ensureSession() {
  if (!currentState?.selection) return;
  if (sessionInventory) {
    renderSessionList(sessionInventory);
    return sessionInventory;
  }
  if (sessionPromise) return sessionPromise;
  clear(elements['session-list']).append(node('p', { className: 'muted', text: 'Loading Session context…' }));
  sessionPromise = desktop.listSession()
    .then((inventory) => {
      sessionInventory = inventory;
      renderSessionList(inventory);
      return inventory;
    })
    .catch((error) => {
      clear(elements['session-list']).append(node('div', { className: 'notice danger', text: error.message ?? String(error) }));
    })
    .finally(() => { sessionPromise = null; });
  return sessionPromise;
}

function render(state) {
  const previousSelection = currentState?.selection?.worktreePath;
  const refreshStarted = currentState?.refreshing === false && state.refreshing;
  currentState = state;
  const selected = state.selection !== null;
  elements.refresh.disabled = !selected || state.refreshing;
  renderRecents(state);
  renderCandidateDiagnostic(state.candidateDiagnostic);
  renderSetup(state);
  elements['brand-version'].textContent = `v${state.setup.desktop.version}`;
  elements.notifications.checked = state.preferences.notificationsEnabled;
  elements['open-setup'].classList.toggle('needs-attention', !state.setup.operationalReady);
  elements['open-setup'].title = state.setup.operationalReady ? 'Settings' : 'Settings · Needs attention';
  elements['open-setup'].setAttribute('aria-label', elements['open-setup'].title);
  const chooserMessage = state.error?.message ?? null;
  elements['chooser-error'].hidden = selected || chooserMessage === null;
  elements['chooser-error'].textContent = selected ? '' : chooserMessage ?? '';
  if (!renderedOnce && state.preferences.selectedAgents.length === 0) currentView = 'setup';
  renderedOnce = true;
  if (!selected) {
    delete elements.workspace.dataset.featureId;
    if (currentView !== 'setup') currentView = workspaceState().mainView;
    elements.activity.textContent = state.setup.phase === 'checking'
      ? 'Checking GateReeve setup…'
      : state.setup.operationalReady ? 'Setup ready · add a project' : 'Setup incomplete · historical records remain readable';
    elements.activity.disabled = true;
    switchView(currentView);
    applyLayout();
    return;
  }

  if (previousSelection !== state.selection.worktreePath) {
    artifactReadSequence += 1;
    selectedArtifactId = null;
    selectedArtifactFingerprint = null;
    artifactInFlightFingerprint = null;
    artifactFailedFingerprint = null;
    artifactHasContent = false;
    modelDetail = null;
    modelKey = null;
    eventsDetail = null;
    eventsKey = null;
    sessionInventory = null;
    currentView = workspaceState().mainView;
    selectedAttemptId = workspaceState().selectedAttemptId;
  } else if (eventsKey !== state.snapshot?.events?.lastEventId) {
    eventsDetail = null;
    sessionInventory = null;
  } else if (refreshStarted) {
    sessionInventory = null;
  }
  if (refreshStarted) artifactFailedFingerprint = null;

  const snapshot = state.snapshot;
  if (snapshot?.featureId) elements.workspace.dataset.featureId = snapshot.featureId;
  else delete elements.workspace.dataset.featureId;
  elements.activity.disabled = false;
  elements.activity.textContent = state.refreshing
    ? 'Refreshing canonical observation…'
    : state.githubPolling ? 'Watching local changes · polling GitHub' : 'Watching local changes';

  renderOverview(snapshot);
  renderArtifacts(snapshot);
  switchView(currentView);
  renderInspector(snapshot);
  if (diagnosticCanShowGovernedViews(snapshot)) void ensureModel();
}

elements.choose.addEventListener('click', () => void desktop.addProject());
elements['choose-empty'].addEventListener('click', () => void desktop.addProject());
elements['candidate-diagnostic-choose-another'].addEventListener('click', () => void desktop.addProject());
elements['open-setup'].addEventListener('click', () => switchView('setup'));
elements['setup-open-worktree'].addEventListener('click', () => void desktop.addProject());
elements['setup-return'].addEventListener('click', () => switchView(workspaceState().mainView));
elements['setup-recheck'].addEventListener('click', () => void desktop.recheckSetup());
elements['agent-selection'].addEventListener('submit', async (event) => {
  event.preventDefault();
  const selectedAgents = ['codex', 'claude'].filter((id) => elements[`agent-${id}`].checked);
  elements['save-agents'].disabled = true;
  try {
    render(await desktop.setSelectedAgents(selectedAgents));
    showToast('Agent selection saved; Setup rechecked');
  } catch (error) {
    showToast(error.message ?? String(error));
  } finally {
    elements['save-agents'].disabled = false;
  }
});
elements.refresh.addEventListener('click', () => void desktop.refresh());
elements.activity.addEventListener('click', openSourceDialog);
elements['source-dialog-close'].addEventListener('click', () => {
  if (typeof elements['source-dialog'].close === 'function') elements['source-dialog'].close();
  else elements['source-dialog'].removeAttribute('open');
});
elements['check-updates'].addEventListener('click', async () => {
  try {
    const update = await desktop.checkForUpdates();
    renderUpdate(update);
    if (update.status === 'current') showToast('GateReeve Desktop is current');
    if (update.status === 'unavailable') showToast('Update information is temporarily unavailable');
  } catch (error) {
    showToast(error.message ?? String(error));
  }
});
elements['open-update'].addEventListener('click', async () => {
  if (currentUpdate?.status !== 'available') return;
  try { await desktop.openUpdateRelease(); }
  catch (error) { showToast(error.message ?? String(error)); }
});
elements.notifications.addEventListener('change', async () => {
  const enabled = elements.notifications.checked;
  elements.notifications.disabled = true;
  try {
    render(await desktop.setNotificationsEnabled(enabled));
    showToast(enabled ? 'Native notifications enabled' : 'Native notifications disabled');
  } catch (error) {
    elements.notifications.checked = !enabled;
    showToast(error.message ?? String(error));
  } finally {
    elements.notifications.disabled = false;
  }
});
elements['attempt-select'].addEventListener('change', (event) => {
  selectedAttemptId = event.target.value;
  workspaceStore.setHierarchy(projectPath(), { selectedAttemptId, selectedGateId: null });
  renderBoundary(currentState?.snapshot);
  const artifact = attemptArtifact(currentState?.snapshot, selectedAttemptId);
  if (artifact) void openArtifact(artifact);
});
elements['copy-mermaid'].addEventListener('click', () => {
  if (modelDetail) void copy(modelDetail.data.graph.mermaid, 'Mermaid source copied');
});
for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => switchView(button.dataset.view));
}
for (const button of document.querySelectorAll('[data-go-view]')) {
  button.addEventListener('click', () => switchView(button.dataset.goView));
}

elements['toggle-sidebar'].addEventListener('click', () => toggleSidebar());
elements['toggle-inspector'].addEventListener('click', () => toggleInspector());

let resizeStart = null;
elements['inspector-resizer'].addEventListener('pointerdown', (event) => {
  resizeStart = { x: event.clientX, width: workspaceState().inspectorWidth };
  elements['inspector-resizer'].setPointerCapture?.(event.pointerId);
});
elements['inspector-resizer'].addEventListener('pointermove', (event) => {
  if (resizeStart === null) return;
  workspaceStore.setInspectorWidth(projectPath(), resizeStart.width + resizeStart.x - event.clientX);
  applyLayout();
});
elements['inspector-resizer'].addEventListener('pointerup', () => { resizeStart = null; });
elements['inspector-resizer'].addEventListener('keydown', (event) => {
  const changes = { ArrowLeft: 20, ArrowRight: -20, Home: -10_000, End: 10_000 };
  if (!(event.key in changes)) return;
  event.preventDefault();
  workspaceStore.setInspectorWidth(projectPath(), workspaceState().inspectorWidth + changes[event.key]);
  applyLayout();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && inspectorExpanded) {
    event.preventDefault();
    setInspectorExpanded(false);
    return;
  }
  const primary = window.navigator.platform?.toLowerCase().includes('mac')
    ? event.metaKey
    : event.ctrlKey;
  if (!primary || event.shiftKey || event.key.toLowerCase() !== 'b') return;
  event.preventDefault();
  if (event.altKey) toggleInspector();
  else toggleSidebar();
});

desktop.subscribe(render);
desktop.subscribeUpdates(renderUpdate);
desktop.subscribeLayoutCommands?.((command) => {
  if (command === 'toggle-sidebar') toggleSidebar();
  if (command === 'toggle-inspector') toggleInspector();
});
desktop.getState().then(render).catch((error) => {
  elements['chooser-error'].hidden = false;
  elements['chooser-error'].textContent = error.message ?? String(error);
});
desktop.getUpdateState().then(renderUpdate).catch(() => {
  // Update discovery is intentionally non-disruptive to local observation.
});
