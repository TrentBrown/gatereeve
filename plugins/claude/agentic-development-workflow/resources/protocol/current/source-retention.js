import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { identity, requireThat } from './contracts.js';
import { sourceGit, objectId } from './git-source.js';

export async function sourcePreparation(store, context, input, runId, operation) {
  requireThat(Array.isArray(input.repositories) && input.repositories.length > 0, 'Select source repositories');
  requireThat(new Set(input.repositories.map(repo => repo.alias)).size === input.repositories.length, 'Duplicate source repository');
  const owner = identity({ home: store.home, feature: context.featureId, run: runId }).slice(7);
  const id = identity({ owner, operationId: operation.id }).slice(7); const pins = [];
  for (const selected of input.repositories) {
    const repository = context.repositories.find(repo => repo.alias === selected.alias);
    requireThat(repository, 'Source repository is not configured');
    const root = await realpath(repository.path);
    requireThat(root === await realpath((await sourceGit(repository, ['rev-parse', '--show-toplevel'])).trim()), 'Configured source must be a Git working-tree root');
    const common = await realpath(resolve(root, (await sourceGit(repository, ['rev-parse', '--git-common-dir'])).trim()));
    const format = (await sourceGit(repository, ['rev-parse', '--show-object-format'])).trim();
    for (const [endpoint, commit] of Object.entries({ base: selected.base, head: selected.head, target: selected.target ?? selected.base })) {
      objectId(commit, format);
      requireThat((await sourceGit(repository, ['rev-parse', `${commit}^{commit}`])).trim() === commit, 'Pinned source is not a commit');
      pins.push({ alias: selected.alias, path: root, common, format, endpoint, commit,
        ref: `refs/gatereeve/${owner}/${id}/${identity(selected.alias).slice(7)}/${endpoint}` });
    }
  }
  return { owner, id, operation, pins };
}
async function currentRef(repository, ref) {
  // show-ref returns 1 for absence and must not hide other failures.
  const listing = await sourceGit(repository, ['for-each-ref', '--format=%(refname) %(objectname)', ref]);
  const exact = listing.trim().split('\n').find(line => line.startsWith(`${ref} `));
  return exact?.slice(ref.length + 1) ?? null;
}
export async function ensurePins(context, preparation) {
  for (const pin of preparation.pins) {
    const repository = context.repositories.find(repo => repo.alias === pin.alias);
    requireThat(repository && await realpath(repository.path) === pin.path, 'Pinned repository configuration changed');
    const current = await currentRef(repository, pin.ref);
    requireThat(!current || current === pin.commit, `Conflicting source retention reference: ${pin.ref}`);
    if (!current) await sourceGit(repository, ['update-ref', pin.ref, pin.commit, '0'.repeat(pin.commit.length)]);
  }
}
export async function checkPins(context, preparation) {
  requireThat(preparation?.owner && preparation?.id && Array.isArray(preparation.pins), 'Missing source retention ownership');
  const repositories = new Map();
  for (const pin of preparation.pins) {
    if (!repositories.has(pin.alias)) {
      const repository = context.repositories.find(repo => repo.alias === pin.alias);
      requireThat(repository, 'Pinned repository configuration changed');
      const root = await realpath(repository.path);
      const common = await realpath(resolve(repository.path, (await sourceGit(repository, ['rev-parse', '--git-common-dir'])).trim()));
      const listing = await sourceGit(repository, ['for-each-ref', '--format=%(refname) %(objectname)', `refs/gatereeve/${preparation.owner}/${preparation.id}/`]);
      const refs = new Map(listing.trim().split('\n').filter(Boolean).map(line => line.split(' ')));
      repositories.set(pin.alias, { root, common, refs });
    }
    const { root, common, refs } = repositories.get(pin.alias);
    requireThat(root === pin.path && common === pin.common, 'Pinned repository or Git common directory changed');
    requireThat(refs.get(pin.ref) === pin.commit, `Source retention reference unavailable or changed: ${pin.ref}`);
  }
}
export async function releasePins(context, preparations) {
  const errors = [];
  for (const prep of preparations) for (const pin of prep.pins) {
    try {
      requireThat(pin.ref.startsWith(`refs/gatereeve/${prep.owner}/${prep.id}/`), 'Source retention ownership mismatch');
      const repository = context.repositories.find(repo => repo.alias === pin.alias);
      requireThat(repository && await realpath(repository.path) === pin.path, 'Cleanup repository changed or unavailable');
      const common = await realpath(resolve(repository.path, (await sourceGit(repository, ['rev-parse', '--git-common-dir'])).trim()));
      requireThat(common === pin.common, 'Cleanup Git common directory changed');
      const current = await currentRef(repository, pin.ref);
      requireThat(!current || current === pin.commit, `Conflicting source retention reference: ${pin.ref}`);
      if (current) await sourceGit(repository, ['update-ref', '-d', pin.ref, pin.commit]);
    } catch (error) { errors.push({ ref: pin.ref, reason: error.message }); }
  }
  return { status: errors.length ? 'pending' : 'released', errors };
}
