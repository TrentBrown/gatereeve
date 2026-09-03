#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  abandonFeature,
  abandonSlice,
  acceptHumanReview,
  check,
  explain,
  completeFinalizedFeature,
  failureResult,
  graphFeature,
  graphModel,
  history,
  initializeFeature,
  invalidateGates,
  invalidateFinalizationModules,
  migrateFeatureModel,
  recordFinalizationOutcome,
  recordFinalizationWaiver,
  next,
  pauseFeature,
  previewFeatureModelMigration,
  proposeChange,
  proposeSlice,
  readFeatureRecord,
  reauthorizeImplementation,
  recordChangeTransition,
  recordFeatureTransition,
  recordGateOutcome,
  recordGateWaiver,
  recordSliceTransition,
  requestBoundaryHumanReview,
  readDetail,
  resolveWorkflowContext,
  resumeFeature,
  snapshot,
  startFeatureFinalization,
  status,
  successResult,
} from './index.js';

async function resolvedRequest(request) {
  if (request.operation === 'graph.model') return request;
  if (request.featureHome) return request;
  const context = await resolveWorkflowContext({
    cwd: request.cwd,
    repository: request.repository,
  });
  return { ...request, featureHome: context.featureHome, context };
}

function mutationResult(operation, result) {
  return successResult(operation, result);
}

async function executeResolvedPluginRequest(rawRequest) {
  const request = await resolvedRequest({ cwd: process.cwd(), ...rawRequest });
  const { featureHome, operation } = request;
  switch (operation) {
    case 'status':
      return status(featureHome, request.options);
    case 'snapshot':
      return snapshot(featureHome, request.options);
    case 'read':
      return readDetail(featureHome, request.kind, request.id ?? null, request.options);
    case 'next':
      return next(featureHome, request.options);
    case 'history':
      return history(featureHome);
    case 'explain':
      return explain(featureHome, request.target, request.options);
    case 'check':
      return check(featureHome, request.assertion, request.options);
    case 'graph':
      return graphFeature(featureHome, request.options);
    case 'graph.model':
      return graphModel();
    case 'feature.init':
      return mutationResult(
        operation,
        await initializeFeature({
          featureHome,
          featureId: request.context?.featureId ?? request.featureId,
          repositoryRoot: request.context?.repository?.path ?? request.cwd ?? null,
          actor: request.actor,
          recordedAt: request.recordedAt,
          eventId: request.eventId,
        })
      );
    case 'feature.transition':
      return mutationResult(
        operation,
        await recordFeatureTransition(featureHome, request.transitionId, request.input)
      );
    case 'feature.abandon':
      return mutationResult(operation, await abandonFeature(featureHome, request.input));
    case 'feature.pause':
      return mutationResult(operation, await pauseFeature(featureHome, request.input));
    case 'feature.resume':
      return mutationResult(operation, await resumeFeature(featureHome, request.input));
    case 'feature.migrate-model':
      return mutationResult(
        operation,
        await migrateFeatureModel({ featureHome, ...request.input })
      );
    case 'feature.migration-impact':
      return mutationResult(
        operation,
        await previewFeatureModelMigration({ featureHome, ...request.input })
      );
    case 'slice.propose':
      return mutationResult(operation, await proposeSlice(featureHome, request.input));
    case 'slice.transition':
      return mutationResult(
        operation,
        await recordSliceTransition(
          featureHome,
          request.transitionId,
          request.sliceId,
          request.input
        )
      );
    case 'slice.abandon':
      return mutationResult(
        operation,
        await abandonSlice(featureHome, request.sliceId, request.input)
      );
    case 'slice.accept-review':
      return mutationResult(
        operation,
        await acceptHumanReview(featureHome, request.sliceId, request.input)
      );
    case 'boundary.request-review':
      return mutationResult(
        operation,
        await requestBoundaryHumanReview(featureHome, request.input)
      );
    case 'gate.record':
      return mutationResult(operation, await recordGateOutcome(featureHome, request.input));
    case 'gate.waive':
      return mutationResult(operation, await recordGateWaiver(featureHome, request.input));
    case 'gate.invalidate':
      return mutationResult(operation, await invalidateGates(featureHome, request.input));
    case 'finalization.start':
      return mutationResult(operation, await startFeatureFinalization(featureHome, request.input));
    case 'finalization.record':
      return mutationResult(operation, await recordFinalizationOutcome(featureHome, request.input));
    case 'finalization.waive':
      return mutationResult(operation, await recordFinalizationWaiver(featureHome, request.input));
    case 'finalization.invalidate':
      return mutationResult(operation, await invalidateFinalizationModules(featureHome, request.input));
    case 'finalization.complete':
      return mutationResult(operation, await completeFinalizedFeature(featureHome, request.input));
    case 'change.propose':
      return mutationResult(operation, await proposeChange(featureHome, request.input));
    case 'change.transition':
      return mutationResult(
        operation,
        await recordChangeTransition(
          featureHome,
          request.transitionId,
          request.changeId,
          request.input
        )
      );
    case 'change.reauthorize':
      return mutationResult(
        operation,
        await reauthorizeImplementation(featureHome, request.input)
      );
    case 'record': {
      const record = await readFeatureRecord(featureHome);
      return successResult(operation, record);
    }
    default:
      return failureResult(
        operation ?? 'unknown',
        new Error(`Unknown plugin protocol operation: ${operation}`)
      );
  }
}

export async function executePluginRequest(rawRequest) {
  const operation = rawRequest?.operation ?? 'unknown';
  try {
    return await executeResolvedPluginRequest(rawRequest);
  } catch (error) {
    return failureResult(operation, error);
  }
}

async function readRequest(argv) {
  if (argv[2] === '--request-file') {
    return JSON.parse(await readFile(argv[3], 'utf8'));
  }
  if (argv[2] === 'status') {
    const cwdIndex = argv.indexOf('--cwd');
    return {
      operation: 'status',
      cwd: cwdIndex === -1 ? process.cwd() : argv[cwdIndex + 1],
    };
  }
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input);
}

async function main(argv) {
  let result;
  try {
    result = await executePluginRequest(await readRequest(argv));
  } catch (error) {
    result = failureResult('plugin-adapter', error);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv);
}
