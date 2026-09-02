import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  parsePublicationPullRequestBody,
  preflightPublicationRepository,
  publicationBranchName,
  publishRepositoryFileViaPullRequest,
  renderPublicationPullRequestBody,
} from '../src/plugin/github-publication.js';

const repository = 'TrentBrown/gatereeve';
const version = '0.1.0-rc.1';
const sourceCommit = '8'.repeat(40);
const planSha256 = '9'.repeat(64);
const path = 'workflow-site/releases/desktop.json';
const content = '{"exact":true}\n';
const fileSha256 = sha256(content);

test('uses a deterministic branch and self-verifying pull request marker', () => {
  const branch = publicationBranchName(version, planSha256);
  assert.equal(branch, 'tb-gatereeve-release-v0.1.0-rc.1-99999999');
  const metadata = {
    repository,
    baseBranch: 'main',
    branch,
    version,
    sourceCommit,
    planSha256,
    path,
    fileSha256,
    publicationCommit: 'd'.repeat(40),
    baseCommit: 'a'.repeat(40),
  };
  const body = renderPublicationPullRequestBody(metadata);
  assert.match(body, /exact approved GateReeve release output/u);
  assert.deepEqual(parsePublicationPullRequestBody(body), metadata);
});

test('preflight is read-only and exact publication is recoverably merge-committed', async () => {
  const github = new FakeGitHub();
  await preflightPublicationRepository({ request: github.request, repository });
  assert.deepEqual(github.mutations, []);

  const first = await publish(github);
  assert.equal(first.pullRequestUrl, `https://github.com/${repository}/pull/1`);
  assert.equal(first.mergeCommit, github.mergeCommit);
  assert.equal(github.mainContent, content);
  assert.equal(github.refs.size, 0);
  assert.deepEqual(github.mutations.map((item) => `${item.method} ${item.endpoint}`), [
    `POST repos/${repository}/git/refs`,
    `PUT repos/${repository}/contents/workflow-site/releases/desktop.json`,
    `POST repos/${repository}/pulls`,
    `PUT repos/${repository}/pulls/1/merge`,
    `DELETE repos/${repository}/git/refs/heads/${publicationBranchName(version, planSha256)}`,
  ]);

  const mutationCount = github.mutations.length;
  const second = await publish(github);
  assert.deepEqual(second, first);
  assert.equal(github.mutations.length, mutationCount);
  assert.equal(github.pulls.length, 1);
});

test('leaves a blocked exact pull request for safe retry', async () => {
  const github = new FakeGitHub();
  github.mergeableState = 'blocked';
  await assert.rejects(publish(github, { attempts: 1 }), /not clean and mergeable/u);
  assert.equal(github.pulls.length, 1);
  assert.equal(github.refs.size, 1);
  github.mergeableState = 'clean';
  await assert.doesNotReject(publish(github));
  assert.equal(github.pulls.length, 1);
});

test('rejects a pre-existing publication branch with unapproved history', async () => {
  const github = new FakeGitHub();
  github.refs.set(publicationBranchName(version, planSha256), 'b'.repeat(40));

  await assert.rejects(publish(github), /contains unapproved history/u);
  assert.equal(github.pulls.length, 0);
  assert.deepEqual(github.mutations, []);
});

test('rejects an otherwise exact publication pull request with any extra path', async () => {
  const github = new FakeGitHub();
  github.mergeableState = 'blocked';
  await assert.rejects(publish(github, { attempts: 1 }), /not clean and mergeable/u);
  github.pullFiles.push({ filename: 'README.md', status: 'modified' });
  github.pulls[0].changed_files = github.pullFiles.length;
  await assert.rejects(publish(github), /metadata differs from the approved transport/u);
});

function publish(github, runtime = {}) {
  return publishRepositoryFileViaPullRequest({
    request: github.request,
    repository,
    version,
    sourceCommit,
    planSha256,
    title: `Publish GateReeve ${version} Desktop update metadata`,
    path,
    content,
    fileSha256,
    intervalMilliseconds: 0,
    ...runtime,
  });
}

class FakeGitHub {
  baseCommit = 'a'.repeat(40);
  publicationCommit = 'd'.repeat(40);
  mergeCommit = 'e'.repeat(40);
  mainContent = '{"exact":false}\n';
  mergeableState = 'clean';
  refs = new Map();
  pulls = [];
  pullFiles = [{ filename: path, status: 'modified' }];
  mutations = [];

  constructor() {
    this.request = this.request.bind(this);
  }

  async request(request) {
    const method = request.method ?? 'GET';
    const endpoint = request.endpoint;
    if (method !== 'GET') this.mutations.push({ method, endpoint });
    if (method === 'GET' && endpoint === `repos/${repository}`) {
      return { full_name: repository };
    }
    if (method === 'GET' && endpoint === `repos/${repository}/branches/main`) {
      return { commit: { sha: this.baseCommit } };
    }
    if (method === 'GET' && endpoint.startsWith(`repos/${repository}/pulls?state=all&`)) {
      return structuredClone(this.pulls);
    }
    const refMatch = endpoint.match(
      new RegExp(`^repos/${repository}/git/ref/heads/(.+)$`, 'u')
    );
    if (method === 'GET' && refMatch) {
      const branch = decodeURIComponent(refMatch[1]);
      const sha = this.refs.get(branch);
      if (!sha && request.allowNotFound) return null;
      return { object: { sha } };
    }
    if (method === 'POST' && endpoint === `repos/${repository}/git/refs`) {
      const branch = request.body.ref.replace('refs/heads/', '');
      this.refs.set(branch, request.body.sha);
      return { object: { sha: request.body.sha } };
    }
    const contentsMatch = endpoint.match(
      new RegExp(`^repos/${repository}/contents/(.+?)(?:\\?ref=(.+))?$`, 'u')
    );
    if (method === 'GET' && contentsMatch) {
      const reference = decodeURIComponent(contentsMatch[2] ?? 'main');
      const current = reference === 'main'
        ? this.mainContent
        : this.refs.get(reference) === this.publicationCommit
          ? content
          : this.mainContent;
      return {
        type: 'file',
        sha: sha256(current).slice(0, 40),
        content: Buffer.from(current).toString('base64'),
      };
    }
    if (method === 'PUT' && contentsMatch) {
      const branch = request.body.branch;
      this.refs.set(branch, this.publicationCommit);
      return { commit: { sha: this.publicationCommit } };
    }
    if (method === 'POST' && endpoint === `repos/${repository}/pulls`) {
      const pull = {
        number: 1,
        html_url: `https://github.com/${repository}/pull/1`,
        title: request.body.title,
        body: request.body.body,
        state: 'open',
        merged: false,
        mergeable: true,
        mergeable_state: this.mergeableState,
        merge_commit_sha: null,
        base: { ref: request.body.base },
        draft: false,
        changed_files: 1,
        head: {
          ref: request.body.head,
          sha: this.refs.get(request.body.head),
        },
      };
      this.pulls.push(pull);
      return structuredClone(pull);
    }
    const pullMatch = endpoint.match(new RegExp(`^repos/${repository}/pulls/(\\d+)$`, 'u'));
    if (method === 'GET' && pullMatch) {
      const pull = this.pulls[Number(pullMatch[1]) - 1];
      pull.mergeable_state = this.mergeableState;
      return structuredClone(pull);
    }
    const pullFilesMatch = endpoint.match(
      new RegExp(`^repos/${repository}/pulls/(\\d+)/files\\?per_page=100$`, 'u')
    );
    if (method === 'GET' && pullFilesMatch) {
      return structuredClone(this.pullFiles);
    }
    const commitMatch = endpoint.match(
      new RegExp(`^repos/${repository}/git/commits/([a-f0-9]{40})$`, 'u')
    );
    if (method === 'GET' && commitMatch) {
      assert.equal(commitMatch[1], this.publicationCommit);
      return {
        sha: this.publicationCommit,
        parents: [{ sha: 'a'.repeat(40) }],
      };
    }
    const compareMatch = endpoint.match(
      new RegExp(`^repos/${repository}/compare/([a-f0-9]{40})\\.\\.\\.([a-f0-9]{40})$`, 'u')
    );
    if (method === 'GET' && compareMatch) {
      if (compareMatch[2] === this.publicationCommit) {
        return {
          status: 'ahead',
          ahead_by: 1,
          files: [{ filename: path, status: 'modified' }],
        };
      }
      return { status: 'ahead', ahead_by: 1, files: [] };
    }
    const mergeMatch = endpoint.match(
      new RegExp(`^repos/${repository}/pulls/(\\d+)/merge$`, 'u')
    );
    if (method === 'PUT' && mergeMatch) {
      const pull = this.pulls[Number(mergeMatch[1]) - 1];
      assert.equal(request.body.sha, this.publicationCommit);
      pull.state = 'closed';
      pull.merged = true;
      pull.merge_commit_sha = this.mergeCommit;
      this.mainContent = content;
      this.baseCommit = this.mergeCommit;
      return { merged: true, sha: this.mergeCommit };
    }
    const deleteMatch = endpoint.match(
      new RegExp(`^repos/${repository}/git/refs/heads/(.+)$`, 'u')
    );
    if (method === 'DELETE' && deleteMatch) {
      this.refs.delete(decodeURIComponent(deleteMatch[1]));
      return null;
    }
    throw new Error(`Unhandled fake request: ${method} ${endpoint}`);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
