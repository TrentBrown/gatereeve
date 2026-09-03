import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../../../plugin-src/shared/resources/release/release-conductor-state.js', import.meta.url);
const packaged = new URL('../../resources/release/release-conductor-state.js', import.meta.url);
const implementation = await import(existsSync(fileURLToPath(source)) ? source.href : packaged.href);

export const CONDUCTOR_STATE_KIND = implementation.CONDUCTOR_STATE_KIND;
export const CONDUCTOR_STATE_SCHEMA_VERSION = implementation.CONDUCTOR_STATE_SCHEMA_VERSION;
export const CONDUCTOR_STAGES = implementation.CONDUCTOR_STAGES;
export const canonicalConductorJson = implementation.canonicalConductorJson;
export const conductorStateArtifactName = implementation.conductorStateArtifactName;
export const createConductorState = implementation.createConductorState;
export const projectConductorStatus = implementation.projectConductorStatus;
export const releaseStateSha256 = implementation.releaseStateSha256;
export const renderConductorSummary = implementation.renderConductorSummary;
export const validateConductorState = implementation.validateConductorState;
export const validateConductorStateChain = implementation.validateConductorStateChain;
