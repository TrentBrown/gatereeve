import { clear, node, renderJson, renderMarkdown } from './dom.js';
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
  'chooser', 'choose', 'recents', 'chooser-error', 'workspace', 'refresh', 'mode', 'activity',
  'feature', 'worktree', 'feature-state', 'active-slice', 'source-local',
  'source-git', 'source-github', 'error', 'diagnostic', 'warnings', 'state-rail',
  'milestones', 'slices', 'attention', 'attempt-select', 'boundary-summary', 'gate-dag',
  'actions', 'artifact-count', 'artifact-list', 'artifact-viewer', 'history-count',
  'history-list', 'history-detail', 'model-provenance', 'model-graph', 'model-mermaid',
  'copy-mermaid', 'session-list', 'session-detail', 'toast',
  'notifications', 'open-setup', 'setup-shell', 'setup-summary', 'setup-prerequisites',
  'setup-agents', 'setup-recheck', 'setup-open-worktree', 'setup-return', 'save-agents',
  'agent-selection', 'agent-codex', 'agent-claude', 'desktop-version', 'historical-reading',
  'readiness-banner',
];
const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

let currentState = null;
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
let toastTimer = null;
let renderedOnce = false;

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
  currentView = view;
  const setup = view === 'setup';
  const selected = currentState?.selection !== null && currentState?.selection !== undefined;
  elements['setup-shell'].hidden = !setup;
  elements.chooser.hidden = setup || selected;
  elements.workspace.hidden = setup || !selected;
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
  elements['agent-codex'].checked = selected.includes('codex');
  elements['agent-claude'].checked = selected.includes('claude');
  elements['desktop-version'].textContent = `Desktop ${setup.desktop.version}`;
  elements['setup-return'].hidden = state.selection === null;
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
        ? `Operational setup is ready for ${selected.map(humanize).join(' and ')}.`
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
  elements.recents.replaceChildren(...state.preferences.recentWorktrees.map((path) => {
    const button = node('button', { className: 'recent', text: path, type: 'button' });
    button.addEventListener('click', () => void desktop.openRecent(path));
    return button;
  }));
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
  if (gate.evidence?.path) {
    const artifact = currentState?.snapshot?.artifacts?.find(
      (item) => item.context?.attemptId === attempt.id && item.context?.gateId === gate.id,
    );
    if (artifact?.exists && !artifact.unsafe) {
      const button = node('button', { className: 'text-button', text: 'View evidence', type: 'button' });
      button.addEventListener('click', () => {
        switchView('artifacts');
        void openArtifact(artifact);
      });
      container.append(button);
    }
  }
}

function renderBoundary(snapshot) {
  const attempts = snapshot?.projection?.boundaryAttempts ?? [];
  const select = elements['attempt-select'];
  const previous = selectedAttemptId;
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
  const readable = artifact.exists && !artifact.unsafe;
  const button = node('button', {
    className: 'collection-item',
    type: 'button',
    disabled: !readable,
  }, [
    node('div', { className: 'card-header' }, [
      node('strong', { text: artifact.label }),
      statusPill(artifact.status),
    ]),
    node('small', { text: artifact.path ?? artifactContext(artifact) }),
    exactId(artifact.id),
  ]);
  button.dataset.artifactId = artifact.id;
  button.addEventListener('click', () => void openArtifact(artifact));
  return button;
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

function selectCollection(selector, value, dataKey) {
  for (const item of document.querySelectorAll(selector)) {
    item.classList.toggle('selected', item.dataset[dataKey] === value);
  }
}

async function openArtifact(artifact) {
  selectCollection('[data-artifact-id]', artifact.id, 'artifactId');
  const viewer = clear(elements['artifact-viewer']);
  viewer.append(node('div', { className: 'empty-state' }, [
    node('h3', { text: 'Loading artifact…' }),
  ]));
  try {
    const detail = await desktop.readDetail('artifact', artifact.id);
    const current = detail.data.artifact;
    const toolbar = node('div', { className: 'viewer-toolbar' }, [
      node('div', {}, [
        node('h3', { text: current.label }),
        node('p', { className: 'path', text: `${current.path} · ${current.id}` }),
      ]),
    ]);
    const actions = node('div', { className: 'viewer-actions' });
    const open = node('button', { className: 'secondary', text: 'Open externally', type: 'button' });
    open.addEventListener('click', () => void desktop.openArtifact(current.id));
    const reveal = node('button', { className: 'secondary', text: 'Reveal', type: 'button' });
    reveal.addEventListener('click', () => void desktop.revealArtifact(current.id));
    actions.append(open, reveal);
    toolbar.append(actions);
    clear(viewer).append(toolbar);
    const content = node('div');
    viewer.append(content);
    if (current.format === 'markdown') {
      renderMarkdown(content, detail.data.content);
    } else if (current.format === 'json' || current.format === 'jsonl') {
      renderJson(content, detail.data.structured);
    } else if (current.format === 'html') {
      const frame = node('iframe', {
        title: `${current.label} interactive explanation`,
        attributes: {
          src: `gatereeve-artifact://desktop/${encodeURIComponent(current.id)}`,
        },
      });
      content.append(frame);
    } else {
      content.append(node('pre', { text: detail.data.content }));
    }
  } catch (error) {
    clear(viewer).append(node('div', { className: 'notice danger', text: error.message ?? String(error) }));
  }
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
  elements.notifications.checked = state.preferences.notificationsEnabled;
  elements['chooser-error'].hidden = selected || state.error === null;
  elements['chooser-error'].textContent = selected ? '' : state.error?.message ?? '';
  if (!renderedOnce && state.preferences.selectedAgents.length === 0) currentView = 'setup';
  renderedOnce = true;
  if (!selected) {
    elements.activity.textContent = state.setup.phase === 'checking'
      ? 'Checking GateReeve setup…'
      : state.setup.operationalReady ? 'Setup ready · choose a worktree' : 'Setup incomplete · historical records remain readable';
    switchView(currentView);
    return;
  }

  if (previousSelection !== state.selection.worktreePath) {
    modelDetail = null;
    modelKey = null;
    eventsDetail = null;
    eventsKey = null;
    sessionInventory = null;
    selectedAttemptId = null;
  } else if (eventsKey !== state.snapshot?.events?.lastEventId) {
    eventsDetail = null;
    sessionInventory = null;
  } else if (refreshStarted) {
    sessionInventory = null;
  }

  const snapshot = state.snapshot;
  elements.mode.textContent = snapshot?.mode ?? state.phase;
  elements.activity.textContent = state.refreshing
    ? 'Refreshing canonical observation…'
    : state.githubPolling ? 'Watching local changes · polling GitHub' : 'Watching local changes';
  elements.feature.textContent = snapshot?.featureId ?? 'Ungoverned worktree';
  elements.worktree.textContent = state.selection.worktreePath;
  elements['feature-state'].textContent = snapshot?.projection?.feature?.state ?? humanize(snapshot?.mode ?? 'unknown');
  elements['active-slice'].textContent = snapshot?.active?.sliceId ?? 'None';
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
  if (diagnosticCanShowGovernedViews(snapshot)) void ensureModel();
}

elements.choose.addEventListener('click', () => void desktop.chooseWorktree());
elements['open-setup'].addEventListener('click', () => switchView('setup'));
elements['setup-open-worktree'].addEventListener('click', () => void desktop.chooseWorktree());
elements['setup-return'].addEventListener('click', () => switchView('overview'));
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

desktop.subscribe(render);
desktop.getState().then(render).catch((error) => {
  elements['chooser-error'].hidden = false;
  elements['chooser-error'].textContent = error.message ?? String(error);
});
