import { Command, addTreeCommand } from 'qp-cli-core';

import { pluginCommands } from './commands/plugin.js';

export function createProgram() {
  const program = new Command();

  program
    .name('cli')
    .description('Maintain the Agentic Software Development Workflow plugin')
    .version('0.1.0')
    .showHelpAfterError();

  program.addCommand(pluginCommands());
  addTreeCommand(program, { cliName: 'Workflow CLI' });

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
