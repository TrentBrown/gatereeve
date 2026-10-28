import { access } from 'node:fs/promises';

let loaded;
for (const url of [new URL('../../plugin-src/shared/resources/storage/scratch.js', import.meta.url),
  new URL('../resources/storage/scratch.js', import.meta.url)]) {
  try { await access(url); loaded = await import(url.href); break; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!loaded) throw new Error('GateReeve scratch helper is missing; reinstall or stage CLI resources');
export const { cleanupScratch, inspectScratch, runScratchCommand, withScratch } = loaded;
