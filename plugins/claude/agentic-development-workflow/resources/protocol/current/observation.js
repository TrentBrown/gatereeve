import { CONTRACT, PHASES, MILESTONES, object, requireThat, text } from './contracts.js';

export function validateSnapshot(value) {
  object(value, 'Current snapshot');
  requireThat(value.schemaVersion === 1 && value.contract === CONTRACT && ['governed', 'current-entry'].includes(value.mode), 'Unsupported current snapshot');
  text(value.featureId, 'Feature identity'); text(value.featureHome, 'Feature home');
  requireThat(Array.isArray(value.artifacts) && Array.isArray(value.obligations) && Array.isArray(value.milestones) && Array.isArray(value.blockers), 'Incomplete current snapshot');
  if (value.mode === 'governed') requireThat(value.current && PHASES.includes(value.current.phase), 'Invalid current phase');
  for (const milestone of value.milestones) requireThat(MILESTONES.includes(milestone.name) && typeof milestone.allowed === 'boolean' && Array.isArray(milestone.missing), 'Invalid milestone observation');
  for (const artifact of value.artifacts) requireThat(typeof artifact.id === 'string' && typeof artifact.exists === 'boolean' && typeof artifact.unsafe === 'boolean', 'Invalid artifact observation');
  return value;
}
export function validateDetail(value) {
  object(value, 'Current detail');
  requireThat(value.schemaVersion === 1 && ['artifact', 'events', 'model', 'result'].includes(value.kind), 'Unsupported current detail');
  object(value.data, 'Detail data');
  if (value.kind === 'artifact') requireThat(typeof value.data.content === 'string', 'Missing artifact content');
  if (value.kind === 'events') requireThat(Array.isArray(value.data.events), 'Missing event list');
  if (value.kind === 'model') requireThat(Array.isArray(value.data.phases) && Array.isArray(value.data.obligations), 'Missing current phase/obligation model');
  if (value.kind === 'result') requireThat(value.data.result?.contract === CONTRACT && value.data.receipt?.contract === CONTRACT, 'Missing bound result detail');
  return value;
}
