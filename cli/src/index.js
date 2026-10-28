import { Command } from 'commander';

import { pluginCommands } from './commands/plugin.js';
import { currentCommands } from './commands/current.js';
import { addTreeCommand } from './help-tree.js';
import { cleanupCommands } from './commands/cleanup.js';

export function createProgram() {
  const program = new Command().enablePositionalOptions();

  program
    .name('gatereeve')
    .description('Observe and enforce the GateReeve workflow protocol')
    .version('0.1.0')
    .showHelpAfterError();

  for (const command of currentCommands()) program.addCommand(command);
  program.addCommand(pluginCommands());
  for (const command of cleanupCommands()) program.addCommand(command);
  addTreeCommand(program, { cliName: 'GateReeve CLI' });

  return program;
}

export async function main(argv) {
  const program = createProgram();

  try {
    await program.parseAsync(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!error?.reported) console.error(`Error: ${message}`);
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}
