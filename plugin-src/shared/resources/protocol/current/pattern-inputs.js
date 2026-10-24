import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSafe } from './store.js';
import { digest, requireThat } from './contracts.js';
const exec = promisify(execFile);
const script = fileURLToPath(new URL('../../scripts/pattern_tool.py', import.meta.url));

export async function patternInputs(store, context, candidate, { capture = true } = {}) {
  const repositories = [];
  for (const pin of candidate.repositories) {
    const repository = context.repositories.find(item => item.alias === pin.alias);
    const { stdout } = await exec('python3', [script, 'review-inputs', '--cwd', repository.path, '--base', pin.base, '--head', pin.head], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    const result = JSON.parse(stdout);
    requireThat(Array.isArray(result.ruleSources) && result.ruleSources.length > 0 && Array.isArray(result.activeRules), 'Pattern scope or active rule inventory is unavailable');
    const sources = [];
    for (const root of result.ruleSources) {
      requireThat(basename(root) === '.pattern-review', 'Invalid resolved pattern scope');
      const bytes = await readSafe(dirname(root), join('.pattern-review', 'rules.yaml'));
      sources.push({ root, reference: capture ? await store.put(bytes) : { hash: digest(bytes), bytes: bytes.length } });
    }
    repositories.push({ alias: pin.alias, sources, rules: result.activeRules, triggers: result.triggeredRules, overrides: result.overrides });
  }
  return repositories;
}
