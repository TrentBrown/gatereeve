import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { resolve } from 'node:path';

import { Command } from 'qp-cli-core';

import { loadAndValidateContracts } from '../plugin/contracts.js';
import {
  assertCoordinatedPublicationReady,
  prepareCoordinatedRelease,
  publicationPlanSha256,
  readCoordinatedRelease,
  renderPublicationPlan,
  verifyCoordinatedReleaseWorkspace,
} from '../plugin/coordinated-release.js';
import { publishCoordinatedRelease } from '../plugin/coordinated-publication.js';
import { loadAndValidateNativeSources } from '../plugin/native.js';
import { lintPortability } from '../plugin/portability.js';
import { prepareRelease, validateReleaseEvidence } from '../plugin/release.js';
import {
  bundleMarketplaceRelease,
  formatReleaseList,
  formatVerification,
  getDeployedRelease,
  listReleases,
  publishRelease,
  verifyMarketplaceRelease,
  watchRelease,
} from '../plugin/release-operations.js';
import {
  planReleaseVersion,
  releaseChoices,
  validateDeployedRelease,
} from '../plugin/release-version.js';
import {
  homebrewCaskPlanSha256,
  prepareHomebrewCask,
  publishHomebrewCask,
  readHomebrewCaskRecord,
  renderHomebrewCaskPublicationPlan,
} from '../plugin/homebrew-cask.js';

function positiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

function releaseBump(value) {
  if (!['patch', 'minor', 'major'].includes(value)) {
    throw new Error(`Release bump must be patch, minor, or major: ${value}`);
  }
  return value;
}

function printPublishPlan(plan) {
  if (plan.releasePlan?.baselineTag) {
    console.log(`Current release: ${plan.releasePlan.baselineTag}`);
  }
  if (plan.releasePlan?.action) {
    const action =
      plan.releasePlan.action === 'bump'
        ? `${plan.releasePlan.bump} bump`
        : plan.releasePlan.action;
    console.log(`Version action: ${action}`);
  }
  console.log(`Release tag:    ${plan.tag}`);
  console.log(`Source commit: ${plan.sourceCommit}`);
  console.log(`Remote:        ${plan.remote}`);
  console.log(`Wait:          ${plan.wait ? 'yes' : 'no'}`);
  console.log(`Verify:        ${plan.verify ? 'yes' : 'no'}`);
  console.log('Validation:    contracts, portability, and native sources passed');
}

async function selectInteractiveRelease(deployedRelease) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error(
      'Release publication requires --tag, --next-rc, --promote, or --bump outside a TTY'
    );
  }
  const menu = releaseChoices(deployedRelease);
  const prompt = createInterface({ input, output });
  try {
    console.log(`Current deployed release: ${menu.baseline.tag}`);
    console.log(`Current source commit:     ${menu.baseline.sourceCommit}`);
    console.log('');
    console.log('Choose the next release:');
    for (const item of menu.choices) {
      const tag = item.plan?.tag ? `  ${item.plan.tag}` : '';
      console.log(`  ${item.key}. ${item.label}${tag}`);
    }
    const selected = (await prompt.question('Selection [1]: ')).trim() || '1';
    const choice = menu.choices.find((item) => item.key === selected);
    if (!choice) throw new Error(`Unknown release selection: ${selected}`);
    if (choice.plan) return choice.plan;
    const tag = (await prompt.question('Custom semantic tag: ')).trim();
    return planReleaseVersion({ action: 'tag', tag, deployedRelease });
  } finally {
    prompt.close();
  }
}

export async function resolveVersionPlan({
  repositoryRoot,
  options,
  loadDeployedRelease = getDeployedRelease,
  interactiveSelection = selectInteractiveRelease,
  interactiveTerminal = Boolean(input.isTTY && output.isTTY),
}) {
  const selectors = [
    options.tag ? 'tag' : null,
    options.nextRc ? 'next-rc' : null,
    options.promote ? 'promote' : null,
    options.bump ? 'bump' : null,
  ].filter(Boolean);
  if (selectors.length > 1) {
    throw new Error(
      'Choose only one of --tag, --next-rc, --promote, or --bump'
    );
  }
  if (selectors.length === 0) {
    if (options.yes || options.json || !interactiveTerminal) {
      throw new Error(
        'Release publication requires --tag, --next-rc, --promote, or --bump outside an interactive terminal'
      );
    }
    const deployedRelease = await loadDeployedRelease({ repositoryRoot });
    if (!deployedRelease) {
      throw new Error('No deployed marketplace release is available for version planning');
    }
    return interactiveSelection(deployedRelease);
  }

  if (selectors[0] === 'tag') {
    return planReleaseVersion({ action: 'tag', tag: options.tag });
  }
  if (options.commit) {
    throw new Error('--commit can be used only with an explicit --tag');
  }
  const deployedRelease = await loadDeployedRelease({ repositoryRoot });
  if (!deployedRelease) {
    throw new Error('No deployed marketplace release is available for version planning');
  }
  return planReleaseVersion({
    deployedRelease,
    action: selectors[0],
    bump: options.bump,
  });
}

export async function resolveVerificationTag({
  repositoryRoot,
  tag = null,
  loadDeployedRelease = getDeployedRelease,
}) {
  if (tag) return planReleaseVersion({ action: 'tag', tag }).tag;
  const deployedRelease = await loadDeployedRelease({ repositoryRoot });
  if (!deployedRelease) {
    throw new Error('No deployed marketplace release is available to verify');
  }
  return validateDeployedRelease(deployedRelease).tag;
}

async function confirmPublish(plan) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('Interactive confirmation requires a TTY; rerun with --yes');
  }
  const prompt = createInterface({ input, output });
  try {
    const answer = await prompt.question(
      `Create and push ${plan.tag} at ${plan.sourceCommit.slice(0, 12)}? [y/N] `
    );
    return /^(?:y|yes)$/i.test(answer.trim());
  } finally {
    prompt.close();
  }
}

async function validateReleaseSources(
  sourceRoot,
  sourceTag,
  ubuntuRcEvidencePath,
  sourceCommit,
  coordinatedReleasePath
) {
  const [contracts, portability, native, releaseEvidence, coordinatedRelease] = await Promise.all([
    loadAndValidateContracts(sourceRoot),
    lintPortability(sourceRoot),
    loadAndValidateNativeSources(sourceRoot),
    validateReleaseEvidence({ sourceTag, ubuntuRcEvidencePath, sourceCommit }),
    verifyCoordinatedReleaseWorkspace(coordinatedReleasePath),
  ]);
  assertCoordinatedPublicationReady(coordinatedRelease, {
    tag: sourceTag,
    sourceCommit,
  });
  return {
    contracts: { skillCount: contracts.skillCount },
    portability: {
      skillCount: portability.existingSkillCount,
      fileCount: portability.fileCount,
    },
    native: {
      plugin: native.plugin,
      version: native.version,
      platforms: native.platforms,
    },
    releaseEvidence: releaseEvidence
      ? {
          releaseCandidate: releaseEvidence.releaseCandidate,
          candidateSourceCommit: releaseEvidence.candidateSourceCommit,
          ubuntuVersion: releaseEvidence.ubuntu.version,
        }
      : null,
    coordinatedRelease: {
      releaseId: coordinatedRelease.releaseId,
      recordPath: resolve(coordinatedReleasePath),
      planSha256: coordinatedRelease.publication.approval.planSha256,
      pluginSha256: coordinatedRelease.candidates.plugin.artifact.sha256,
      desktopSha256: coordinatedRelease.candidates.desktop.artifact.sha256,
    },
  };
}

export function releaseCommands({ repositoryRoot }) {
  const release = new Command('release').description(
    'Publish, observe, and verify native plugin releases'
  );

  release
    .command('publish')
    .description('Validate, tag, watch, and verify a marketplace release')
    .option('--tag <tag>', 'Exact semantic-version source tag')
    .option('--next-rc', 'Create the next release candidate')
    .option('--promote', 'Promote the deployed release candidate to stable')
    .option(
      '--bump <type>',
      'Begin a patch (bug fix), minor, or major release line at rc.1',
      releaseBump
    )
    .option('--commit <commit>', 'Source commit (default: origin/main)')
    .option('--source-root <path>', 'Plugin source root', resolve(repositoryRoot, 'plugin-src'))
    .option(
      '--ubuntu-rc-evidence <path>',
      'Required evidence for a stable release',
      resolve(repositoryRoot, 'docs/releases/ubuntu-rc.json')
    )
    .requiredOption(
      '--release-record <path>',
      'Approved coordinated Plugin/Desktop release record'
    )
    .option('--dry-run', 'Validate and show the publication plan without mutation')
    .option('--yes', 'Skip interactive confirmation')
    .option('--no-wait', 'Return after pushing the release tag')
    .option('--no-verify', 'Skip deployed-marketplace verification')
    .option('--json', 'Print machine-readable publication results')
    .action(async (options) => {
      if (options.json && !options.yes && !options.dryRun) {
        throw new Error('--json requires --yes or --dry-run to keep output machine-readable');
      }
      const versionPlan = await resolveVersionPlan({ repositoryRoot, options });
      const configuredSourceRoot = resolve(options.sourceRoot);
      const canonicalSourceRoot = resolve(repositoryRoot, 'plugin-src');
      const sourceRootFor = (validationRepositoryRoot) => {
        if (configuredSourceRoot === canonicalSourceRoot) {
          return resolve(validationRepositoryRoot, 'plugin-src');
        }
        if (resolve(validationRepositoryRoot) !== resolve(repositoryRoot)) {
          throw new Error(
            'Historical release validation requires the canonical repository plugin-src'
          );
        }
        return configuredSourceRoot;
      };
      let result;
      try {
        result = await publishRelease({
          repositoryRoot,
          tag: versionPlan.tag,
          commit: versionPlan.sourceCommit ?? options.commit,
          dryRun: options.dryRun,
          yes: options.yes,
          wait: options.wait,
          verify: options.verify,
          json: options.json,
          validate: ({ repositoryRoot: validationRepositoryRoot, sourceCommit }) =>
            validateReleaseSources(
              sourceRootFor(validationRepositoryRoot),
              versionPlan.tag,
              resolve(options.ubuntuRcEvidence),
              sourceCommit,
              resolve(options.releaseRecord)
            ),
          confirm: confirmPublish,
          onPlan: options.json ? () => {} : printPublishPlan,
          requireHeadMatch: versionPlan.source !== 'deployed-rc',
          releasePlan: versionPlan,
        });
      } catch (error) {
        if (error?.deployment) {
          console.log(
            options.json
              ? JSON.stringify(error.deployment, null, 2)
              : formatVerification(error.deployment)
          );
          error.reported = true;
        }
        throw error;
      }

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.cancelled) {
        console.log('Release cancelled; no tag was created.');
      } else if (result.dryRun) {
        console.log('Dry run complete; no tag was created.');
      } else if (!result.run) {
        console.log(`Published ${result.tag}; release workflow will continue on GitHub.`);
      } else {
        console.log(
          `Published ${result.tag}; workflow ${result.run.databaseId} ` +
            `${result.run.conclusion ?? result.run.status}.`
        );
        if (result.deployment) console.log(formatVerification(result.deployment));
      }
    });

  release
    .command('coordinate')
    .description('Create an immutable record from verified Plugin and Desktop candidates')
    .requiredOption('--tag <tag>', 'Eventual semantic-version source tag')
    .requiredOption('--source-commit <commit>', 'Immutable source commit')
    .requiredOption('--repository <repository>', 'Canonical source repository URL')
    .requiredOption('--plugin-root <path>', 'Prepared Plugin marketplace candidate')
    .requiredOption('--desktop-dmg <path>', 'Verified universal Desktop DMG')
    .requiredOption(
      '--desktop-evidence <paths...>',
      'ARM64 and Intel Desktop verification evidence files'
    )
    .requiredOption('--output-root <path>', 'Fresh coordinated release workspace')
    .option(
      '--current-update-manifest <path>',
      'Current project-controlled Desktop update manifest',
      resolve(repositoryRoot, 'workflow-site/releases/desktop.json')
    )
    .option('--promote-from <path>', 'Coordinated RC record for stable-source proof')
    .option('--json', 'Print machine-readable release results')
    .action(async (options) => {
      const result = await prepareCoordinatedRelease({
        sourceTag: options.tag,
        sourceCommit: options.sourceCommit,
        repository: options.repository,
        pluginRoot: resolve(options.pluginRoot),
        desktopDmgPath: resolve(options.desktopDmg),
        desktopEvidencePaths: options.desktopEvidence.map((path) => resolve(path)),
        currentUpdateManifestPath: resolve(options.currentUpdateManifest),
        outputRoot: resolve(options.outputRoot),
        stablePromotionRecord: options.promoteFrom
          ? await readCoordinatedRelease(resolve(options.promoteFrom))
          : null,
      });
      if (options.json) {
        console.log(JSON.stringify({
          schemaVersion: result.schemaVersion,
          outputRoot: result.outputRoot,
          recordPath: result.recordPath,
          planPath: result.planPath,
          planSha256: result.planSha256,
          releaseId: result.record.releaseId,
          state: result.record.state,
        }, null, 2));
      } else {
        console.log(`Prepared ${result.record.releaseId} in ${result.outputRoot}`);
        console.log(`Publication plan: ${result.planPath}`);
        console.log(`Plan SHA-256: ${result.planSha256}`);
        console.log('Public publication remains blocked pending Apple trust and exact approval.');
      }
    });

  release
    .command('inspect-record')
    .description('Inspect a coordinated release record and exact publication plan')
    .requiredOption('--release-record <path>', 'Coordinated release record')
    .option('--json', 'Print machine-readable release state')
    .action(async (options) => {
      const record = await readCoordinatedRelease(resolve(options.releaseRecord));
      if (options.json) {
        console.log(JSON.stringify({
          record,
          planSha256: publicationPlanSha256(record),
        }, null, 2));
      } else {
        console.log(renderPublicationPlan(record));
        console.log(`Plan SHA-256: ${publicationPlanSha256(record)}`);
      }
    });

  release
    .command('publish-coordinated')
    .description('Publish or recover one exact approved Plugin/Desktop release record')
    .requiredOption('--release-record <path>', 'Trusted coordinated release record')
    .requiredOption('--plan-sha256 <digest>', 'Exact reviewed publication-plan SHA-256')
    .option('--approved-by <identity>', 'Human publication approver identity')
    .option('--confirm', 'Confirm the exact reviewed plan and permit public mutation')
    .option('--dry-run', 'Run read-only remote preflights without approval or mutation')
    .option('--json', 'Print machine-readable publication results')
    .action(async (options) => {
      if (options.confirm && options.dryRun) {
        throw new Error('Choose either --confirm or --dry-run');
      }
      if (!options.confirm && !options.dryRun) {
        throw new Error('Publication requires --confirm or --dry-run');
      }
      if (options.confirm && !options.approvedBy) {
        throw new Error('Publication confirmation requires --approved-by');
      }
      const result = await publishCoordinatedRelease({
        recordPath: resolve(options.releaseRecord),
        repositoryRoot,
        planSha256: options.planSha256,
        approvedBy: options.approvedBy ?? '',
        confirm: options.confirm,
        dryRun: options.dryRun,
      });
      const output = {
        schemaVersion: 1,
        dryRun: result.dryRun,
        releaseId: result.record.releaseId,
        state: result.record.state,
        planSha256: result.planSha256,
        surfaces: result.record.publication.surfaces,
      };
      if (options.json) console.log(JSON.stringify(output, null, 2));
      else if (result.dryRun) {
        console.log(`Preflight passed for ${result.record.releaseId}; no public mutation occurred.`);
      } else {
        console.log(`Published ${result.record.releaseId} through every coordinated surface.`);
      }
    });

  release
    .command('prepare-cask')
    .description('Prepare an exact Homebrew Cask packet from a proven coordinated RC')
    .requiredOption('--release-record <path>', 'Trusted coordinated release record workspace')
    .requiredOption('--output-root <path>', 'Fresh Homebrew Cask packet directory')
    .requiredOption(
      '--direct-install-confirmed-by <identity>',
      'Person who installed and launched the direct DMG'
    )
    .requiredOption(
      '--direct-install-confirmed-at <timestamp>',
      'ISO timestamp for the direct DMG installation proof'
    )
    .option('--json', 'Print machine-readable preparation results')
    .action(async (options) => {
      const result = await prepareHomebrewCask({
        releaseRecordPath: resolve(options.releaseRecord),
        outputRoot: resolve(options.outputRoot),
        directInstallConfirmedBy: options.directInstallConfirmedBy,
        directInstallConfirmedAt: options.directInstallConfirmedAt,
      });
      const output = {
        schemaVersion: result.record.schemaVersion,
        outputRoot: result.outputRoot,
        recordPath: result.recordPath,
        planPath: result.planPath,
        caskPath: result.caskPath,
        planSha256: result.planSha256,
        caskReleaseId: result.record.caskReleaseId,
        state: result.record.state,
      };
      if (options.json) console.log(JSON.stringify(output, null, 2));
      else {
        console.log(`Prepared ${result.record.caskReleaseId} in ${result.outputRoot}`);
        console.log(`Publication plan: ${result.planPath}`);
        console.log(`Plan SHA-256: ${result.planSha256}`);
        console.log('Public tap creation and Cask publication remain blocked pending exact approval.');
      }
    });

  release
    .command('inspect-cask')
    .description('Inspect an exact Homebrew Cask publication packet')
    .requiredOption('--cask-record <path>', 'Homebrew Cask publication record')
    .option('--json', 'Print machine-readable Cask state')
    .action(async (options) => {
      const record = await readHomebrewCaskRecord(resolve(options.caskRecord));
      if (options.json) {
        console.log(JSON.stringify({
          record,
          planSha256: homebrewCaskPlanSha256(record),
        }, null, 2));
      } else {
        console.log(renderHomebrewCaskPublicationPlan(record));
        console.log(`Plan SHA-256: ${homebrewCaskPlanSha256(record)}`);
      }
    });

  release
    .command('publish-cask')
    .description('Publish or recover one exact approved GateReeve Homebrew Cask')
    .requiredOption('--cask-record <path>', 'Homebrew Cask publication record')
    .requiredOption('--plan-sha256 <digest>', 'Exact reviewed Cask plan SHA-256')
    .option('--approved-by <identity>', 'Human Cask publication approver identity')
    .option('--confirm', 'Confirm the exact plan and permit public tap mutation')
    .option('--dry-run', 'Run read-only remote preflights without mutation')
    .option('--json', 'Print machine-readable publication results')
    .action(async (options) => {
      if (options.confirm && options.dryRun) throw new Error('Choose either --confirm or --dry-run');
      if (!options.confirm && !options.dryRun) {
        throw new Error('Homebrew Cask publication requires --confirm or --dry-run');
      }
      if (options.confirm && !options.approvedBy) {
        throw new Error('Homebrew Cask publication confirmation requires --approved-by');
      }
      const result = await publishHomebrewCask({
        recordPath: resolve(options.caskRecord),
        planSha256: options.planSha256,
        approvedBy: options.approvedBy ?? '',
        confirm: Boolean(options.confirm),
        dryRun: Boolean(options.dryRun),
      });
      const output = {
        schemaVersion: result.record.schemaVersion,
        dryRun: result.dryRun,
        caskReleaseId: result.record.caskReleaseId,
        state: result.record.state,
        planSha256: result.planSha256,
        tapState: result.tapState,
        surface: result.record.publication.surface,
      };
      if (options.json) console.log(JSON.stringify(output, null, 2));
      else if (result.dryRun) {
        console.log(`Preflight passed for ${result.record.caskReleaseId}; no public mutation occurred.`);
      } else {
        console.log(`Published ${result.record.caskReleaseId} to ${result.record.cask.repository}.`);
      }
    });

  release
    .command('list')
    .description('List release tags, workflow runs, and deployed marketplace state')
    .option('--limit <count>', 'Maximum releases to display', positiveInteger, 10)
    .option('--status <status>', 'Filter GitHub Actions runs by status')
    .option('--json', 'Print machine-readable release results')
    .action(async (options) => {
      const result = await listReleases({
        repositoryRoot,
        limit: options.limit,
        status: options.status,
      });
      console.log(options.json ? JSON.stringify(result, null, 2) : formatReleaseList(result));
    });

  release
    .command('watch')
    .description('Watch the latest or selected release workflow run')
    .option('--tag <tag>', 'Release tag whose workflow should be watched')
    .option('--run-id <id>', 'Explicit GitHub Actions run ID')
    .option('--json', 'Suppress streaming output and print the final run as JSON')
    .action(async (options) => {
      if (options.tag && options.runId) {
        throw new Error('Choose either --tag or --run-id, not both');
      }
      const result = await watchRelease({
        repositoryRoot,
        tag: options.tag,
        runId: options.runId,
        json: options.json,
      });
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(
          `Release workflow ${result.databaseId}: ` +
            `${result.conclusion ?? result.status} (${result.url})`
        );
      }
    });

  release
    .command('verify')
    .description('Verify a complete remote marketplace deployment')
    .option('--tag <tag>', 'Release tag expected in the marketplace')
    .option('--json', 'Print machine-readable verification results')
    .action(async (options) => {
      const tag = await resolveVerificationTag({
        repositoryRoot,
        tag: options.tag,
      });
      const result = await verifyMarketplaceRelease({
        repositoryRoot,
        tag,
      });
      console.log(options.json ? JSON.stringify(result, null, 2) : formatVerification(result));
      if (!result.complete) {
        const error = new Error(`Marketplace deployment for ${tag} is incomplete`);
        error.exitCode = 1;
        error.reported = true;
        throw error;
      }
    });

  release
    .command('bundle')
    .description('Create an offline ZIP from a verified deployed release')
    .option('--tag <tag>', 'Release tag to bundle (default: deployed release)')
    .option(
      '--output-dir <path>',
      'Directory for the ZIP and checksum',
      resolve(repositoryRoot, 'dist/releases')
    )
    .option('--force', 'Replace an existing ZIP and checksum for this version')
    .option('--json', 'Print machine-readable bundle results')
    .action(async (options) => {
      const tag = await resolveVerificationTag({
        repositoryRoot,
        tag: options.tag,
      });
      let result;
      try {
        result = await bundleMarketplaceRelease({
          repositoryRoot,
          tag,
          outputDirectory: resolve(options.outputDir),
          force: options.force,
        });
      } catch (error) {
        if (error?.deployment) {
          console.log(
            options.json
              ? JSON.stringify(error.deployment, null, 2)
              : formatVerification(error.deployment)
          );
          error.reported = true;
        }
        throw error;
      }

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`Bundled ${result.tag}`);
      console.log(`Source commit:      ${result.sourceCommit}`);
      console.log(`Marketplace commit: ${result.marketplaceCommit}`);
      console.log(`Archive:            ${result.archivePath}`);
      console.log(`Checksum:           ${result.checksumPath}`);
      console.log(`SHA-256:            ${result.sha256}`);
      console.log('');
      console.log('Codex installation:');
      for (const command of result.installation.codex) console.log(`  ${command}`);
      console.log('Claude installation:');
      for (const command of result.installation.claude) console.log(`  ${command}`);
    });

  release
    .command('prepare')
    .description('Compose a tag-scoped marketplace tree for atomic publication')
    .requiredOption('--tag <tag>', 'Semantic-version source tag')
    .requiredOption('--source-commit <commit>', 'Tagged source commit')
    .requiredOption('--output-root <path>', 'Fresh release output directory')
    .option('--source-root <path>', 'Plugin source root', resolve(repositoryRoot, 'plugin-src'))
    .option('--ubuntu-rc-evidence <path>', 'Required evidence for a stable release')
    .option('--json', 'Print machine-readable release results')
    .action(async (options) => {
      const result = await prepareRelease({
        sourceRoot: resolve(options.sourceRoot),
        outputRoot: resolve(options.outputRoot),
        sourceTag: options.tag,
        sourceCommit: options.sourceCommit,
        ubuntuRcEvidencePath: options.ubuntuRcEvidence,
      });
      console.log(
        options.json
          ? JSON.stringify(result, null, 2)
          : `Prepared ${result.sourceTag} in ${result.outputRoot}`
      );
    });

  return release;
}
