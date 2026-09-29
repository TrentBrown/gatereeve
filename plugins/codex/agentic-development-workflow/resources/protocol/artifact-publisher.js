import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import { sha256Digest } from './agent-workflow.js';
import { ContractError } from './errors.js';

function serialize(value) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return value;
  return `${JSON.stringify(value)}\n`;
}

function safeTarget(root, path) {
  if (
    typeof path !== 'string'
    || path === ''
    || path.startsWith('/')
    || path.includes('\\')
    || path.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) throw new ContractError(`Agent workflow artifact path is unsafe: ${path}`);
  const target = resolve(root, path);
  if (!target.startsWith(`${root}${sep}`)) throw new ContractError(`Agent workflow artifact escapes its root: ${path}`);
  return target;
}

export async function publishAgentWorkflowArtifacts({
  artifactRoot,
  module,
  files,
  randomId = randomUUID,
}) {
  if (module?.run?.kind !== 'agent-workflow') throw new ContractError('Artifact publication requires an agent workflow module');
  if (files === null || typeof files !== 'object' || Array.isArray(files)) {
    throw new ContractError('Agent workflow files must be an object');
  }
  const root = resolve(artifactRoot);
  const declared = new Map(module.run.artifacts.map((artifact) => [artifact.path, artifact]));
  for (const path of Object.keys(files)) {
    if (!declared.has(path)) throw new ContractError(`Agent workflow produced undeclared artifact: ${path}`);
  }
  for (const artifact of module.run.artifacts.filter((item) => item.required)) {
    if (!Object.hasOwn(files, artifact.path)) {
      throw new ContractError(`Required agent workflow artifact is missing: ${artifact.path}`);
    }
  }
  await mkdir(root, { recursive: true });
  const prepared = [];
  try {
    for (const [path, value] of Object.entries(files)) {
      const target = safeTarget(root, path);
      await mkdir(resolve(target, '..'), { recursive: true });
      try {
        const existing = await lstat(target);
        if (existing.isSymbolicLink() || !existing.isFile()) {
          throw new ContractError(`Agent workflow artifact target is unsafe: ${path}`);
        }
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      const content = serialize(value);
      const temporary = `${target}.${randomId()}.tmp`;
      await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
      prepared.push({ path, target, temporary, content });
    }
    for (const item of prepared) await rename(item.temporary, item.target);
  } catch (error) {
    const { rm } = await import('node:fs/promises');
    await Promise.all(prepared.map((item) => rm(item.temporary, { force: true })));
    throw error;
  }
  return prepared.map((item) => ({
    path: item.path,
    hash: sha256Digest(item.content),
    bytes: Buffer.byteLength(item.content),
  }));
}
