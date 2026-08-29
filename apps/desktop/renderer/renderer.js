import { clear, node, renderJson, renderMarkdown } from './dom.js';
import { createWorkspaceStore, workspaceDefaults } from './workspace-state.js';
import {
  actionMeaning,
  artifactContext,
  attemptLabel,
  diagnosticCanShowGovernedViews,
  eventLabel,
  featureStates,
  formatTime,
  humanize,
  modeMessage,
  sourceLabel,
} from './presentation.js';

const desktop = window.gatereeveDesktop;

const ids = [
  'chooser', 'choose', 'choose-empty', 'recents', 'chooser-error', 'workspace', 'refresh', 'activity',
  'brand-version', 'project-context', 'project-sidebar', 'main-tabs', 'toggle-sidebar',
  'toggle-inspector', 'inspector-panel', 'inspector-resizer', 'inspector-tabs', 'hide-inspector',
  'source-local',
  'source-git', 'source-github', 'error', 'diagnostic', 'warnings', 'state-rail',
  'milestones', 'slices', 'attention', 'attempt-select', 'boundary-summary', 'gate-dag',
  'actions', 'artifact-count', 'artifact-list', 'artifact-viewer', 'history-count',
  'history-list', 'history-detail', 'model-provenance', 'model-graph', 'model-mermaid',
  'copy-mermaid', 'session-list', 'session-detail', 'toast',
  'notifications', 'open-setup', 'setup-shell', 'setup-summary', 'setup-prerequisites',
  'setup-agents', 'setup-recheck', 'setup-open-worktree', 'setup-return', 'save-agents',
  'agent-selection', 'agent-codex', 'agent-claude', 'desktop-version', 'historical-reading',
  'readiness-banner',
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

function sourceText(name, source) {
  const presented = sourceLabel(name, source);
  const box = elements[`source-${name}`];
  box.dataset.status = presented.status;
  clear(box).append(
    node('strong', { text: `${presented.name} · ${humanize(presented.status)}` }),
    document.createTextNode(source?.detail ?? 'No additional detail'),
  );
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
      project.workflowState ? humanize(project.workflowState) : null,
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
    select.addEventListener('click', () => void desktop.activateProject(project.path));
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

function renderWarnings(snapshot) {
  clear(elements.warnings);
  for (const warning of snapshot?.warnings ?? []) {
    const activity = warning.severity === 'activity';
    elements.warnings.append(node('div', {
      className: `notice ${activity ? 'info' : ''}`,
      text: activity
        ? `${humanize(warning.type)} is ordinary source activity and does not block workflow passage.`
        : `${humanize(warning.type)} requires governance attention.`,
    }));
  }
}

function renderStateRail(snapshot) {
  clear(elements['state-rail']);
  const states = featureStates(snapshot, modelDetail);
  if (states.length === 0) {
    elements['state-rail'].append(node('li', {
      className: 'state-node current',
      text: snapshot?.projection?.feature?.state
        ? humanize(snapshot.projection.feature.state)
        : 'Pinned model detail unavailable',
    }));
    return;
  }
  for (const state of states) {
    elements['state-rail'].append(node('li', {
      className: `state-node ${state.position}`,
      attributes: {
        'aria-current': state.position === 'current' ? 'step' : 'false',
      },
    }, [
      node('strong', { text: state.label }),
      node('small', { text: state.id }),
    ]));
  }
}

function renderMilestones(snapshot) {
  clear(elements.milestones);
  const featureState = snapshot?.projection?.feature?.state;
  const milestones = (snapshot?.milestones ?? []).filter(
    (item) => item.state === featureState || item.status === 'active' || item.status === 'ready',
  );
  for (const milestone of milestones) {
    const item = node('span', {
      className: 'milestone',
      text: milestone.label,
      title: `Exact milestone ID: ${milestone.id}`,
    });
    item.dataset.status = milestone.status;
    elements.milestones.append(item);
  }
}

function renderSlices(snapshot) {
  clear(elements.slices);
  const slices = snapshot?.projection?.slices ?? [];
  if (slices.length === 0) {
    elements.slices.append(node('p', { className: 'muted', text: 'No delivery slices have been proposed.' }));
    return;
  }
  for (const slice of slices) {
    const card = node('article', { className: 'card' });
    card.append(node('div', { className: 'card-header' }, [
      node('div', {}, [node('h4', { text: slice.name }), exactId(slice.id)]),
      statusPill(slice.state),
    ]));
    card.append(node('p', {
      text: [slice.branch, slice.planSteps?.join(', '), slice.scope].filter(Boolean).join(' · '),
    }));
    const attempts = (snapshot.projection?.boundaryAttempts ?? []).filter(
      (attempt) => attempt.sliceId === slice.id,
    );
    if (attempts.length > 0) {
      const targetAttempt = slice.activeAttemptId ?? attempts.at(-1).id;
      const button = node('button', {
        className: 'text-button',
        text: slice.activeAttemptId
          ? 'Inspect active boundary'
          : `View ${attempts.length} boundary attempt${attempts.length === 1 ? '' : 's'}`,
        type: 'button',
      });
      button.addEventListener('click', () => {
        selectedAttemptId = targetAttempt;
        workspaceStore.setHierarchy(projectPath(), { selectedAttemptId: targetAttempt });
        renderBoundary(snapshot);
        document.getElementById('gate-dag')?.scrollIntoView?.({ block: 'center' });
      });
      card.append(button);
    }
    elements.slices.append(card);
  }
}

function blockerText(blocker) {
  return blocker.message ?? blocker.reason ?? blocker.type ?? 'Unknown blocker';
}

function renderAttention(snapshot) {
  clear(elements.attention);
  const items = [
    ...(snapshot?.blockers ?? []).map((item) => ({ ...item, category: 'blocker' })),
    ...(snapshot?.warnings ?? []).filter((item) => item.severity !== 'activity').map(
      (item) => ({ ...item, category: 'warning' }),
    ),
  ];
  if (items.length === 0) {
    elements.attention.append(node('div', { className: 'card' }, [
      node('div', { className: 'card-header' }, [
        node('h4', { text: 'No current blockers' }),
        statusPill('clear'),
      ]),
      node('p', { text: 'The observer reports no blocking feature-level condition.' }),
    ]));
    return;
  }
  for (const item of items) {
    elements.attention.append(node('div', { className: 'card' }, [
      node('div', { className: 'card-header' }, [
        node('h4', { text: humanize(item.type) }),
        statusPill(item.category),
      ]),
      node('p', { text: blockerText(item) }),
    ]));
  }
}

function renderGateDetail(attempt, gate) {
  const container = elements['boundary-summary'];
  clear(container);
  container.append(
    node('strong', { text: humanize(gate.id) }),
    document.createTextNode(` · ${humanize(gate.outcome)} · ${humanize(gate.freshness)}`),
    exactId(gate.recordedEventId ?? gate.id),
  );
  if (gate.reason) container.append(node('p', { text: gate.reason }));
  if (gate.blockers?.length) {
    const list = node('ul');
    for (const blocker of gate.blockers) list.append(node('li', { text: blockerText(blocker) }));
    container.append(list);
  }
  const artifact = currentState?.snapshot?.artifacts?.find(
    (item) => item.context?.attemptId === attempt.id && item.context?.gateId === gate.id,
  );
  if (artifact) void openArtifact(artifact);
  else {
    workspaceStore.openGate(projectPath(), attempt.id, gate);
    renderInspector(currentState?.snapshot);
  }
}

function renderBoundary(snapshot) {
  const attempts = snapshot?.projection?.boundaryAttempts ?? [];
  const select = elements['attempt-select'];
  const previous = workspaceState().selectedAttemptId ?? selectedAttemptId;
  clear(select);
  if (attempts.length === 0) {
    select.disabled = true;
    clear(elements['boundary-summary']).append(node('p', { text: 'No PR-boundary attempt has been recorded.' }));
    clear(elements['gate-dag']);
    return;
  }
  select.disabled = false;
  for (const attempt of [...attempts].reverse()) {
    const option = node('option', { text: attemptLabel(attempt) });
    option.value = attempt.id;
    select.append(option);
  }
  selectedAttemptId = attempts.some((item) => item.id === previous)
    ? previous
    : snapshot.active?.boundaryAttemptId ?? attempts.at(-1).id;
  workspaceStore.setHierarchy(projectPath(), { selectedAttemptId });
  for (const option of select.querySelectorAll('option')) {
    if (option.value === selectedAttemptId) option.setAttribute('selected', '');
    else option.removeAttribute('selected');
  }
  const attempt = attempts.find((item) => item.id === selectedAttemptId) ?? attempts.at(-1);
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
  clear(elements['gate-dag']);
  for (const gate of attempt.gates) {
    const button = node('button', { className: 'gate-card', type: 'button' }, [
      node('div', { className: 'card-header' }, [
        node('strong', { text: humanize(gate.id), title: `Exact gate ID: ${gate.id}` }),
        statusPill(gate.outcome === 'UNSET' ? gate.freshness : gate.outcome),
      ]),
      node('small', { text: `Freshness: ${humanize(gate.freshness)}` }),
      node('div', {
        className: 'dependencies',
        text: gate.dependsOn.length ? `After: ${gate.dependsOn.join(', ')}` : 'Entry gate',
      }),
    ]);
    button.addEventListener('click', () => renderGateDetail(attempt, gate));
    elements['gate-dag'].append(button);
  }
}

function renderActions(snapshot) {
  clear(elements.actions);
  const actions = snapshot?.actions ?? [];
  if (actions.length === 0) {
    elements.actions.append(node('p', { className: 'muted', text: 'No action is currently proposed by the pinned workflow model.' }));
    return;
  }
  for (const action of actions) {
    const card = node('article', { className: 'action-card' });
    card.append(
      node('div', { className: 'card-header' }, [
        node('div', {}, [node('h4', { text: humanize(action.command) }), exactId(action.id)]),
        statusPill(action.readiness),
      ]),
      node('p', { text: actionMeaning(action.command) }),
      node('div', { className: 'action-meta' }, [
        statusPill(action.authority),
        node('span', { className: 'status', text: `${action.inputs.length} input${action.inputs.length === 1 ? '' : 's'}` }),
      ]),
    );
    if (action.reasons?.length) {
      const list = node('ul', { className: 'muted' });
      for (const reason of action.reasons) list.append(node('li', { text: reason }));
      card.append(list);
    }
    card.append(node('pre', { className: 'command', text: action.copyCommand }));
    const button = node('button', { className: 'secondary', text: 'Copy command', type: 'button' });
    button.addEventListener('click', () => void copy(action.copyCommand, 'Command copied — GateReeve Desktop did not execute it'));
    card.append(button);
    elements.actions.append(card);
  }
}

function renderOverview(snapshot) {
  const diagnostic = modeMessage(snapshot);
  elements.diagnostic.hidden = diagnostic === null;
  elements.diagnostic.textContent = diagnostic ?? '';
  renderWarnings(snapshot);
  renderStateRail(snapshot);
  renderMilestones(snapshot);
  renderSlices(snapshot);
  renderAttention(snapshot);
  renderBoundary(snapshot);
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
    node('div', {}, [node('h3', { text: humanize(gate.id) }), node('p', { className: 'path', text: `${attempt.id} · ${gate.id}` })]),
    statusPill(gate.outcome),
  ]));
  const facts = node('dl', { className: 'facts' }, [
    node('div', {}, [node('dt', { text: 'Outcome' }), node('dd', { text: humanize(gate.outcome) })]),
    node('div', {}, [node('dt', { text: 'Freshness' }), node('dd', { text: humanize(gate.freshness) })]),
    node('div', {}, [node('dt', { text: 'Dependencies' }), node('dd', { text: gate.dependsOn?.length ? gate.dependsOn.join(', ') : 'Entry gate' })]),
    node('div', {}, [node('dt', { text: 'Recorded event' }), node('dd', { className: 'path', text: gate.recordedEventId ?? 'None' })]),
  ]);
  viewer.append(facts, node('div', { className: 'notice info', text: 'No standalone artifact. This detail is projected from the trusted protocol record.' }));
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
  renderInspectorTabs();
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
    target.focus();
  }
}

function toggleInspector(force = undefined) {
  const activeInside = elements['inspector-panel'].contains(document.activeElement);
  const workspace = workspaceStore.toggleInspector(projectPath(), force);
  applyLayout();
  if (!workspace.inspectorVisible && activeInside) elements['toggle-inspector'].focus();
  if (workspace.inspectorVisible) {
    renderInspector(currentState?.snapshot);
    const target = elements['inspector-tabs'].querySelector('[aria-selected="true"]')
      ?? elements['hide-inspector'];
    target.focus();
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

function artifactActions(artifact) {
  const actions = node('div', { className: 'viewer-actions' });
  const refresh = node('button', {
    className: 'secondary',
    text: 'Refresh',
    type: 'button',
    attributes: { 'data-artifact-refresh': '' },
  });
  refresh.addEventListener('click', () => {
    const current = currentState?.snapshot?.artifacts?.find(
      (item) => item.id === selectedArtifactId && item.exists && !item.unsafe,
    );
    if (current) void readArtifact(current, { preserveContent: artifactHasContent, force: true });
  });
  const open = node('button', { className: 'secondary', text: 'Open externally', type: 'button' });
  open.addEventListener('click', () => void desktop.openArtifact(artifact.id));
  const reveal = node('button', { className: 'secondary', text: 'Reveal', type: 'button' });
  reveal.addEventListener('click', () => void desktop.revealArtifact(artifact.id));
  actions.append(refresh, open, reveal);
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

function renderArtifactDetail(detail, requestSequence, position) {
  const viewer = clear(elements['artifact-viewer']);
  const current = detail.data.artifact;
  const toolbar = node('div', { className: 'viewer-toolbar' }, [
    node('div', {}, [
      node('h3', { text: current.label }),
      node('p', { className: 'path', text: `${current.path} · ${current.id}` }),
    ]),
    artifactActions(current),
  ]);
  viewer.append(toolbar);
  const content = node('div');
  viewer.append(content);
  if (current.format === 'markdown') {
    renderMarkdown(content, detail.data.content, {
      resolveLink: (target) => resolveMarkdownLink(current, target),
      activateLink: (link) => void activateMarkdownLink(link),
    });
  } else if (current.format === 'json' || current.format === 'jsonl') {
    renderJson(content, detail.data.structured);
  } else if (current.format === 'html') {
    const frame = node('iframe', {
      title: `${current.label} interactive explanation`,
      attributes: {
        src: `gatereeve-artifact://desktop/${encodeURIComponent(current.id)}?refresh=${requestSequence}`,
      },
    });
    content.append(frame);
  } else {
    content.append(node('pre', { text: detail.data.content }));
  }
  artifactHasContent = true;
  restoreArtifactScroll(position);
}

function showArtifactRefreshFailure(artifact, error) {
  const viewer = elements['artifact-viewer'];
  viewer.querySelector('.artifact-refresh-warning')?.remove();
  if (!artifactHasContent) {
    const toolbar = node('div', { className: 'viewer-toolbar' }, [
      node('div', {}, [
        node('h3', { text: artifact.label }),
        node('p', { className: 'path', text: `${artifact.path} · ${artifact.id}` }),
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
    const detail = await desktop.readDetail('artifact', artifact.id);
    if (requestSequence !== artifactReadSequence || selectedArtifactId !== artifact.id) return;
    renderArtifactDetail(detail, requestSequence, position);
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
  workspaceStore.openArtifact(projectPath(), artifact);
  selectedArtifactFingerprint = null;
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
  renderSetup(state);
  elements['brand-version'].textContent = `v${state.setup.desktop.version}`;
  elements.notifications.checked = state.preferences.notificationsEnabled;
  const chooserMessage = state.candidateDiagnostic?.message ?? state.error?.message ?? null;
  elements['chooser-error'].hidden = selected || chooserMessage === null;
  elements['chooser-error'].textContent = selected ? '' : chooserMessage ?? '';
  if (!renderedOnce && state.preferences.selectedAgents.length === 0) currentView = 'setup';
  renderedOnce = true;
  if (!selected) {
    if (currentView !== 'setup') currentView = workspaceState().mainView;
    elements.activity.textContent = state.setup.phase === 'checking'
      ? 'Checking GateReeve setup…'
      : state.setup.operationalReady ? 'Setup ready · add a project' : 'Setup incomplete · historical records remain readable';
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
  elements.activity.textContent = state.refreshing
    ? 'Refreshing canonical observation…'
    : state.githubPolling ? 'Watching local changes · polling GitHub' : 'Watching local changes';
  elements['project-context'].textContent = [
    snapshot?.featureId ?? 'Ungoverned project',
    snapshot?.projection?.feature?.state ? humanize(snapshot.projection.feature.state) : humanize(snapshot?.mode ?? state.phase),
    state.selection.worktreePath,
  ].join(' · ');
  for (const source of ['local', 'git', 'github']) sourceText(source, snapshot?.sources?.[source]);

  elements.error.hidden = state.error === null;
  elements.error.textContent = state.error?.message ?? '';
  elements['readiness-banner'].hidden = state.setup.operationalReady;
  elements['readiness-banner'].textContent = state.setup.operationalReady
    ? ''
    : 'Historical/offline observation: GateReeve Setup is incomplete, so this record remains readable but new or active work is not operationally ready.';
  renderOverview(snapshot);
  renderArtifacts(snapshot);
  switchView(currentView);
  renderInspector(snapshot);
  if (diagnosticCanShowGovernedViews(snapshot)) void ensureModel();
}

elements.choose.addEventListener('click', () => void desktop.addProject());
elements['choose-empty'].addEventListener('click', () => void desktop.addProject());
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
  workspaceStore.setHierarchy(projectPath(), { selectedAttemptId });
  renderBoundary(currentState?.snapshot);
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
elements['hide-inspector'].addEventListener('click', () => toggleInspector(false));

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
