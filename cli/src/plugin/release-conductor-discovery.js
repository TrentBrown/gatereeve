import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../../../plugin-src/shared/resources/release/release-conductor-discovery.js', import.meta.url);
const packaged = new URL('../../resources/release/release-conductor-discovery.js', import.meta.url);
const implementation = await import(existsSync(fileURLToPath(source)) ? source.href : packaged.href);

export const discoverConductorState = implementation.discoverConductorState;
