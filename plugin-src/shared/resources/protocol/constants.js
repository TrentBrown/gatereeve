export const PROTOCOL_VERSION = '1.0.0';
export const MODEL_SCHEMA_VERSION = 1;
export const EVENT_SCHEMA_VERSION = 1;
export const RESULT_SCHEMA_VERSION = 1;

export const FEATURE_STATES = Object.freeze([
  'DESIGNING',
  'SPECIFYING',
  'PLANNING',
  'DELIVERING_SLICES',
  'FINALIZING',
  'COMPLETE',
  'ABANDONED_FEATURE',
]);

export const SLICE_STATES = Object.freeze([
  'PROPOSED',
  'PLANNED',
  'IMPLEMENTING',
  'PR_BOUNDARY',
  'HUMAN_REVIEW',
  'MERGED',
  'ABANDONED',
]);

export const CHANGE_STATES = Object.freeze([
  'PROPOSED',
  'APPROVED',
  'REJECTED',
  'APPLIED',
  'VALIDATED',
  'SUPERSEDED',
]);

export const CHANGE_TARGETS = Object.freeze([
  'design',
  'spec',
  'plan',
  'slice',
]);

export const GATE_OUTCOMES = Object.freeze([
  'UNSET',
  'PASS',
  'FAIL',
  'WAIVED',
  'NOT_APPLICABLE',
]);

export const GATE_FRESHNESS = Object.freeze([
  'CURRENT',
  'STALE',
  'UNKNOWN',
]);

export const BOUNDARY_SCOPES = Object.freeze(['SLICE', 'FEATURE_FINAL']);
export const AUTHORITIES = Object.freeze(['agent', 'human-confirmation', 'system']);
export const ACTOR_KINDS = Object.freeze(['agent', 'human-confirmed', 'system']);

export const EVENT_TYPES = Object.freeze([
  'FEATURE_INITIALIZED',
  'DESIGN_APPROVED',
  'SPEC_VALIDATED',
  'PLAN_AUTHORIZED',
  'IMPLEMENTATION_REAUTHORIZED',
  'FEATURE_PAUSED',
  'FEATURE_RESUMED',
  'FEATURE_ABANDONED',
  'FEATURE_FINALIZED',
  'MODEL_MIGRATED',
  'SLICE_PROPOSED',
  'SLICE_PLANNED',
  'SLICE_STARTED',
  'BOUNDARY_STARTED',
  'REMEDIATION_STARTED',
  'HUMAN_REVIEW_REQUESTED',
  'HUMAN_REVIEW_ACCEPTED',
  'HUMAN_REVIEW_CHANGES_REQUESTED',
  'SLICE_MERGE_RECORDED',
  'SLICE_ABANDONED',
  'GATE_OUTCOME_RECORDED',
  'GATE_WAIVER_RECORDED',
  'GATE_INVALIDATED',
  'CHANGE_PROPOSED',
  'CHANGE_APPROVED',
  'CHANGE_REJECTED',
  'CHANGE_APPLIED',
  'CHANGE_VALIDATED',
  'CHANGE_SUPERSEDED',
]);
