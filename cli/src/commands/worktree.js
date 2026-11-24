import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { sweep, describe } from '../worktree-sweep.js';

async function ask(item) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(describe(item));
    return /^y(es)?$/iu.test((await rl.question(`Remove ${item.path} and everything in it? [y/N] `)).trim());
  } finally { rl.close(); }
}

export function worktreeCommands() {
  const root = new Command('worktree').description('Inspect and remove finished git worktrees');
  root.command('sweep').description('Preview finished worktrees (merged, PR merged or closed, GateReeve run complete, or stale) and what in them might matter')
    .argument('[repositories...]', 'Main checkouts to inspect; default: every repository under --root')
    .option('--root <path>', 'Directory holding repositories (default ~/Code)')
    .option('--apply', 'Remove worktrees after a per-worktree confirmation')
    .option('--yes', 'Non-interactive: with --apply, remove only worktrees with nothing listed')
    .option('--json', 'Print structured results')
    .action(async (repositories, options) => {
      if (options.yes && !options.apply) throw new Error('--yes needs --apply');
      if (options.apply && !options.yes && !process.stdin.isTTY) throw new Error('--apply needs a terminal for confirmation; use --yes to remove only worktrees with nothing listed');
      const result = await sweep({ repositories, ...(options.root ? { root: options.root } : {}), apply: options.apply === true, yes: options.yes === true, confirm: ask });
      if (options.json) { console.log(JSON.stringify(result, null, 2)); return; }
      for (const group of ['candidate', 'stale', 'active', 'skipped']) {
        const items = result.worktrees.filter(item => item.status === group);
        if (!items.length) continue;
        console.log(`\n${group} (${items.length})`);
        for (const item of items) console.log(describe(item));
      }
      if (!result.applied) console.log('\nPreview only. Use --apply to confirm each removal, or --apply --yes to remove only worktrees with nothing listed. Remote branches are never touched.');
      else {
        for (const item of result.removed) console.log(`removed: ${item.path}${item.branchDeleted ? ' (merged local branch deleted)' : ''}`);
        for (const item of result.declined) console.log(`kept: ${item.path} — ${item.reason}`);
        for (const item of result.errors) console.error(`error: ${item.path} — ${item.reason}`);
      }
    });
  return root;
}
