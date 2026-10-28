import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command, Option } from 'commander';
import { withScratch } from '../storage.js';

import { composeMarketplacePackages } from '../plugin/compose.js';
import { loadAndValidateContracts } from '../plugin/contracts.js';
import { lintPortability } from '../plugin/portability.js';
import { loadAndValidateNativeSources } from '../plugin/native.js';
import { loadMarketplacePluginRegistry } from '../plugin/registry.js';
import { installedSkillNames, runNativeInstallSmoke } from '../plugin/smoke.js';
import { upgradePlugin } from '../plugin/upgrade.js';
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
      `Built ${item.pluginId} for ${item.platform}: ${item.outputPath} ` +
        `(${item.fileCount} files; ${item.sharedFileCount} shared)`
    );
  }
}

export function pluginCommands() {
  const plugin = new Command('plugin').description(
    'Build and maintain native workflow plugin packages'
  );
  plugin.command('upgrade').description('Recoverably install and verify an exact plugin; preserve active sessions')
    .requiredOption('--platform <host>', 'codex or claude')
    .requiredOption('--version <version>', 'Exact expected version')
    .requiredOption('--expected-package <directory>', 'Verified distribution package for this host')
    .requiredOption('--receipt <path>', 'Persistent upgrade/recovery receipt')
    .option('--plugin-id <id>', 'Plugin identity', 'agentic-development-workflow')
    .action(async options => {
      const result = await upgradePlugin({ ...options, receiptPath: options.receipt });
      console.log(JSON.stringify(result, null, 2));
    });

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

      const result = await composeMarketplacePackages({
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
    .option('--keep', 'Hold an automatically created workspace for 24 hours; cleanup remains on demand')
    .option('--json', 'Print machine-readable smoke results')
    .action(async (options) => {
      const sourceRoot = resolve(options.sourceRoot);
      const distRoot = resolve(options.distRoot);
      const version = await defaultVersion(sourceRoot);
      const inventory = JSON.parse(
        await readFile(resolve(sourceRoot, 'contracts/workflow-inventory.json'), 'utf8')
      );
      const registry = await loadMarketplacePluginRegistry(sourceRoot);
      const plugins = await Promise.all(registry.plugins.map(async (entry) => ({
        id: entry.id,
        expectedSkills: await installedSkillNames(resolve(sourceRoot, entry.sourceRoot, 'shared')),
      })));
      const exercise = async workspace => {
        await composeMarketplacePackages({
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
          plugins,
        });
        return result;
      };
      let cleanup = null;
      const result = options.workspace
        ? await exercise(resolve(options.workspace))
        : await withScratch({ purpose: 'native-plugin-smoke',
          keepUntil: options.keep ? new Date(Date.now() + 86400000).toISOString() : null,
          onCleanup: value => { cleanup = value; },
        }, ({ path }) => exercise(path));
      result.workspaceRemoved = Boolean(cleanup?.removed.length);
      result.scratchCleanup = cleanup;
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        for (const item of result.platforms) console.log(`${item.platform}: installed ${item.version}, ${item.plugins.length} plugins and ${item.skillCount} skills, doctor ready`);
        console.log(result.note);
        if (cleanup) console.log(JSON.stringify({ scratchCleanup: cleanup }));
      }
    });

  plugin.addCommand(releaseCommands({ repositoryRoot }));

  return plugin;
}
