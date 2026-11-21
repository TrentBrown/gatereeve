import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, identity, requireThat } from './contracts.js';
import { localPath } from './store.js';

export async function outputIdentity(root, path) {
  localPath(path);
  let parent = root;
  for (const part of path.split('/')) {
    parent = join(parent, part);
    requireThat(!(await lstat(parent)).isSymbolicLink(), 'Generated output scope cannot traverse a symlink; declare its real output scope');
  }
  const visit = async absolute => {
    const info = await lstat(absolute);
    requireThat(!info.isSymbolicLink(), 'Generated output links require a concrete output scope');
    if (info.isFile()) return { mode: info.mode & 0o777, hash: digest(await readFile(absolute)) };
    requireThat(info.isDirectory(), 'Unsupported generated output kind');
    const entries = [];
    for (const name of (await readdir(absolute)).sort()) entries.push([name, await visit(join(absolute, name))]);
    return { mode: info.mode & 0o777, hash: identity(entries) };
  };
  return { path, hash: identity(await visit(join(root, path))) };
}

export async function qualifyGeneratedInputs(core, state, candidate, check, receipts, root) {
  requireThat(Array.isArray(check.generatedInputs ?? []), 'Generated inputs must be an array');
  const qualified = [];
  for (const input of check.generatedInputs ?? []) {
    requireThat(input && Object.keys(input).every(key => ['path', 'fromCheck', 'fromResult'].includes(key)), 'Unsupported generated input declaration');
    requireThat(Number.isSafeInteger(input.fromCheck) !== Boolean(input.fromResult), 'Generated input needs exactly one preparation receipt, not just an output hash');
    let producers;
    if (input.fromResult) {
      const result = await core.currentResult(input.fromResult, candidate, state, new Set(), new Map(), false);
      requireThat(result.outcome === 'PASS' && result.runner, 'Generated input preparation is not applicable passing execution');
      producers = (await core.store.json(result.runner)).receipts;
    } else {
      requireThat(input.fromCheck >= 0 && input.fromCheck < receipts.length, 'Preparation must precede consumption');
      producers = [receipts[input.fromCheck]];
    }
    const current = await outputIdentity(root, input.path);
    requireThat(producers.some(receipt => receipt.repository === check.repository && receipt.outcome === 'PASS'
      && receipt.outputs?.some(output => identity(output) === identity(current))),
    `Generated input ${input.path} lacks applicable build provenance or its output changed; regenerate it`);
    qualified.push(current);
  }
  return qualified;
}
