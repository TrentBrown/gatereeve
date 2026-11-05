import { metricsRequest } from '../performance.js';
import { Command } from 'commander';
import { cleanupScratch, inspectScratch, runScratchCommand, cleanupInstallers, inspectInstallers,
  addInstaller, setInstallerHold, withInstallerLease } from '../storage.js';

function print(result, asJson) {
  if (asJson) { console.log(JSON.stringify(result, null, 2)); return; }
  console.log(`Scratch root: ${result.root}`);
  if (result.error) console.log(`Unavailable: ${result.error}`);
  for (const entry of result.entries) console.log(`${entry.status}: ${entry.id}${entry.bytes === null ? '' : ` (${entry.bytes} allocated bytes)`}${entry.reason ? ` — ${entry.reason}` : ''}`);
  if (!result.entries.length && !result.error) console.log('No managed scratch runs.');
  if (result.applied) console.log(`Removed ${result.removed.length} run(s), ${result.reclaimedBytes} allocated bytes. Filesystem free-space changes may differ.`);
  else console.log(result.quick ? 'Read-only inventory; run gatereeve cleanup for activity and size checks.' : `Preview only: ${result.eligibleBytes ?? 'unknown'} eligible bytes. Use --apply to remove eligible runs.`);
  for (const error of result.errors ?? []) console.error(`${error.id}: ${error.reason}`);
  if (result.metrics) console.log(`Metrics: ${JSON.stringify(result.metrics)}`);
  if (result.installers) {
    const installers = result.installers;
    console.log(`Local installers: ${installers.root}`);
    if (installers.error) console.error(installers.error);
    for (const item of installers.entries) console.log(`${item.status}: ${item.id} ${item.version ?? ''}${item.bytes === null ? '' : ` (${item.bytes} allocated bytes)`}${item.reason ? ` — ${item.reason}` : ''}`);
    for (const error of installers.errors ?? []) console.error(`${error.id}: ${error.reason}`);
    if (installers.applied) console.log(`Removed ${installers.removed.length} old installer(s), ${installers.reclaimedBytes} allocated bytes; records preserved.`);
  }
}

export function cleanupCommands() {
  const cleanup = new Command('cleanup').description('Preview managed scratch and obsolete local DMGs; never scan arbitrary legacy paths')
    .option('--apply', 'Remove eligible runs after rechecking ownership, activity and mounts')
    .option('--run <id>', 'Inspect or remove only this exact managed run')
    .option('--json', 'Print structured results')
    .action(async options => {
      const result = await cleanupScratch(options);
      if (!options.run) result.installers = await cleanupInstallers({ apply: !!options.apply });
      if (!options.run) result.metrics = await metricsRequest('cleanup', {apply:!!options.apply}).catch(() => ({unavailable:true}));
      print(result, options.json);
      if (result.error || result.errors?.length || result.installers?.error || result.installers?.errors?.length) process.exitCode = 1;
    });
  const doctor = new Command('doctor').description('Report managed temporary storage without deleting files')
    .option('--json', 'Print structured advisory inventory')
    .action(async options => print({ ...await inspectScratch({ quick: true }), installers: await inspectInstallers({ quick: true }), metrics: await metricsRequest('status').catch(() => ({unavailable:true})) }, options.json));
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
  const installer = new Command('installer').description('Manage owned local installer copies and consumer holds').enablePositionalOptions();
  installer.command('add').description('Copy an explicitly selected successful DMG into managed retention; preserve its original')
    .argument('<path>').requiredOption('--version <version>', 'Version of the successful installer')
    .action(async (path, options) => console.log(JSON.stringify(await addInstaller({ path, version: options.version }))));
  installer.command('hold').argument('<id>').requiredOption('--until <date>', 'Expiry timestamp')
    .requiredOption('--reason <text>', 'Why this installer is retained')
    .action(async (id, options) => console.log(JSON.stringify(await setInstallerHold({ id, ...options }))));
  installer.command('release-hold').argument('<id>')
    .action(async id => console.log(JSON.stringify(await setInstallerHold({ id }))));
  installer.command('use').description('Protect a consumer; {installer} arguments expand to its DMG path')
    .argument('<id>').argument('<command>').argument('[args...]').passThroughOptions()
    .action(async (id, command, args) => withInstallerLease({ id }, path => runScratchCommand(command,
      args.map(arg => arg === '{installer}' ? path : arg), { cwd: process.cwd(), purpose: 'installer-consumer',
        env: { ...process.env, GATEREEVE_INSTALLER_PATH: path } })));
  return [cleanup, doctor, scratch, installer];
}
