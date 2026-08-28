import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DEFAULT_ATTEMPTS = 30;
const DEFAULT_INTERVAL_MILLISECONDS = 2_000;

export async function requestGitHubApi({
  method = 'GET',
  endpoint,
  body,
  allowNotFound = false,
}) {
  const arguments_ = [
    'api',
    '--method',
    method,
    endpoint,
    '-H',
    'Accept: application/vnd.github+json',
    '-H',
    'X-GitHub-Api-Version: 2022-11-28',
    ...(body === undefined ? [] : ['--input', '-']),
  ];
  const result = spawnSync('gh', arguments_, {
    encoding: 'utf8',
    input: body === undefined ? undefined : JSON.stringify(body),
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (allowNotFound && /HTTP 404/u.test(result.stderr ?? '')) return null;
    throw new Error(
      `gh api failed (${result.status}): ${(result.stderr || result.stdout).trim()}`
    );
  }
  const output = result.stdout.trim();
  return output === '' ? null : JSON.parse(output);
}

export function publicationBranchName(version, planSha256) {
  if (typeof version !== 'string' || version === '' || !SHA256.test(planSha256 ?? '')) {
    throw new Error('Publication branch identity is invalid');
  }
  const slug = version.replaceAll(/[^0-9A-Za-z._-]/gu, '-');
  return `tb-gatereeve-release-v${slug}-${planSha256.slice(0, 8)}`;
}

function marker(metadata) {
  return Buffer.from(JSON.stringify(metadata)).toString('base64url');
}

export function renderPublicationPullRequestBody(metadata) {
  validateMetadata(metadata);
  return `This pull request transports one exact approved GateReeve release output.

- Release: \`${metadata.version}\`
- Source commit: \`${metadata.sourceCommit}\`
- Publication plan SHA-256: \`${metadata.planSha256}\`
- Destination: \`${metadata.repository}:${metadata.baseBranch}/${metadata.path}\`
- File SHA-256: \`${metadata.fileSha256}\`

The publication command merges this generated pull request only when GitHub reports
the exact head clean and mergeable. Do not add unrelated changes.

<!-- gatereeve-publication:v1:${marker(metadata)} -->
`;
}

export function parsePublicationPullRequestBody(body) {
  const match = /<!-- gatereeve-publication:v1:([0-9A-Za-z_-]+) -->/u.exec(body ?? '');
  if (!match) throw new Error('Publication pull request identity marker is missing');
  let metadata;
  try {
    metadata = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Publication pull request identity marker is invalid');
  }
  return validateMetadata(metadata);
}

export async function preflightPublicationRepository({
  request = requestGitHubApi,
  repository,
  baseBranch = 'main',
}) {
  await request({ endpoint: `repos/${repository}` });
  const branch = await request({
    endpoint: `repos/${repository}/branches/${encodeURIComponent(baseBranch)}`,
  });
  requireCommit(branch?.commit?.sha, 'Destination branch commit');
}

export async function readRepositoryFile({
  request = requestGitHubApi,
  repository,
  path,
  reference,
  allowNotFound = false,
}) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const value = await request({
    endpoint: `repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(reference)}`,
    allowNotFound,
  });
  if (value === null && allowNotFound) return null;
  if (value?.type !== 'file' || typeof value?.content !== 'string') {
    throw new Error(`Repository file response is invalid: ${repository}/${path}`);
  }
  return {
    sha: value.sha,
    content: Buffer.from(value.content.replaceAll('\n', ''), 'base64').toString('utf8'),
  };
}

export async function publishRepositoryFileViaPullRequest({
  request = requestGitHubApi,
  repository,
  baseBranch = 'main',
  version,
  sourceCommit,
  planSha256,
  title,
  path,
  content,
  fileSha256,
  sleep = defaultSleep,
  attempts = DEFAULT_ATTEMPTS,
  intervalMilliseconds = DEFAULT_INTERVAL_MILLISECONDS,
}) {
  if (sha256(content) !== fileSha256) {
    throw new Error('Publication file content does not match its approved SHA-256');
  }
  const branch = publicationBranchName(version, planSha256);
  const owner = repository.split('/')[0];
  const base = await request({
    endpoint: `repos/${repository}/branches/${encodeURIComponent(baseBranch)}`,
  });
  const baseCommit = requireCommit(base?.commit?.sha, 'Destination branch commit');
  const metadataBase = {
    repository,
    baseBranch,
    branch,
    version,
    sourceCommit,
    planSha256,
    path,
    fileSha256,
  };
  const pulls = await request({
    endpoint: `repos/${repository}/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}&base=${encodeURIComponent(baseBranch)}&per_page=100`,
  });
  if (!Array.isArray(pulls) || pulls.length > 1) {
    throw new Error(`Publication pull request lookup is ambiguous for ${branch}`);
  }

  let pull = pulls[0] ?? null;
  let publicationCommit;
  if (pull !== null) {
    pull = await readPull(request, repository, pull.number);
    const metadata = parsePublicationPullRequestBody(pull.body);
    assertMetadataMatch(metadataBase, metadata);
    publicationCommit = requireCommit(metadata.publicationCommit, 'Publication commit');
    if (pull.head?.sha !== publicationCommit || pull.head?.ref !== branch) {
      throw new Error('Publication pull request head differs from its identity marker');
    }
    await assertBaseRetained({
      request,
      repository,
      baseCommit: metadata.baseCommit,
      currentBase: baseCommit,
    });
    await assertPublicationCommit({
      request,
      repository,
      publicationCommit,
      baseCommit: metadata.baseCommit,
      path,
    });
    await assertPublicationPullRequest({ request, repository, pull, title, path });
  } else {
    const existingDestination = await readRepositoryFile({
      request,
      repository,
      path,
      reference: baseBranch,
      allowNotFound: true,
    });
    if (existingDestination?.content === content) {
      throw new Error('Destination already matches, but no publication pull request proves origin');
    }
    const reference = await request({
      endpoint: `repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`,
      allowNotFound: true,
    });
    if (reference === null) {
      await request({
        method: 'POST',
        endpoint: `repos/${repository}/git/refs`,
        body: { ref: `refs/heads/${branch}`, sha: baseCommit },
      });
    }
    const branchFile = await readRepositoryFile({
      request,
      repository,
      path,
      reference: branch,
      allowNotFound: true,
    });
    if (branchFile?.content !== content) {
      if (reference !== null && reference.object?.sha !== baseCommit) {
        throw new Error('Existing publication branch contains unapproved history');
      }
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const updated = await request({
        method: 'PUT',
        endpoint: `repos/${repository}/contents/${encodedPath}`,
        body: {
          message: title,
          content: Buffer.from(content).toString('base64'),
          branch,
          ...(branchFile?.sha ? { sha: branchFile.sha } : {}),
        },
      });
      publicationCommit = requireCommit(updated?.commit?.sha, 'Publication commit');
    } else {
      const branchRef = await request({
        endpoint: `repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`,
      });
      publicationCommit = requireCommit(branchRef?.object?.sha, 'Publication branch commit');
    }
    const metadata = { ...metadataBase, publicationCommit, baseCommit };
    await assertPublicationCommit({
      request,
      repository,
      publicationCommit,
      baseCommit,
      path,
    });
    pull = await request({
      method: 'POST',
      endpoint: `repos/${repository}/pulls`,
      body: {
        title,
        body: renderPublicationPullRequestBody(metadata),
        head: branch,
        base: baseBranch,
        draft: false,
        maintainer_can_modify: false,
      },
    });
    pull = await readPull(request, repository, pull.number);
    await assertPublicationPullRequest({ request, repository, pull, title, path });
  }

  if (pull.merged !== true) {
    if (pull.state !== 'open') {
      throw new Error(`Publication pull request is closed without merge: ${pull.html_url}`);
    }
    pull = await waitForCleanPull({
      request,
      repository,
      number: pull.number,
      sleep,
      attempts,
      intervalMilliseconds,
    });
    if (pull.mergeable !== true || pull.mergeable_state !== 'clean') {
      throw new Error(
        `Publication pull request is not clean and mergeable: ${pull.html_url} (${pull.mergeable_state})`
      );
    }
    const merge = await request({
      method: 'PUT',
      endpoint: `repos/${repository}/pulls/${pull.number}/merge`,
      body: {
        merge_method: 'merge',
        sha: publicationCommit,
        commit_title: title,
        commit_message: `Approved GateReeve publication plan ${planSha256}.`,
      },
    });
    if (merge?.merged !== true) {
      throw new Error(`GitHub did not merge the exact publication pull request: ${pull.html_url}`);
    }
    pull = await readPull(request, repository, pull.number);
  }

  const destination = await readRepositoryFile({
    request,
    repository,
    path,
    reference: baseBranch,
  });
  if (destination.content !== content) {
    throw new Error(`Published repository file differs: ${repository}/${path}`);
  }
  const mergeCommit = requireCommit(pull.merge_commit_sha, 'Publication merge commit');
  const branchRef = await request({
    endpoint: `repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`,
    allowNotFound: true,
  });
  if (branchRef?.object?.sha === publicationCommit) {
    await request({
      method: 'DELETE',
      endpoint: `repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`,
    });
  }
  return {
    identity: `${pull.html_url}@${mergeCommit}`,
    pullRequestUrl: pull.html_url,
    mergeCommit,
  };
}

async function waitForCleanPull({
  request,
  repository,
  number,
  sleep,
  attempts,
  intervalMilliseconds,
}) {
  let pull;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    pull = await readPull(request, repository, number);
    if (pull.merged === true || pull.mergeable_state === 'clean') return pull;
    if (pull.mergeable === false && pull.mergeable_state === 'dirty') return pull;
    if (attempt < attempts) await sleep(intervalMilliseconds);
  }
  return pull;
}

async function readPull(request, repository, number) {
  const pull = await request({ endpoint: `repos/${repository}/pulls/${number}` });
  if (!Number.isSafeInteger(pull?.number)) {
    throw new Error('Publication pull request response is invalid');
  }
  return pull;
}

async function assertPublicationCommit({
  request,
  repository,
  publicationCommit,
  baseCommit,
  path,
}) {
  const commit = await request({
    endpoint: `repos/${repository}/git/commits/${publicationCommit}`,
  });
  if (
    commit?.sha !== publicationCommit
    || !Array.isArray(commit.parents)
    || commit.parents.length !== 1
    || commit.parents[0]?.sha !== baseCommit
  ) {
    throw new Error('Publication branch must contain one generated commit');
  }
  const comparison = await request({
    endpoint: `repos/${repository}/compare/${baseCommit}...${publicationCommit}`,
  });
  if (
    comparison?.status !== 'ahead'
    || comparison.ahead_by !== 1
    || !Array.isArray(comparison.files)
    || comparison.files.length !== 1
    || comparison.files[0]?.filename !== path
    || !['added', 'modified'].includes(comparison.files[0]?.status)
  ) {
    throw new Error('Publication commit changes unexpected paths or history');
  }
}

async function assertBaseRetained({ request, repository, baseCommit, currentBase }) {
  if (baseCommit === currentBase) return;
  const comparison = await request({
    endpoint: `repos/${repository}/compare/${baseCommit}...${currentBase}`,
  });
  if (!['identical', 'ahead'].includes(comparison?.status)) {
    throw new Error('Publication base is no longer retained by the destination branch');
  }
}

async function assertPublicationPullRequest({ request, repository, pull, title, path }) {
  if (
    pull.title !== title
    || pull.base?.ref !== 'main'
    || pull.draft !== false
    || pull.changed_files !== 1
  ) {
    throw new Error('Publication pull request metadata differs from the approved transport');
  }
  const files = await request({
    endpoint: `repos/${repository}/pulls/${pull.number}/files?per_page=100`,
  });
  if (
    !Array.isArray(files)
    || files.length !== 1
    || files[0]?.filename !== path
    || !['added', 'modified'].includes(files[0]?.status)
  ) {
    throw new Error('Publication pull request changes unexpected paths');
  }
}

function validateMetadata(value) {
  if (
    value === null
    || typeof value !== 'object'
    || typeof value.repository !== 'string'
    || !value.repository.includes('/')
    || typeof value.baseBranch !== 'string'
    || value.baseBranch === ''
    || typeof value.branch !== 'string'
    || !value.branch.startsWith('tb-gatereeve-release-')
    || typeof value.version !== 'string'
    || value.version === ''
    || !COMMIT.test(value.sourceCommit ?? '')
    || !SHA256.test(value.planSha256 ?? '')
    || typeof value.path !== 'string'
    || value.path.startsWith('/')
    || value.path.split('/').includes('..')
    || !SHA256.test(value.fileSha256 ?? '')
    || !COMMIT.test(value.publicationCommit ?? '')
    || !COMMIT.test(value.baseCommit ?? '')
  ) {
    throw new Error('Publication pull request identity is invalid');
  }
  return value;
}

function assertMetadataMatch(expected, actual) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(`Publication pull request identity differs at ${key}`);
    }
  }
}

function requireCommit(value, label) {
  if (typeof value !== 'string' || !COMMIT.test(value)) {
    throw new Error(`${label} must be a full lowercase Git SHA`);
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function defaultSleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
