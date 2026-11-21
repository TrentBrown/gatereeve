import { readFile } from 'node:fs/promises';
import { digest, identity, requireThat } from './contracts.js';

export const PLANNING_POLICY = 'planning-facts/1';
const plain = text => text.replace(/[*_`]/gu, '').trim();

// Extract identities and referenced text, not semantic adequacy. The original
// documents remain reviewer inputs. Unknown definitions are errors, never omissions.
export function planningFacts(body) {
  requireThat(typeof body === 'string', 'Planning document must be text');
  const lines = body.split(/\r?\n/u), criteria = [], acceptance = [], warnings = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (marker) { if (!fence) fence = marker[0]; else if (fence === marker[0]) fence = null; continue; }
    if (fence) continue;
    const text = plain(line.replace(/^\s*(?:#{1,6}\s+|[-+]\s+|\d+[.)]\s+)/u, ''));
    const ac = text.match(/^(AC\d+)(?:[.:)\s—–-]+)(.+)$/u);
    if (ac) { acceptance.push({ id: ac[1], text: ac[2].trim(), line: i + 1 }); continue; }
    const table = line.trim().startsWith('|') ? line.trim().replace(/^\||\|$/gu, '').split(/(?<!\\)\|/u).map(plain) : null;
    if (table && /^AC\d+$/u.test(table[0])) {
      requireThat(table[1], `Empty acceptance criterion at line ${i + 1}`);
      acceptance.push({ id: table[0], text: table.slice(1).join(' | '), line: i + 1 }); continue;
    }
    if (table && /^R\d+$/u.test(table[0])) {
      requireThat(table.length >= 5 && table.slice(1, 5).every(Boolean), `Ambiguous rubric row ${table[0]} at line ${i + 1}`);
      criteria.push({ id: table[0], criterion: table[1], pass: table[2], fail: table[3], evidence: table[4], line: i + 1 }); continue;
    }
    const row = text.match(/^(R\d+)(?:[.:)\s—–-]+)(.+)$/u);
    if (row) {
      const fields = {};
      for (let j = i + 1; j < lines.length; j++) {
        const value = plain(lines[j].replace(/^\s*[-+]\s*/u, ''));
        const field = value.match(/^(pass|fail|evidence)\s*:\s*(.+)$/iu);
        if (field) {
          requireThat(!fields[field[1].toLowerCase()], `Duplicate ${field[1]} for ${row[1]}`);
          fields[field[1].toLowerCase()] = field[2];
        } else if (value && !/^#/u.test(value)) break;
        else if (/^#/u.test(value)) break;
      }
      requireThat(['pass', 'fail', 'evidence'].every(key => fields[key]), `Rubric ${row[1]} needs unambiguous pass, fail and evidence descriptions`);
      criteria.push({ id: row[1], criterion: row[2], ...fields, line: i + 1 }); continue;
    }
    requireThat(!/^(?:\|\s*)?(?:AC|R)\d+(?:\b|$)/u.test(text), `Unrecognized requirement definition at line ${i + 1}`);
  }
  requireThat(!fence, 'Unclosed code fence makes planning extraction ambiguous');
  requireThat(acceptance.length && criteria.length, 'Specification needs acceptance criteria and rubric definitions');
  for (const [label, entries] of [['acceptance', acceptance], ['rubric', criteria]]) {
    requireThat(new Set(entries.map(item => item.id)).size === entries.length, `Duplicate ${label} identity`);
    requireThat(entries.every(item => !Object.values(item).some(value => typeof value === 'string' && /\bTODO\b/u.test(value))), `Unresolved ${label} definition`);
  }
  if (!body.includes('## Acceptance Criteria') || !body.includes('## Rubric')) warnings.push('Alternative presentation parsed; semantic adequacy remains a review obligation');
  return { policy: PLANNING_POLICY, source: digest(body), acceptance, criteria, warnings };
}

// Parsing is deterministic text processing under the supported JavaScript contract.
// Bind its implementation, not the incidental CLI or Electron Node version.
export async function planningBinding() {
  return { policy: PLANNING_POLICY, parser: digest(await readFile(new URL('./planning.js', import.meta.url))),
    contracts: digest(await readFile(new URL('./contracts.js', import.meta.url))) };
}
export async function validatePlanning(body) {
  const binding = await planningBinding();
  try { return { guardId: 'spec.validation.current', binding, passed: true, exitCode: 0, facts: planningFacts(body) }; }
  catch (error) { return { guardId: 'spec.validation.current', binding, passed: false, exitCode: 1, diagnostic: error.message }; }
}
export async function assertPlanningProof(proof) {
  requireThat(proof?.passed && identity(proof.binding) === identity(await planningBinding()), 'Planning validation is stale or unavailable');
}

export function planningReferences(documents, facts) {
  const criterionIds = new Set(facts.criteria.map(item => item.id));
  const problems = [];
  for (const [name, body] of Object.entries(documents)) {
    for (const id of new Set(body.match(/\bR\d+\b/gu) ?? [])) if (!criterionIds.has(id)) problems.push(`${name} refers to unknown criterion ${id}`);
  }
  requireThat(!problems.length, problems.join('; '));
  return { criteria: [...criterionIds], documents: Object.fromEntries(Object.entries(documents).map(([name, body]) => [name, digest(body)])) };
}
