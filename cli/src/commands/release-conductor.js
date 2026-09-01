import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { Command, Option } from 'commander';

import {
  readConductorStateBundle,
  writeConductorStateBundle,
} from '../plugin/release-conductor-artifact.js';
import {
  CONDUCTOR_STAGES,
  conductorStateArtifactName,
  createConductorState,
  projectConductorStatus,
  renderConductorSummary,
  validateConductorStateChain,
} from '../plugin/release-conductor-state.js';
import { discoverConductorState } from '../plugin/release-conductor-discovery.js';

const execFileAsync = promisify(execFile);

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${label} JSON at ${path}: ${error.message}`, { cause: error });
  }
}

function positiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

async function gitIsAncestor(ancestor, descendant) {
  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch (error) {
    if (error.code === 1) return false;
    throw error;
  }
}

export function releaseConductorCommands() {
  const conductor = new Command('conductor').description(
    'Create and inspect immutable hosted release orchestration state'
  );

  conductor
    .command('advance')
    .description('Append one validated Release Conductor state and render its bundle')
    .addOption(new Option('--stage <stage>', 'Lifecycle stage').choices(CONDUCTOR_STAGES).makeOptionMandatory())
    .option('--previous-chain <path>', 'Prior release-state-chain.json; omit only for INITIALIZED')
    .option('--tag <tag>', 'Fresh RC tag; required for INITIALIZED')
    .option('--source-commit <sha>', 'Pinned source SHA; required for INITIALIZED')
    .requiredOption('--evidence-file <path>', 'JSON object containing cumulative stage evidence')
    .option('--failure-file <path>', 'JSON failure object for a nonadvancing failed attempt')
    .requiredOption('--run-id <id>', 'GitHub Actions run ID')
    .option('--run-attempt <number>', 'GitHub Actions run attempt', positiveInteger, 1)
    .requiredOption('--repository <owner/name>', 'GitHub repository identity')
    .requiredOption('--workflow-ref <ref>', 'GitHub reusable workflow reference')
    .requiredOption('--actor <login>', 'Authenticated GitHub actor')
    .option('--recorded-at <timestamp>', 'Event timestamp')
    .requiredOption('--output-dir <path>', 'Fresh output directory for the state bundle')
    .option('--json', 'Print the machine-readable latest status')
    .action(async (options) => {
      const previousChain = options.previousChain
        ? validateConductorStateChain(await readJson(options.previousChain, 'previous state chain'))
        : [];
      if (previousChain.length === 0 && options.stage !== 'INITIALIZED') {
        throw new Error('--previous-chain is required after INITIALIZED');
      }
      if (previousChain.length > 0 && (options.tag || options.sourceCommit)) {
        throw new Error('--tag and --source-commit are accepted only for INITIALIZED');
      }
      const state = createConductorState({
        previous: previousChain.at(-1) ?? null,
        tag: options.tag,
        sourceCommit: options.sourceCommit,
        stage: options.stage,
        evidence: await readJson(options.evidenceFile, 'evidence'),
        run: {
          id: options.runId,
          attempt: options.runAttempt,
          repository: options.repository,
          workflowRef: options.workflowRef,
        },
        actor: { login: options.actor },
        recordedAt: options.recordedAt ?? new Date().toISOString(),
        failure: options.failureFile
          ? await readJson(options.failureFile, 'failure')
          : null,
      });
      const chain = [...previousChain, state];
      const bundle = await writeConductorStateBundle({
        outputDirectory: options.outputDir,
        chain,
      });
      const value = {
        artifactName: conductorStateArtifactName(state),
        outputDirectory: bundle.outputDirectory,
        status: bundle.status,
      };
      console.log(options.json ? JSON.stringify(value, null, 2) : bundle.summary);
    });

  conductor
    .command('inspect')
    .description('Verify a Release Conductor state bundle and display its status')
    .requiredOption('--bundle <path>', 'State bundle directory')
    .option('--json', 'Print machine-readable status')
    .action(async (options) => {
      const bundle = await readConductorStateBundle(options.bundle);
      const status = projectConductorStatus(bundle.chain);
      console.log(options.json ? JSON.stringify(status, null, 2) : renderConductorSummary(status));
    });

  conductor
    .command('discover')
    .description('Select and verify the unique latest state for a tag from downloaded evidence')
    .requiredOption('--tag <tag>', 'Exact RC tag to resume')
    .requiredOption('--artifacts-file <path>', 'Normalized GitHub artifact metadata JSON')
    .requiredOption('--output-chain <path>', 'Destination for the validated canonical chain')
    .option('--json', 'Print machine-readable discovery status')
    .action(async (options) => {
      const artifacts = await readJson(options.artifactsFile, 'artifact metadata');
      const discovery = await discoverConductorState({
        tag: options.tag,
        listArtifacts: async () => artifacts,
        readArtifactState: async (artifact) => readJson(
          resolve(artifact.bundlePath, 'release-state.json'),
          `artifact ${artifact.id} state`,
        ),
        isAncestor: gitIsAncestor,
      });
      await writeFile(
        resolve(options.outputChain),
        `${JSON.stringify(discovery.chain)}\n`,
        { flag: 'wx' },
      );
      const value = {
        latestArtifact: discovery.artifacts.at(-1).artifact,
        status: discovery.status,
      };
      console.log(options.json ? JSON.stringify(value, null, 2) : renderConductorSummary(value.status));
    });

  return conductor;
}
