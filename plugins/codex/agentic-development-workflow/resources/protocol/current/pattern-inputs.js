import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, basename, join } from 'node:path';
import { pythonScriptsRoot } from '../python-guards.js';
import { readSafe } from './store.js';
import { digest, requireThat } from './contracts.js';
const exec = promisify(execFile);


export async function patternInputs(store, context, candidate, { capture = true, allowMissing = false, pythonExecutable = 'python3', environment = process.env, helperRoot = pythonScriptsRoot } = {}) {
  const repositories = [];
  for (const pin of candidate.repositories) {
    const repository = context.repositories.find(item => item.alias === pin.alias);
    let stdout;
    try {
      ({ stdout } = await exec(pythonExecutable, [join(helperRoot, 'pattern_tool.py'), 'review-inputs', '--cwd', repository.path, '--base', pin.base, '--head', pin.head], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...environment, PYTHONDONTWRITEBYTECODE: '1', GATEREEVE_GIT_EXECUTABLE: repository.gitExecutable ?? 'git' } }));
    } catch (error) {
      // Only the helper's explicit absent-scope result can define an exception.
      // Parse, path, integrity and process failures must remain unavailable.
      if (!allowMissing || error.code !== 2 || error.stdout !== ''
        || !/^No applicable \.pattern-review directory found for [^\n]+\.\nRun: \/pattern-init [^\n]+\n$/u.test(error.stderr ?? '')) throw error;
      repositories.push({ alias: pin.alias, unavailable: 'missing-pattern-scope' });
      continue;
    }
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
