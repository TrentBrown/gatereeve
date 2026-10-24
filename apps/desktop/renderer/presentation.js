export function humanize(value) {
  if (value === null || value === undefined || value === '') return 'None';
  return String(value)
    .replaceAll(/[._:-]+/g, ' ')
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function sourceLabel(name, source) {
  const status = source?.status ?? 'not-checked';
  const detail = source?.detail ? ` — ${source.detail}` : '';
  const label = name === 'github' ? 'GitHub' : humanize(name);
  return { name: label, status, text: `${humanize(status)}${detail}` };
}

export const featureStateLabel = humanize;

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
  return snapshot?.contract === 'gatereeve/current/2';
}
