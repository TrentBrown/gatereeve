// CI checks retained current journals when present. Local-only evidence is
// optional in Git; historical document validation does not replay old passage.
import { realpath } from 'node:fs/promises';
import { basename, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CurrentCore } from '../plugin-src/shared/resources/protocol/current/core.js';

export async function validateLocalRecord(featureHome, workspaceRoot = process.cwd()) {
  const root = await realpath(workspaceRoot);
  const home = resolve(root, featureHome);
  const local = relative(root, home);
  if (isAbsolute(local) || !/^docs\/issues\/[^/]+$/u.test(local)) throw new Error('Expected a canonical feature home in this workspace');
  const core = await CurrentCore.at({ workspaceRoot: root, featureHome: home, featureId: basename(home), repositories: [] });
  if (!await core.store.active()) return { mode: 'documents-only', journal: 'No tracked current run; historical passage is not replayed.' };
  const { state, events } = await core.state();
  return { mode: 'current-journal', runId: state.runId, events: events.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await validateLocalRecord(process.argv[2])));
}
