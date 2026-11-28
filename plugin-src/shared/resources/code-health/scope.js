// Scope of a code-health run: the merge base, the head, and the changed files
// the configuration selects, with renamed files mapped back to their base path.
import { git, parseToml, selector, Unavailable } from './process.js';

export const CONFIG_PATH = '.habit-hooks/config.toml';
export const SETTINGS_PATH = '.habit-hooks/gatereeve.json';

export async function readCommitted(root, commit, path) {
  try {
    return await git(root, ['show', `${commit}:${path}`]);
  } catch {
    return null;
  }
}

export async function resolveRevisions(root, base) {
  const head = (await git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
  const headTree = (await git(root, ['rev-parse', '--verify', 'HEAD^{tree}'])).trim();
  let mergeBase;
  try {
    mergeBase = (await git(root, ['merge-base', base, head])).trim();
  } catch {
    throw new Unavailable('invalid-base', `No merge base between ${base} and HEAD; fetch the integration base and retry`);
  }
  return { base, head, headTree, mergeBase };
}

export async function readConfig(root, head, options) {
  const text = await readCommitted(root, head, CONFIG_PATH);
  if (text === null) {
    throw new Unavailable('not-set-up', `Code health is not set up: ${CONFIG_PATH} is not committed at HEAD.`);
  }
  return { text, config: await parseToml(text, options) };
}

// `git diff --name-status -z` emits status, then one path (or two for a
// rename/copy), each NUL-terminated.
export function parseNameStatus(output) {
  const parts = output.split('\0').filter(part => part !== '');
  const changes = [];
  for (let index = 0; index < parts.length;) {
    const status = parts[index++];
    const kind = status[0];
    if (kind === 'R' || kind === 'C') {
      const from = parts[index++];
      const to = parts[index++];
      changes.push({ kind, head: to, base: kind === 'R' ? from : null });
    } else {
      const path = parts[index++];
      changes.push({ kind, head: kind === 'D' ? null : path, base: kind === 'A' ? null : path });
    }
  }
  return changes;
}

export async function changedFiles(root, mergeBase, head, globs) {
  const output = await git(root, ['diff', '-M', '--no-color', '--name-status', '-z', mergeBase, head]);
  const select = selector(globs);
  return parseNameStatus(output)
    .filter(change => change.head !== null && select(change.head))
    .map(change => ({ head: change.head, base: change.base }))
    .sort((left, right) => left.head.localeCompare(right.head));
}
