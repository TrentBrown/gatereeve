import { pathToFileURL } from 'node:url';
import { validateModuleProviderRequest } from '../../resources/protocol/module-runtime.js';
import { observeReleaseConductor } from '../../resources/release/release-conductor-observer.js';
export { observeReleaseConductor };
const PROVIDER = Object.freeze({ id: 'gatereeve/release-conductor', version: '1.0.0' });

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const lines = input.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length !== 1) throw new Error('Provider requires exactly one JSON request line');
  const request = validateModuleProviderRequest(JSON.parse(lines[0]));
  if (request.provider.id !== PROVIDER.id || request.provider.version !== PROVIDER.version) {
    throw new Error('Provider request identity does not match this executable');
  }
  process.stdout.write(`${JSON.stringify(await observeReleaseConductor(request))}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
