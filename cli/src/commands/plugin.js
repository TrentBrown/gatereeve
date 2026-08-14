import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command, Option } from 'qp-cli-core';

import { composePackages } from '../plugin/compose.js';
import { loadAndValidateContracts } from '../plugin/contracts.js';
import { lintPortability } from '../plugin/portability.js';
import { loadAndValidateNativeSources } from '../plugin/native.js';
import { runNativeInstallSmoke } from '../plugin/smoke.js';
import { releaseCommands } from './release.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, '../../..');

async function defaultVersion(sourceRoot) {
  const inventoryPath = resolve(
    sourceRoot,
    'contracts/workflow-inventory.json'
  );
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
  return inventory.plugin.initialVersion;
}

function currentCommit() {
  return execFileSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
}

function printBuildResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const item of result.packages) {
    console.log(
      `Built ${item.platform}: ${item.outputPath} ` +
        `(${item.fileCount} files; ${item.sharedFileCount} shared)`
    );
  }
}

export function pluginCommands() {
  const plugin = new Command('plugin').description(
    'Build and maintain native workflow plugin packages'
  );

  plugin
    .command('build')
    .description('Compose native packages from shared sources and thin overlays')
    .addOption(
      new Option('--platform <platform>', 'Package to build')
        .choices(['all', 'codex', 'claude'])
        .default('all')
    )
    .option('--plugin-version <version>', 'Plugin semantic version')
    .option('--source-commit <commit>', 'Source commit recorded in provenance')
    .option('--source-tag <tag>', 'Optional source tag recorded in provenance')
    .option('--source-root <path>', 'Plugin source root', resolve(repositoryRoot, 'plugin-src'))
    .option('--dist-root <path>', 'Generated package root', resolve(repositoryRoot, 'dist'))
    .option('--json', 'Print machine-readable build results')
    .action(async (options) => {
      const sourceRoot = resolve(options.sourceRoot);
      const version = options.pluginVersion ?? (await defaultVersion(sourceRoot));
      const sourceCommit = options.sourceCommit ?? currentCommit();
      const platforms = options.platform === 'all' ? ['codex', 'claude'] : [options.platform];

      const result = await composePackages({
        sourceRoot,
        distRoot: resolve(options.distRoot),
        platforms,
        version,
        sourceCommit,
        sourceTag: options.sourceTag ?? null,
      });

      printBuildResult(result, options.json);
    });

  plugin
    .command('clean')
    .description('Remove generated native plugin packages')
    .option('--dist-root <path>', 'Generated package root', resolve(repositoryRoot, 'dist'))
    .option('--json', 'Print machine-readable output')
    .action(async (options) => {
      const distRoot = resolve(options.distRoot);
      await rm(distRoot, { recursive: true, force: true });
      const result = { removed: distRoot };
      console.log(options.json ? JSON.stringify(result, null, 2) : `Removed ${distRoot}`);
    });

  plugin
    .command('validate')
    .description('Validate canonical workflow and platform contracts')
    .option('--source-root <path>', 'Plugin source root', resolve(repositoryRoot, 'plugin-src'))
    .option('--json', 'Print machine-readable validation results')
    .action(async (options) => {
      const result = await loadAndValidateContracts(resolve(options.sourceRoot));
      console.log(
        options.json
          ? JSON.stringify(result, null, 2)
          : `Contracts valid: ${result.skillCount} skills across ${result.platforms.join(' and ')}`
      );
    });

  plugin
    .command('lint')
    .description('Lint canonical plugin sources for portability and inventory drift')
    .option('--source-root <path>', 'Plugin source root', resolve(repositoryRoot, 'plugin-src'))
    .option('--json', 'Print machine-readable lint results')
    .action(async (options) => {
      const result = await lintPortability(resolve(options.sourceRoot));
      console.log(
        options.json
          ? JSON.stringify(result, null, 2)
          : `Portable sources valid: ${result.existingSkillCount} skills, ${result.fileCount} files`
      );
    });

  plugin
    .command('validate-native')
    .description('Validate native manifests, catalogs, and activation hooks')
    .option('--source-root <path>', 'Plugin source root', resolve(repositoryRoot, 'plugin-src'))
    .option('--json', 'Print machine-readable validation results')
    .action(async (options) => {
      const result = await loadAndValidateNativeSources(resolve(options.sourceRoot));
      console.log(
        options.json
          ? JSON.stringify(result, null, 2)
          : `Native sources valid: ${result.plugin} ${result.version} for ${result.platforms.join(' and ')}`
      );
    });

  plugin
    .command('smoke-install')
    .description('Install both packages with native managers in disposable profiles')
    .option('--source-root <path>', 'Plugin source root', resolve(repositoryRoot, 'plugin-src'))
    .option('--dist-root <path>', 'Generated package root', resolve(repositoryRoot, 'dist'))
    .option('--workspace <path>', 'Preserved smoke workspace')
    .option('--keep', 'Keep an automatically created workspace')
    .option('--json', 'Print machine-readable smoke results')
    .action(async (options) => {
      const sourceRoot = resolve(options.sourceRoot);
      const distRoot = resolve(options.distRoot);
      const version = await defaultVersion(sourceRoot);
      const inventory = JSON.parse(
        await readFile(resolve(sourceRoot, 'contracts/workflow-inventory.json'), 'utf8')
      );
      const workspace = options.workspace
        ? resolve(options.workspace)
        : await mkdtemp(resolve(tmpdir(), 'workflow-native-smoke-'));
      const removeWorkspace = !options.workspace && !options.keep;
      let succeeded = false;

      try {
        await composePackages({
          sourceRoot,
          distRoot,
          platforms: ['codex', 'claude'],
          version,
          sourceCommit: currentCommit(),
          sourceTag: null,
        });
        const result = await runNativeInstallSmoke({
          sourceRoot,
          distRoot,
          workspace,
          version,
          expectedSkills: inventory.skills.map((item) => item.name).sort(),
        });
        result.workspaceRemoved = removeWorkspace;
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          for (const item of result.platforms) {
            console.log(
              `${item.platform}: installed ${item.version}, ` +
                `${item.skillCount} skills, doctor ready`
            );
          }
          console.log(result.note);
        }
        succeeded = true;
      } catch (error) {
        if (!options.workspace) {
          console.error(`Smoke workspace retained for diagnosis: ${workspace}`);
        }
        throw error;
      } finally {
        if (removeWorkspace && succeeded) {
          await rm(workspace, { recursive: true, force: true });
        }
      }
    });

  plugin.addCommand(releaseCommands({ repositoryRoot }));

  return plugin;
}
