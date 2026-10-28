import { Command } from 'commander';
import { cleanupScratch, inspectScratch, runScratchCommand } from '../storage.js';

function print(result, asJson) {
  if (asJson) { console.log(JSON.stringify(result, null, 2)); return; }
  console.log(`Scratch root: ${result.root}`);
  if (result.error) console.log(`Unavailable: ${result.error}`);
  for (const entry of result.entries) console.log(`${entry.status}: ${entry.id}${entry.bytes === null ? '' : ` (${entry.bytes} allocated bytes)`}${entry.reason ? ` — ${entry.reason}` : ''}`);
  if (!result.entries.length && !result.error) console.log('No managed scratch runs.');
  if (result.applied) console.log(`Removed ${result.removed.length} run(s), ${result.reclaimedBytes} allocated bytes. Filesystem free-space changes may differ.`);
  else console.log(result.quick ? 'Read-only inventory; run gatereeve cleanup for activity and size checks.' : `Preview only: ${result.eligibleBytes ?? 'unknown'} eligible bytes. Use --apply to remove eligible runs.`);
  for (const error of result.errors ?? []) console.error(`${error.id}: ${error.reason}`);
}

export function cleanupCommands() {
  const cleanup = new Command('cleanup').description('Preview managed temporary runs; never scan legacy /tmp prefixes')
    .option('--apply', 'Remove eligible runs after rechecking ownership, activity and mounts')
    .option('--run <id>', 'Inspect or remove only this exact managed run')
    .option('--json', 'Print structured results')
    .action(async options => {
      const result = await cleanupScratch(options);
      print(result, options.json);
      if (result.error || result.errors?.length) process.exitCode = 1;
    });
  const doctor = new Command('doctor').description('Report managed temporary storage without deleting files')
    .option('--json', 'Print structured advisory inventory')
    .action(async options => print(await inspectScratch({ quick: true }), options.json));
  const scratch = new Command('scratch').description('Run a command inside owned disposable scratch').enablePositionalOptions();
  scratch.command('run').description('Run in a fresh directory; use absolute command/input paths and export required outputs')
    .option('--cwd <path>', 'Keep a specified working directory while managing child temporary files')
    .option('--purpose <text>', 'Short description of this invocation')
    .option('--keep-hours <hours>', 'Retain bulk until this hold expires (cleanup remains on demand)', value => {
      const hours = Number(value);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 8760) throw new Error('--keep-hours must be between 0 and 8760');
      return hours;
    })
    .argument('<command>').argument('[args...]').passThroughOptions()
    .action(async (command, args, options) => runScratchCommand(command, args, {
      cwd: options.cwd, purpose: options.purpose, keepUntil: options.keepHours ? new Date(Date.now() + options.keepHours * 3600000).toISOString() : null,
      onCleanup: result => {
        const retained = result.entries.filter(item => !result.removed.some(removed => removed.id === item.id));
        console.error(JSON.stringify({ scratchCleanup: { removed: result.removed, retained, errors: result.errors ?? [] } }));
      },
    }));
  return [cleanup, doctor, scratch];
}
