import { execFile } from 'node:child_process';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { withScratch } from '../../../plugin-src/shared/resources/storage/scratch.js';

const execute = promisify(execFile);
const scripts = dirname(fileURLToPath(import.meta.url));

// Developer verification only. Production signing/publication still belongs to
// Release Conductor; its requested outputs are never managed scratch.
export async function verifyLocalPackage({ reportPath, version, keepUntil = null, runtime = {} }) {
  if (!reportPath) throw new Error('An external --report path is required');
  const destination = resolve(reportPath);
  await mkdir(dirname(destination), { recursive: true });
  const report = join(await realpath(dirname(destination)), destination.split('/').at(-1));
  let cleanup;
  const result = await withScratch({ purpose: 'desktop-package-verification', keepUntil,
    ...(runtime.root ? { root: runtime.root } : {}), onCleanup: value => { cleanup = value; },
  }, async ({ path, id }) => {
    if (report === path || report.startsWith(`${path}/`)) throw new Error('Report must be outside disposable scratch');
    const packageMacos = runtime.packageMacos ?? (await import('./package-macos.mjs')).packageMacos;
    const verifyDmg = runtime.verifyDmg ?? (await import('./verify-macos-package.mjs')).verifyDmg;
    const createFixture = runtime.createFixture ?? (fixture => execute(process.execPath, [join(scripts, 'create-smoke-fixture.mjs'), fixture]));
    const fixture = join(path, 'fixture');
    const built = await packageMacos({ outputRoot: join(path, 'package'), version });
    await createFixture(fixture);
    const verification = await verifyDmg({ dmgPath: built.dmgPath, version: built.version, fixturePath: fixture });
    const receipt = { kind: 'gatereeve-local-package-verification', runId: id, version: built.version,
      dmgSha256: built.dmgSha256, dmgBytes: built.dmgBytes, verification, publicRelease: false,
      recordedAt: new Date().toISOString() };
    // Don't overwrite a previous run's evidence or follow a destination symlink.
    await writeFile(report, JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
    return receipt;
  });
  return { ...result, reportPath: report, scratchCleanup: cleanup };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
  const result = await verifyLocalPackage({ reportPath: argument('--report'), version: argument('--version'),
    keepUntil: process.argv.includes('--keep') ? new Date(Date.now() + 86400000).toISOString() : null });
  console.log(JSON.stringify(result, null, 2));
}
