import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve, sep } from 'node:path';

import { parseReleaseTag } from './release.js';

const RELEASE_WORKFLOW = 'plugin-release.yml';
const MARKETPLACE_BRANCH = 'marketplace';
const PLUGIN_ID = 'agentic-development-workflow';
const MARKETPLACE_ID = 'quality-code';

export class CommandExecutionError extends Error {
  constructor(message, { exitCode = 1, stdout = '', stderr = '' } = {}) {
    super(message);
    this.name = 'CommandExecutionError';
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

export function defaultCommandRunner(
  executable,
  args,
  { cwd, inherit = false, allowFailure = false } = {}
) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;

  const commandResult = {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
  if (commandResult.status !== 0 && !allowFailure) {
    const detail = [commandResult.stderr.trim(), commandResult.stdout.trim()]
      .filter(Boolean)
      .join('\n');
    throw new CommandExecutionError(
      `${executable} ${args.join(' ')} failed` + (detail ? `:\n${detail}` : ''),
      {
        exitCode: commandResult.status,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
      }
    );
  }
  return commandResult;
}

function commandText(runner, executable, args, options) {
  return runner(executable, args, options).stdout.trim();
}

function commandJson(runner, executable, args, options, label) {
  const output = commandText(runner, executable, args, options);
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

function remoteTags(output) {
  const tags = new Map();
  for (const line of output.split('\n').filter(Boolean)) {
    const [commit, ref] = line.split(/\s+/, 2);
    if (!commit || !ref?.startsWith('refs/tags/')) continue;
    const peeled = ref.endsWith('^{}');
    const tag = ref.replace(/^refs\/tags\//, '').replace(/\^\{\}$/, '');
    const current = tags.get(tag) ?? { tag, commit: null, objectCommit: null };
    if (peeled) current.commit = commit;
    else current.objectCommit = commit;
    tags.set(tag, current);
  }
  return [...tags.values()].map((item) => ({
    tag: item.tag,
    commit: item.commit ?? item.objectCommit,
  }));
}

function runFields() {
  return [
    'databaseId',
    'displayTitle',
    'headBranch',
    'headSha',
    'status',
    'conclusion',
    'createdAt',
    'updatedAt',
    'url',
  ].join(',');
}

export async function getDeployedRelease({
  repositoryRoot,
  runner = defaultCommandRunner,
}) {
  const repository = commandText(
    runner,
    'gh',
    ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    { cwd: repositoryRoot }
  );
  const response = runner(
    'gh',
    [
      'api',
      '-H',
      'Accept: application/vnd.github.raw+json',
      `repos/${repository}/contents/RELEASE.json?ref=${MARKETPLACE_BRANCH}`,
    ],
    { cwd: repositoryRoot, allowFailure: true }
  );
  if (response.status !== 0) return null;
  try {
    return JSON.parse(response.stdout);
  } catch (error) {
    throw new Error(`Remote RELEASE.json is invalid: ${error.message}`);
  }
}

export async function listReleases({
  repositoryRoot,
  runner = defaultCommandRunner,
  limit = 10,
  status = null,
}) {
  const tagResult = runner(
    'git',
    ['ls-remote', '--tags', 'origin', 'refs/tags/v*'],
    { cwd: repositoryRoot, allowFailure: true }
  );
  const tags = tagResult.status === 0 ? remoteTags(tagResult.stdout) : [];
  const args = [
    'run',
    'list',
    '--workflow',
    RELEASE_WORKFLOW,
    '--limit',
    String(limit),
    '--json',
    runFields(),
  ];
  if (status) args.push('--status', status);
  const runs = commandJson(
    runner,
    'gh',
    args,
    { cwd: repositoryRoot },
    'gh run list'
  );
  const current = await getDeployedRelease({ repositoryRoot, runner });
  const tagsByName = new Map(tags.map((item) => [item.tag, item]));
  const rows = runs.map((run) => {
    const tag = run.headBranch;
    tagsByName.delete(tag);
    return {
      tag,
      sourceCommit: run.headSha,
      workflow:
        run.status === 'completed' ? run.conclusion ?? 'completed' : run.status,
      runId: run.databaseId,
      runUrl: run.url,
      createdAt: run.createdAt,
      marketplace: current?.sourceTag === tag ? 'complete' : null,
      marketplaceVersion: current?.sourceTag === tag ? current.version : null,
    };
  });
  for (const item of tagsByName.values()) {
    rows.push({
      tag: item.tag,
      sourceCommit: item.commit,
      workflow: null,
      runId: null,
      runUrl: null,
      createdAt: null,
      marketplace: current?.sourceTag === item.tag ? 'complete' : null,
      marketplaceVersion: current?.sourceTag === item.tag ? current.version : null,
    });
  }

  return {
    schemaVersion: 1,
    marketplace: current,
    releases: rows.slice(0, limit),
  };
}

export function formatReleaseList(result) {
  if (result.releases.length === 0) return 'No release tags or workflow runs found.';
  const headers = ['TAG', 'SOURCE', 'WORKFLOW', 'MARKETPLACE', 'CREATED'];
  const rows = result.releases.map((item) => [
    item.tag ?? '—',
    item.sourceCommit?.slice(0, 8) ?? '—',
    item.workflow ?? 'not found',
    item.marketplace ?? '—',
    item.createdAt ? item.createdAt.replace('T', ' ').replace('Z', 'Z') : '—',
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length))
  );
  return [headers, ...rows]
    .map((row) => row.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd())
    .join('\n');
}

function releaseRunList({ repositoryRoot, runner, tag = null, limit = 20 }) {
  const args = [
    'run',
    'list',
    '--workflow',
    RELEASE_WORKFLOW,
    '--limit',
    String(limit),
    '--json',
    runFields(),
  ];
  if (tag) args.push('--branch', tag, '--event', 'push');
  return commandJson(
    runner,
    'gh',
    args,
    { cwd: repositoryRoot },
    'gh run list'
  );
}

export async function findReleaseRun({
  repositoryRoot,
  runner = defaultCommandRunner,
  runId = null,
  tag = null,
  attempts = 1,
  delayMs = 0,
  sleep = (milliseconds) =>
    new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  if (runId) {
    return commandJson(
      runner,
      'gh',
      ['run', 'view', String(runId), '--json', runFields()],
      { cwd: repositoryRoot },
      'gh run view'
    );
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const runs = releaseRunList({ repositoryRoot, runner, tag });
    const run = tag ? runs.find((item) => item.headBranch === tag) : runs[0];
    if (run) return run;
    if (attempt < attempts) await sleep(delayMs);
  }
  throw new Error(
    tag
      ? `No ${RELEASE_WORKFLOW} run found for ${tag}`
      : `No ${RELEASE_WORKFLOW} runs found`
  );
}

export async function watchRelease({
  repositoryRoot,
  runner = defaultCommandRunner,
  runId = null,
  tag = null,
  json = false,
  attempts = 1,
  delayMs = 0,
  sleep,
}) {
  const selected = await findReleaseRun({
    repositoryRoot,
    runner,
    runId,
    tag,
    attempts,
    delayMs,
    sleep,
  });
  runner(
    'gh',
    ['run', 'watch', String(selected.databaseId), '--exit-status'],
    { cwd: repositoryRoot, inherit: !json }
  );
  return findReleaseRun({
    repositoryRoot,
    runner,
    runId: selected.databaseId,
  });
}

function remoteRef(runner, repositoryRoot, ref, { tags = false } = {}) {
  const args = ['ls-remote'];
  if (tags) args.push('--tags');
  args.push('origin', ref);
  return runner('git', args, {
    cwd: repositoryRoot,
    allowFailure: true,
  });
}

function remoteTagCommit(runner, repositoryRoot, tag) {
  const result = runner(
    'git',
    [
      'ls-remote',
      '--tags',
      'origin',
      `refs/tags/${tag}`,
      `refs/tags/${tag}^{}`,
    ],
    { cwd: repositoryRoot, allowFailure: true }
  );
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return remoteTags(result.stdout).find((item) => item.tag === tag)?.commit ?? null;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function addCheck(checks, id, passed, detail) {
  checks.push({ id, status: passed ? 'pass' : 'fail', detail });
}

function hasSessionStartHook(hooks) {
  const groups = hooks?.hooks?.SessionStart;
  const handlers = groups?.[0]?.hooks;
  return (
    Array.isArray(groups) &&
    groups.length === 1 &&
    Array.isArray(handlers) &&
    handlers.length === 1 &&
    handlers[0]?.type === 'command' &&
    typeof handlers[0]?.command === 'string' &&
    handlers[0].command.length > 0
  );
}

async function loadJsonForCheck(checks, id, path) {
  try {
    return await readJson(path);
  } catch (error) {
    addCheck(checks, id, false, `${path}: ${error.message}`);
    return null;
  }
}

async function validateSharedFiles(packageRoot, inventory) {
  if (
    inventory.schemaVersion !== 1 ||
    !Array.isArray(inventory.files) ||
    inventory.files.length === 0
  ) {
    throw new Error('shared-file inventory is empty or malformed');
  }
  const paths = new Set();
  for (const item of inventory.files) {
    if (
      typeof item.path !== 'string' ||
      item.type !== 'file' ||
      !Number.isInteger(item.size) ||
      !/^[0-9a-f]{64}$/.test(item.sha256) ||
      paths.has(item.path)
    ) {
      throw new Error('shared-file inventory contains an invalid or duplicate entry');
    }
    paths.add(item.path);
    const path = resolve(packageRoot, item.path);
    if (!path.startsWith(`${packageRoot}${sep}`)) {
      throw new Error(`${item.path} escapes the package root`);
    }
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`${item.path} is not a regular file`);
    }
    const contents = await readFile(path);
    if (contents.length !== item.size) {
      throw new Error(`${item.path} size differs`);
    }
    const digest = createHash('sha256').update(contents).digest('hex');
    if (digest !== item.sha256) {
      throw new Error(`${item.path} hash differs`);
    }
  }
}

export async function verifyMarketplaceRelease({
  repositoryRoot,
  tag,
  runner = defaultCommandRunner,
}) {
  const parsedTag = parseReleaseTag(tag);
  const checks = [];
  const sourceCommit = remoteTagCommit(runner, repositoryRoot, tag);
  addCheck(
    checks,
    'release-tag',
    Boolean(sourceCommit),
    sourceCommit ? `${tag} resolves to ${sourceCommit}` : `${tag} is absent from origin`
  );

  const marketplaceRef = remoteRef(
    runner,
    repositoryRoot,
    `refs/heads/${MARKETPLACE_BRANCH}`
  );
  const marketplaceCommit = marketplaceRef.stdout.trim().split(/\s+/, 1)[0] || null;
  addCheck(
    checks,
    'marketplace-branch',
    Boolean(marketplaceCommit),
    marketplaceCommit
      ? `${MARKETPLACE_BRANCH} resolves to ${marketplaceCommit}`
      : `${MARKETPLACE_BRANCH} is absent from origin`
  );

  let release = null;
  if (!marketplaceCommit) {
    return {
      schemaVersion: 1,
      tag,
      complete: false,
      marketplaceCommit: null,
      release: null,
      checks,
    };
  }

  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'workflow-marketplace-verify-'));
  const checkout = resolve(temporaryRoot, 'marketplace');
  try {
    const remoteUrl = commandText(
      runner,
      'git',
      ['remote', 'get-url', 'origin'],
      { cwd: repositoryRoot }
    );
    runner(
      'git',
      ['clone', '--quiet', '--depth', '1', '--branch', MARKETPLACE_BRANCH, remoteUrl, checkout],
      { cwd: temporaryRoot }
    );

    release = await loadJsonForCheck(checks, 'release-metadata', resolve(checkout, 'RELEASE.json'));
    if (release) {
      const valid =
        release.schemaVersion === 1 &&
        release.plugin === PLUGIN_ID &&
        release.marketplace === MARKETPLACE_ID &&
        release.sourceTag === tag &&
        release.version === parsedTag.version &&
        release.sourceCommit === sourceCommit;
      addCheck(
        checks,
        'release-metadata',
        valid,
        valid
          ? `RELEASE.json matches ${tag} and ${sourceCommit}`
          : 'RELEASE.json does not match the requested tag, source commit, plugin, or marketplace'
      );
    }

    const codexCatalog = await loadJsonForCheck(
      checks,
      'marketplace-catalogs',
      resolve(checkout, '.agents/plugins/marketplace.json')
    );
    const claudeCatalog = await loadJsonForCheck(
      checks,
      'marketplace-catalogs',
      resolve(checkout, '.claude-plugin/marketplace.json')
    );
    if (codexCatalog && claudeCatalog) {
      const valid =
        codexCatalog.name === MARKETPLACE_ID &&
        claudeCatalog.name === MARKETPLACE_ID &&
        codexCatalog.plugins?.length === 1 &&
        claudeCatalog.plugins?.length === 1 &&
        codexCatalog.plugins[0].name === PLUGIN_ID &&
        claudeCatalog.plugins[0].name === PLUGIN_ID &&
        codexCatalog.plugins[0].source?.path ===
          `./plugins/codex/${PLUGIN_ID}` &&
        claudeCatalog.plugins[0].source === `./plugins/claude/${PLUGIN_ID}`;
      addCheck(
        checks,
        'marketplace-catalogs',
        valid,
        valid
          ? 'Codex and Claude catalogs select the expected packages'
          : 'Marketplace catalogs are inconsistent'
      );
    }

    const packageData = {};
    for (const platform of ['codex', 'claude']) {
      const packageRoot = resolve(checkout, 'plugins', platform, PLUGIN_ID);
      const manifestPath =
        platform === 'codex'
          ? resolve(packageRoot, '.codex-plugin/plugin.json')
          : resolve(packageRoot, '.claude-plugin/plugin.json');
      const manifest = await loadJsonForCheck(
        checks,
        `${platform}-package`,
        manifestPath
      );
      const hooks = await loadJsonForCheck(
        checks,
        `${platform}-hooks`,
        resolve(packageRoot, 'hooks/hooks.json')
      );
      const provenance = await loadJsonForCheck(
        checks,
        `${platform}-provenance`,
        resolve(packageRoot, '.workflow-build/provenance.json')
      );
      const inventory = await loadJsonForCheck(
        checks,
        `${platform}-inventory`,
        resolve(packageRoot, '.workflow-build/shared-files.json')
      );
      if (manifest) {
        const valid =
          manifest.name === PLUGIN_ID &&
          manifest.version === parsedTag.version &&
          manifest.skills === './skills/';
        addCheck(
          checks,
          `${platform}-package`,
          valid,
          valid
            ? `${platform} manifest is ${PLUGIN_ID} ${parsedTag.version}`
            : `${platform} manifest identity/version differs`
        );
      }
      if (hooks) {
        const valid = hasSessionStartHook(hooks);
        addCheck(
          checks,
          `${platform}-hooks`,
          valid,
          valid
            ? `${platform} package contains one command-based SessionStart hook`
            : `${platform} SessionStart hook is missing or malformed`
        );
      }
      if (provenance) {
        const valid =
          provenance.platform === platform &&
          provenance.version === parsedTag.version &&
          provenance.sourceTag === tag &&
          provenance.sourceCommit === sourceCommit;
        addCheck(
          checks,
          `${platform}-provenance`,
          valid,
          valid ? `${platform} provenance matches the release` : `${platform} provenance differs`
        );
      }
      if (inventory) {
        try {
          await validateSharedFiles(packageRoot, inventory);
          addCheck(
            checks,
            `${platform}-inventory`,
            true,
            `${inventory.files?.length ?? 0} shared files match size and hash`
          );
        } catch (error) {
          addCheck(checks, `${platform}-inventory`, false, error.message);
        }
      }
      packageData[platform] = { inventory };
    }

    if (packageData.codex.inventory && packageData.claude.inventory) {
      const matching =
        JSON.stringify(packageData.codex.inventory) ===
        JSON.stringify(packageData.claude.inventory);
      addCheck(
        checks,
        'shared-inventory-parity',
        matching,
        matching
          ? 'Codex and Claude shared-file inventories are identical'
          : 'Codex and Claude shared-file inventories differ'
      );
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  return {
    schemaVersion: 1,
    tag,
    complete: checks.every((item) => item.status === 'pass'),
    marketplaceCommit,
    release,
    checks,
  };
}

export function formatVerification(result) {
  const lines = [`Marketplace release ${result.tag}`, ''];
  for (const check of result.checks) {
    lines.push(`${check.status === 'pass' ? 'PASS' : 'FAIL'}  ${check.detail}`);
  }
  lines.push('', `VERDICT: ${result.complete ? 'COMPLETE' : 'INCOMPLETE'}`);
  return lines.join('\n');
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function bundleMarketplaceRelease({
  repositoryRoot,
  tag,
  outputDirectory,
  installationGuidePath = resolve(repositoryRoot, 'INSTALL.md'),
  userGuidePath = resolve(repositoryRoot, 'USER-GUIDE.md'),
  force = false,
  runner = defaultCommandRunner,
  verifyDeployment = verifyMarketplaceRelease,
}) {
  const parsedTag = parseReleaseTag(tag);
  const deployment = await verifyDeployment({ repositoryRoot, tag, runner });
  if (!deployment.complete) {
    const error = new Error(`Marketplace deployment for ${tag} is incomplete`);
    error.deployment = deployment;
    throw error;
  }

  const version = parsedTag.version;
  const rootDirectory = `${MARKETPLACE_ID}-${PLUGIN_ID}-${version}`;
  const archiveName = `${rootDirectory}.zip`;
  const checksumName = `${archiveName}.sha256`;
  const destination = resolve(outputDirectory);
  const archivePath = resolve(destination, archiveName);
  const checksumPath = resolve(destination, checksumName);
  const existing = await Promise.all([
    pathExists(archivePath),
    pathExists(checksumPath),
  ]);
  if (!force && existing.some(Boolean)) {
    throw new Error(
      `Bundle artifact already exists; use --force to replace it: ${archivePath}`
    );
  }

  runner(
    'git',
    ['fetch', '--quiet', 'origin', `refs/heads/${MARKETPLACE_BRANCH}`],
    { cwd: repositoryRoot }
  );
  const fetchedCommit = commandText(
    runner,
    'git',
    ['rev-parse', 'FETCH_HEAD'],
    { cwd: repositoryRoot }
  );
  if (fetchedCommit !== deployment.marketplaceCommit) {
    throw new Error(
      `Fetched marketplace commit differs from verified deployment: ` +
        `${fetchedCommit} != ${deployment.marketplaceCommit}`
    );
  }

  await mkdir(destination, { recursive: true });
  const temporaryRoot = await mkdtemp(resolve(destination, '.workflow-bundle-'));
  const temporaryArchive = resolve(temporaryRoot, archiveName);
  const temporaryChecksum = resolve(temporaryRoot, checksumName);
  const temporaryInstallationGuide = resolve(temporaryRoot, 'INSTALL.md');
  const temporaryUserGuide = resolve(temporaryRoot, 'USER-GUIDE.md');
  try {
    const [installationGuide, userGuide] = await Promise.all([
      readFile(installationGuidePath, 'utf8'),
      readFile(userGuidePath, 'utf8'),
    ]);
    if (!installationGuide.trim()) {
      throw new Error(`Installation guide is empty: ${installationGuidePath}`);
    }
    if (!userGuide.trim()) {
      throw new Error(`User guide is empty: ${userGuidePath}`);
    }
    await Promise.all([
      writeFile(temporaryInstallationGuide, installationGuide),
      writeFile(temporaryUserGuide, userGuide),
    ]);
    runner(
      'git',
      [
        'archive',
        '--format=zip',
        `--prefix=${rootDirectory}/`,
        `--add-file=${temporaryInstallationGuide}`,
        `--add-file=${temporaryUserGuide}`,
        '--output',
        temporaryArchive,
        deployment.marketplaceCommit,
      ],
      { cwd: repositoryRoot }
    );
    const archive = await readFile(temporaryArchive);
    if (archive.length === 0) throw new Error('Generated bundle archive is empty');
    const sha256 = createHash('sha256').update(archive).digest('hex');
    await writeFile(
      temporaryChecksum,
      `${sha256}  ${basename(archivePath)}\n`
    );

    if (force) {
      await Promise.all([
        rm(archivePath, { force: true }),
        rm(checksumPath, { force: true }),
      ]);
    }
    await rename(temporaryArchive, archivePath);
    await rename(temporaryChecksum, checksumPath);

    return {
      schemaVersion: 1,
      tag,
      version,
      sourceCommit: deployment.release.sourceCommit,
      marketplaceCommit: deployment.marketplaceCommit,
      rootDirectory,
      installationGuidePath,
      archivePath,
      checksumPath,
      sha256,
      installation: {
        codex: [
          `codex plugin marketplace add <UNPACKED_ROOT>/${rootDirectory}`,
          `codex plugin add ${PLUGIN_ID}@${MARKETPLACE_ID}`,
        ],
        claude: [
          `claude plugin marketplace add <UNPACKED_ROOT>/${rootDirectory} --scope user`,
          `claude plugin install ${PLUGIN_ID}@${MARKETPLACE_ID} --scope user`,
        ],
      },
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function localTagExists(runner, repositoryRoot, tag) {
  return (
    runner(
      'git',
      ['rev-parse', '--quiet', '--verify', `refs/tags/${tag}`],
      { cwd: repositoryRoot, allowFailure: true }
    ).status === 0
  );
}

async function validateSelectedCommit({
  repositoryRoot,
  runner,
  headCommit,
  sourceCommit,
  validate,
}) {
  if (headCommit === sourceCommit) {
    return validate({ repositoryRoot, sourceCommit });
  }

  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'workflow-release-source-'));
  const checkout = resolve(temporaryRoot, 'checkout');
  let worktreeAdded = false;
  try {
    runner(
      'git',
      ['worktree', 'add', '--detach', checkout, sourceCommit],
      { cwd: repositoryRoot }
    );
    worktreeAdded = true;
    return await validate({ repositoryRoot: checkout, sourceCommit });
  } finally {
    if (worktreeAdded) {
      runner('git', ['worktree', 'remove', '--force', checkout], {
        cwd: repositoryRoot,
        allowFailure: true,
      });
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function publishRelease({
  repositoryRoot,
  tag,
  commit = null,
  dryRun = false,
  yes = false,
  wait = true,
  verify = true,
  json = false,
  runner = defaultCommandRunner,
  validate = async () => {},
  confirm = null,
  onPlan = () => {},
  sleep,
  watchDeployment = watchRelease,
  verifyDeployment = verifyMarketplaceRelease,
  requireHeadMatch = true,
  releasePlan = null,
}) {
  parseReleaseTag(tag);
  if (!wait && verify) {
    throw new Error('--no-wait requires --no-verify because deployment is not ready to inspect');
  }
  runner('git', ['fetch', 'origin', 'main'], { cwd: repositoryRoot });
  const sourceCommit = commandText(
    runner,
    'git',
    ['rev-parse', commit ?? 'origin/main'],
    { cwd: repositoryRoot }
  );
  const headCommit = commandText(
    runner,
    'git',
    ['rev-parse', 'HEAD'],
    { cwd: repositoryRoot }
  );
  if (requireHeadMatch && headCommit !== sourceCommit) {
    throw new Error(
      `Release checkout differs from the selected commit: HEAD=${headCommit}, ` +
        `selected=${sourceCommit}. Check out and update main before publishing.`
    );
  }
  const worktreeStatus = commandText(
    runner,
    'git',
    ['status', '--porcelain'],
    { cwd: repositoryRoot }
  );
  if (worktreeStatus) {
    throw new Error('Release checkout is not clean; commit, stash, or remove local changes first');
  }
  const ancestry = runner(
    'git',
    ['merge-base', '--is-ancestor', sourceCommit, 'origin/main'],
    { cwd: repositoryRoot, allowFailure: true }
  );
  if (ancestry.status !== 0) {
    throw new Error(`Release commit is not an ancestor of origin/main: ${sourceCommit}`);
  }
  if (localTagExists(runner, repositoryRoot, tag)) {
    throw new Error(`Release tag already exists locally: ${tag}`);
  }
  if (remoteTagCommit(runner, repositoryRoot, tag)) {
    throw new Error(`Release tag already exists on origin: ${tag}`);
  }

  const validation = await validateSelectedCommit({
    repositoryRoot,
    runner,
    headCommit,
    sourceCommit,
    validate,
  });
  const plan = {
    schemaVersion: 1,
    tag,
    sourceCommit,
    remote: 'origin',
    wait,
    verify,
    dryRun,
    validation,
    releasePlan,
  };
  onPlan(plan);
  if (dryRun) return { ...plan, published: false, cancelled: false };
  if (!yes) {
    if (!confirm) {
      throw new Error('Interactive confirmation is required; use --yes for automation');
    }
    if (!(await confirm(plan))) {
      return { ...plan, published: false, cancelled: true };
    }
  }

  runner(
    'git',
    ['tag', '-a', tag, sourceCommit, '-m', `Release ${tag}`],
    { cwd: repositoryRoot }
  );
  try {
    runner('git', ['push', 'origin', `refs/tags/${tag}`], {
      cwd: repositoryRoot,
    });
  } catch (error) {
    runner('git', ['tag', '-d', tag], {
      cwd: repositoryRoot,
      allowFailure: true,
    });
    throw error;
  }

  const result = {
    ...plan,
    published: true,
    cancelled: false,
    run: null,
    deployment: null,
  };
  if (!wait) return result;

  result.run = await watchDeployment({
    repositoryRoot,
    runner,
    tag,
    json,
    attempts: 30,
    delayMs: 1000,
    sleep,
  });
  if (verify) {
    result.deployment = await verifyDeployment({
      repositoryRoot,
      tag,
      runner,
    });
    if (!result.deployment.complete) {
      const error = new Error(`Marketplace deployment for ${tag} is incomplete`);
      error.exitCode = 1;
      error.deployment = result.deployment;
      throw error;
    }
  }
  return result;
}
