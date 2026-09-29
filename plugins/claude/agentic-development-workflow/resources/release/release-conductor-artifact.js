import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  canonicalConductorJson,
  projectConductorStatus,
  releaseStateSha256,
  renderConductorSummary,
  validateConductorState,
  validateConductorStateChain,
} from './release-conductor-state.js';

const STATE_FILE = 'release-state.json';
const CHAIN_FILE = 'release-state-chain.json';
const CHECKSUM_FILE = 'release-state.sha256';
const STATUS_FILE = 'release-status.json';
const SUMMARY_FILE = 'release-summary.md';

async function requireFreshDirectory(path) {
  await mkdir(path, { recursive: true });
  const entries = await readdir(path);
  if (entries.length !== 0) {
    throw new Error(`Release conductor output directory must be empty: ${path}`);
  }
}

export async function writeConductorStateBundle({ outputDirectory, chain }) {
  const records = validateConductorStateChain(chain);
  const state = records.at(-1);
  const status = projectConductorStatus(records);
  const summary = renderConductorSummary(status);
  const root = resolve(outputDirectory);
  await requireFreshDirectory(root);
  await Promise.all([
    writeFile(resolve(root, STATE_FILE), `${canonicalConductorJson(state)}\n`, { flag: 'wx' }),
    writeFile(resolve(root, CHAIN_FILE), `${canonicalConductorJson(records)}\n`, { flag: 'wx' }),
    writeFile(resolve(root, CHECKSUM_FILE), `${status.stateSha256}  ${STATE_FILE}\n`, { flag: 'wx' }),
    writeFile(resolve(root, STATUS_FILE), `${JSON.stringify(status, null, 2)}\n`, { flag: 'wx' }),
    writeFile(resolve(root, SUMMARY_FILE), summary, { flag: 'wx' }),
  ]);
  return {
    outputDirectory: root,
    state,
    status,
    summary,
    files: [STATE_FILE, CHAIN_FILE, CHECKSUM_FILE, STATUS_FILE, SUMMARY_FILE],
  };
}

export async function readConductorStateBundle(inputDirectory) {
  const root = resolve(inputDirectory);
  const [stateText, chainText, checksumText, statusText, summary] = await Promise.all([
    readFile(resolve(root, STATE_FILE), 'utf8'),
    readFile(resolve(root, CHAIN_FILE), 'utf8'),
    readFile(resolve(root, CHECKSUM_FILE), 'utf8'),
    readFile(resolve(root, STATUS_FILE), 'utf8'),
    readFile(resolve(root, SUMMARY_FILE), 'utf8'),
  ]);
  let state;
  let chain;
  let status;
  try {
    state = JSON.parse(stateText);
    chain = JSON.parse(chainText);
    status = JSON.parse(statusText);
  } catch (error) {
    throw new Error(`Release conductor bundle JSON is invalid: ${error.message}`, { cause: error });
  }
  validateConductorState(state);
  const records = validateConductorStateChain(chain);
  if (canonicalConductorJson(state) !== canonicalConductorJson(records.at(-1))) {
    throw new Error('Release conductor latest state differs from its chain');
  }
  if (stateText !== `${canonicalConductorJson(state)}\n`
    || chainText !== `${canonicalConductorJson(records)}\n`) {
    throw new Error('Release conductor state files are not canonical');
  }
  const expectedDigest = releaseStateSha256(state);
  if (checksumText !== `${expectedDigest}  ${STATE_FILE}\n`) {
    throw new Error('Release conductor state checksum differs');
  }
  const expectedStatus = projectConductorStatus(records);
  if (canonicalConductorJson(status) !== canonicalConductorJson(expectedStatus)) {
    throw new Error('Release conductor status differs from state');
  }
  const expectedSummary = renderConductorSummary(expectedStatus);
  if (summary !== expectedSummary) {
    throw new Error('Release conductor summary differs from state');
  }
  return { inputDirectory: root, chain: records, state, status, summary };
}

export const conductorBundleFiles = Object.freeze([
  STATE_FILE,
  CHAIN_FILE,
  CHECKSUM_FILE,
  STATUS_FILE,
  SUMMARY_FILE,
]);
