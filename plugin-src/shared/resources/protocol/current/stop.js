import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// Stop hook (spec AC5): in a goal run whose terminal state is still null, block
// the turn from ending and name the goal condition and the next step. Fails
// open: an unreadable run state, a non-goal run or a terminal state never
// blocks. A stall valve admits the stop after STALL_LIMIT consecutive blocks in
// which the run recorded no new event, so a stuck agent cannot loop forever.
export const STALL_LIMIT = 3;

function block(reason) { return { decision: 'block', reason }; }

async function stallRecord(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

export async function stopHook(event, runtime = {}) {
  try {
    const adapter = await import('./adapter.js');
    const context = await (runtime.contextFor ?? adapter.contextFor)({ cwd: event?.cwd ?? process.cwd() });
    const status = await adapter.currentSnapshot(context, {}, runtime.core ?? {});
    const goal = status?.goal;
    if (!goal || goal.terminal !== null) return {};
    const runId = status.current?.runId ?? 'run';
    const directory = runtime.stallDirectory ?? join(tmpdir(), 'gatereeve-stop-hook');
    const path = join(directory, `${createHash('sha256').update(`${context.featureHome}:${runId}`).digest('hex').slice(0, 32)}.json`);
    const previous = await stallRecord(path);
    const eventCount = status.events?.count ?? 0;
    const blocks = previous?.eventCount === eventCount ? (previous.blocks ?? 0) + 1 : 1;
    await mkdir(directory, { recursive: true });
    await writeFile(path, JSON.stringify({ eventCount, blocks }));
    if (blocks > STALL_LIMIT) return {};
    const next = status.current?.phase ? `phase ${status.current.phase}; ${goal.reason}` : goal.reason;
    return block(`GateReeve goal run is not finished: ${goal.condition} Current state: ${next}. `
      + 'Keep working toward a ready final PR without asking the human. If a real blocker stops you, open a PR listing the blockers, '
      + 'record goal.park, then ask through the question tool. While CI or reviews are pending, wait with a PR watcher instead of ending the turn.');
  } catch { return {}; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let event = {};
  try { event = JSON.parse(input); } catch { /* Fail open on unreadable input. */ }
  process.stdout.write(`${JSON.stringify(await stopHook(event))}\n`);
}
