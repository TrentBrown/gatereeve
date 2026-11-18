import { identity, requireThat, text } from './contracts.js';
import { HIGH_CAPABILITY_PROFILE, validateEvaluatorCapability } from '../agent-workflow.js';

// Selection is an observed agent decision, not a version registry. The host
// supplies discovery and model-class judgments; native execution must still
// establish operational availability and the actual evaluator identity.
const FAMILIES = Object.freeze({ codex: 'openai', 'claude-code': 'anthropic' });
export const modelProvider = provider => FAMILIES[provider] ?? null;

export function reviewerSelection(input) {
  requireThat(input && Object.keys(input).every(key => ['observations', 'reviewers', 'reason', 'instruction', 'previous'].includes(key)), 'Unsupported reviewer selection field');
  text(input.reason, 'Reviewer selection rationale');
  requireThat(Array.isArray(input.observations) && input.observations.length > 0, 'Reviewer selection needs current discovery observations');
  requireThat(Array.isArray(input.reviewers) && input.reviewers.length === 2, 'Select exactly two boundary reviewers');
  const observations = input.observations.map(observation => {
    requireThat(observation && Object.keys(observation).every(key => ['provider', 'model', 'reasoningEfforts', 'modelClass', 'basis', 'source'].includes(key)), 'Unsupported discovery observation');
    requireThat(modelProvider(observation.provider), 'Discovery needs a supported native provider');
    text(observation.model, 'Discovered model');
    text(observation.source, 'Discovery source');
    requireThat(['documented', 'agent-judgment'].includes(observation.basis), 'Label documented capability or agent judgment explicitly');
    requireThat(['economy', 'standard', 'premium', 'unknown'].includes(observation.modelClass), 'Unknown model class');
    requireThat(Array.isArray(observation.reasoningEfforts) && observation.reasoningEfforts.length > 0, 'Discovered reasoning options are required');
    observation.reasoningEfforts.forEach(effort => text(effort, 'Reasoning option'));
    return structuredClone(observation);
  });
  requireThat(new Set(observations.map(row => identity([row.provider, row.model]))).size === observations.length, 'Duplicate discovered model');
  const reviewers = input.reviewers.map(reviewer => {
    requireThat(reviewer && Object.keys(reviewer).every(key => ['provider', 'model', 'reasoningEffort', 'reason'].includes(key)), 'Unsupported selected reviewer field');
    const observation = observations.find(row => row.provider === reviewer.provider && row.model === reviewer.model);
    requireThat(observation, 'Selected reviewer was not discovered');
    validateEvaluatorCapability(HIGH_CAPABILITY_PROFILE, reviewer.reasoningEffort);
    requireThat(observation.reasoningEfforts.includes(reviewer.reasoningEffort), 'Selected reasoning effort was not discovered');
    text(reviewer.reason, 'Reviewer model-class choice rationale');
    return { ...structuredClone(reviewer), modelProvider: modelProvider(reviewer.provider) };
  });
  requireThat(new Set(reviewers.map(row => row.modelProvider)).size === 2, 'Boundary reviewers must use different model providers');
  if (input.instruction !== undefined) text(input.instruction, 'Explicit reviewer instruction');
  if (input.previous !== undefined) text(input.previous, 'Previous selection identity');
  return { observations, reviewers, reason: input.reason, ...(input.instruction ? { instruction: input.instruction } : {}), ...(input.previous ? { previous: input.previous } : {}),
    availability: 'discovered; execution not yet established' };
}
