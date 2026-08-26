const desktop = window.gatereeveDesktop;

const elements = Object.fromEntries([
  'chooser', 'choose', 'recents', 'chooser-error', 'overview', 'refresh', 'mode', 'activity',
  'feature', 'worktree', 'feature-state', 'active-slice', 'source-local',
  'source-git', 'source-github', 'error',
].map((id) => [id, document.getElementById(id)]));

function sourceText(source) {
  if (!source) return '—';
  return source.detail ? `${source.status}: ${source.detail}` : source.status;
}

function render(state) {
  const selected = state.selection !== null;
  elements.chooser.hidden = selected;
  elements.overview.hidden = !selected;
  elements.refresh.disabled = !selected || state.refreshing;
  elements.recents.replaceChildren(...state.preferences.recentWorktrees.map((path) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent';
    button.textContent = path;
    button.addEventListener('click', () => void desktop.openRecent(path));
    return button;
  }));
  elements['chooser-error'].hidden = selected || state.error === null;
  elements['chooser-error'].textContent = selected ? '' : state.error?.message ?? '';
  if (!selected) return;
  const snapshot = state.snapshot;
  elements.mode.textContent = snapshot?.mode ?? state.phase;
  elements.activity.textContent = state.refreshing
    ? 'Refreshing…'
    : state.githubPolling ? 'Watching local changes · polling GitHub' : 'Watching local changes';
  elements.feature.textContent = snapshot?.featureId ?? 'Ungoverned worktree';
  elements.worktree.textContent = state.selection.worktreePath;
  elements['feature-state'].textContent = snapshot?.projection?.feature?.state ?? '—';
  elements['active-slice'].textContent = snapshot?.active?.sliceId ?? '—';
  for (const source of ['local', 'git', 'github']) {
    elements[`source-${source}`].textContent = sourceText(snapshot?.sources?.[source]);
  }
  elements.error.hidden = state.error === null;
  elements.error.textContent = state.error?.message ?? '';
}

elements.choose.addEventListener('click', () => void desktop.chooseWorktree());
elements.refresh.addEventListener('click', () => void desktop.refresh());
desktop.subscribe(render);
desktop.getState().then(render);
