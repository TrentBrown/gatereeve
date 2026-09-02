// @ts-check

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const FEATURE_ID = '[A-Za-z0-9._-]+';
const ROOT_ARTIFACT = '(?:completion-report|decisions|issues|scratchpad|tracker)\\.md';
const PACKET_ARTIFACT = '(?:boundary\\.json|code-review\\.md|explain-diff\\.html|judge\\.md|pattern-review\\.md|spec-evaluation\\.md|verification\\.md)';

const REVIEW_ARTIFACT_PATTERNS = [
  new RegExp(`^docs/issues/${FEATURE_ID}/events\\.jsonl$`, 'u'),
  new RegExp(`^docs/issues/${FEATURE_ID}/${ROOT_ARTIFACT}$`, 'u'),
  new RegExp(`^docs/issues/${FEATURE_ID}/pr-[0-9]+/${PACKET_ARTIFACT}$`, 'u'),
];

/** @param {string[]} paths */
export function classifyReviewArtifactPaths(paths) {
  return paths.length > 0 && paths.every((path) => (
    REVIEW_ARTIFACT_PATTERNS.some((pattern) => pattern.test(path))
  ))
    ? 'review-artifacts'
    : 'full';
}

/** @param {string[]} paths */
export function reviewArtifactFeatureHomes(paths) {
  if (classifyReviewArtifactPaths(paths) !== 'review-artifacts') return [];
  return [...new Set(paths.map((path) => path.split('/').slice(0, 3).join('/')))].sort();
}

/** @param {Buffer} content */
export function parseChangedPaths(content) {
  const separator = content.includes(0) ? '\0' : '\n';
  return content.toString('utf8').split(separator).filter(Boolean);
}

async function main() {
  const featureHomes = process.argv.includes('--feature-homes');
  const path = process.argv.find((argument, index) => index > 1 && !argument.startsWith('--'));
  if (!path) throw new Error('Usage: review-artifact-change.mjs [--feature-homes] <paths-file>');
  const paths = parseChangedPaths(await readFile(path));
  if (featureHomes) {
    process.stdout.write(`${reviewArtifactFeatureHomes(paths).join('\n')}\n`);
    return;
  }
  process.stdout.write(`${classifyReviewArtifactPaths(paths)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
