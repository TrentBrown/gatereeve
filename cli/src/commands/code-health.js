import { access } from 'node:fs/promises';
import { Command } from 'commander';

async function entryPoint() {
  for (const url of [
    new URL('../../../plugin-src/shared/resources/code-health/cli.js', import.meta.url),
    new URL('../../resources/code-health/cli.js', import.meta.url),
  ]) {
    try {
      await access(url);
      return url;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('GateReeve code-health resources missing; stage resources or reinstall');
}

export function codeHealthCommands() {
  return new Command('code-health')
    .description('Compare code health with the merge base using Habit Hooks (0 PASS, 1 FAIL, 2 UNAVAILABLE)')
    .helpOption(false)
    .allowUnknownOption(true)
    .argument('[args...]', 'run --base <ref> [--json] [--approved <sha256>] …')
    .passThroughOptions()
    .action(async args => {
      const { main } = await import((await entryPoint()).href);
      process.exitCode = await main(args);
    });
}
