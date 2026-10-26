import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { planningFacts, planningReferences } from './planning.js';

const [kind, root] = process.argv.slice(2);
try {
  if (!['spec', 'issues', 'tracker', 'triage'].includes(kind) || !root) throw new Error('Expected planning kind and feature directory');
  const spec = await readFile(join(root, 'spec.md'), 'utf8'), facts = planningFacts(spec);
  if (kind !== 'spec') {
    const name = kind === 'triage' ? 'scratchpad.md' : `${kind}.md`;
    const body = await readFile(join(root, name), 'utf8');
    if (!body.trim()) throw new Error(`Missing content: ${name}`);
    planningReferences({ [name]: body }, facts);
    const ids = [...body.matchAll(/^\s*(?:#{1,6}\s+|[-+]\s+)?(?:\*\*)?(I-\d+)\b/gmu)].map(match => match[1]);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate issue identity');
  }
  console.log('PASS: factual extraction and references');
  console.log('Semantic coverage and material decisions require the existing independent review; this lint does not grant passage.');
  for (const warning of facts.warnings) console.log(`Warning: ${warning}`);
} catch (error) {
  console.error(`FAIL: ${error.message}`); process.exitCode = 1;
}
