export function humanize(value) {
  if (value === null || value === undefined || value === '') return 'None';
  return String(value)
    .replaceAll(/[._:-]+/g, ' ')
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function modeMessage(snapshot) {
  if (!snapshot) return null;
  const reason = snapshot.blockers?.[0]?.reason;
  const messages = {
    legacy: 'This worktree uses legacy workflow records. GateReeve can observe it but will not adopt or repair it.',
    missing: 'No GateReeve feature record was found. Desktop will not initialize or adopt this worktree.',
    inconsistent: 'The feature record is internally inconsistent. Readable evidence remains available, but guidance is withheld.',
    incompatible: 'The pinned workflow model is not supported by this bundled observer. Desktop will not reinterpret or migrate it.',
  };
  if (snapshot.mode === 'governed' && snapshot.projection?.suspension?.paused) {
    return 'This governed feature is suspended. Observation remains available while workflow passage is paused.';
  }
  const message = messages[snapshot.mode];
  return message ? `${message}${reason ? ` ${reason}` : ''}` : null;
}

export function globalAlert(snapshot, runtimeError = null) {
  const messages = [];
  const runtimeMessage = runtimeError?.message ?? (typeof runtimeError === 'string' ? runtimeError : null);
  if (runtimeMessage) messages.push(runtimeMessage);
  const diagnostic = modeMessage(snapshot);
  if (diagnostic) messages.push(diagnostic);
  for (const warning of snapshot?.warnings ?? []) {
    if (warning.severity === 'activity') continue;
    messages.push(`${humanize(warning.type)} requires governance attention.`);
  }
  const items = [...new Set(messages)];
  if (items.length === 0) return null;
  const danger = Boolean(runtimeMessage) || ['inconsistent', 'incompatible'].includes(snapshot?.mode);
  return {
    title: items.length === 1 ? 'Workflow attention' : `${items.length} workflow conditions require attention`,
    tone: danger ? 'danger' : 'warning',
    items,
  };
}

export function sourceLabel(name, source) {
  const status = source?.status ?? 'not-checked';
  const detail = source?.detail ? ` — ${source.detail}` : '';
  const label = name === 'github' ? 'GitHub' : humanize(name);
  return { name: label, status, text: `${humanize(status)}${detail}` };
}

const STATE_ARTIFACT_IDS = Object.freeze({
  DESIGNING: 'design',
  SPECIFYING: 'spec',
  PLANNING: 'plan',
  COMPLETE: 'completion-report',
});

export function featureStates(snapshot, modelDetail, selectedState = null) {
  const model = modelDetail?.data?.lock?.model;
  const states = model?.presentation?.featureOrder ?? model?.feature?.states ?? [];
  const current = snapshot?.projection?.feature?.state ?? null;
  const currentIndex = states.indexOf(current);
  return states.map((id, index) => ({
    id,
    label: humanize(id),
    current: id === current,
    selected: id === selectedState,
    position: id === current ? 'current' : currentIndex >= 0 && index < currentIndex ? 'complete' : 'pending',
  }));
}

export function stateArtifact(snapshot, stateId) {
  const artifactId = STATE_ARTIFACT_IDS[stateId] ?? null;
  return artifactId === null
    ? null
    : snapshot?.artifacts?.find((artifact) => artifact.id === artifactId) ?? null;
}

export function selectedSlice(snapshot, selectedSliceId = null) {
  const slices = snapshot?.projection?.slices ?? [];
  if (slices.some((slice) => slice.id === selectedSliceId)) return selectedSliceId;
  const activeSliceId = snapshot?.projection?.activeSliceId ?? snapshot?.active?.sliceId ?? null;
  if (slices.some((slice) => slice.id === activeSliceId)) return activeSliceId;
  return slices.at(-1)?.id ?? null;
}

export function selectedAttempt(snapshot, sliceId, selectedAttemptId = null) {
  const attempts = (snapshot?.projection?.boundaryAttempts ?? []).filter(
    (attempt) => attempt.sliceId === sliceId,
  );
  if (attempts.some((attempt) => attempt.id === selectedAttemptId)) return selectedAttemptId;
  const slice = snapshot?.projection?.slices?.find((item) => item.id === sliceId);
  const activeAttemptId = slice?.activeAttemptId
    ?? (snapshot?.active?.sliceId === sliceId ? snapshot.active.boundaryAttemptId : null);
  if (attempts.some((attempt) => attempt.id === activeAttemptId)) return activeAttemptId;
  return attempts.at(-1)?.id ?? null;
}

export function attemptArtifact(snapshot, attemptId) {
  const artifacts = snapshot?.artifacts ?? [];
  const candidates = artifacts.filter((artifact) => artifact.context?.attemptId === attemptId);
  return candidates.find((artifact) => artifact.path?.split('/').at(-1) === 'boundary.json')
    ?? candidates.find((artifact) => artifact.context?.gateId === 'packetValidation' && artifact.path)
    ?? null;
}

export function gateArtifact(snapshot, attemptId, gateId) {
  return snapshot?.artifacts?.find((artifact) => (
    artifact.context?.attemptId === attemptId
    && artifact.context?.gateId === gateId
    && artifact.path !== null
  )) ?? null;
}

export function actionMeaning(command) {
  if (command === 'slice propose') return 'Define the next planned delivery slice from the authorized feature plan.';
  if (command.includes('begin-boundary')) return 'Freeze a PR context and begin the ordered boundary evidence gates.';
  if (command.includes('request-review')) return 'Pass current, nonblocking boundary evidence to human review.';
  if (command.includes('record-merge')) return 'Record that the exact reviewed content is present on the integration branch.';
  if (command.includes('approve-design')) return 'Record explicit human approval of the synthesized design.';
  if (command.includes('validate-spec')) return 'Record that the specification validator currently passes.';
  if (command.includes('authorize-plan')) return 'Authorize implementation from the approved plan and issue records.';
  if (command.includes('start')) return 'Begin implementation of this planned slice after readiness is verified.';
  if (command.includes('remediate')) return 'Return this boundary to implementation so findings can be resolved.';
  if (command.includes('finalize')) return 'Enter feature closeout after complete verification is current.';
  return 'Advance the workflow through this named governed passage when its prerequisites are satisfied.';
}

export function attemptLabel(attempt) {
  const suffix = attempt.context?.pullRequest ? ` · PR #${attempt.context.pullRequest}` : '';
  return `${humanize(attempt.id)}${suffix}`;
}

export function artifactContext(artifact) {
  const context = artifact.context ?? {};
  if (context.kind === 'gate') return `${humanize(context.gateId)} · ${context.attemptId}`;
  return humanize(context.kind ?? 'feature');
}

export function eventLabel(event) {
  return humanize(event.type);
}

export function formatTime(value) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
}

export function diagnosticCanShowGovernedViews(snapshot) {
  return snapshot?.projection !== null && snapshot?.projection !== undefined;
}
