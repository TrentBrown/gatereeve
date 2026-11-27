import { readFile } from 'node:fs/promises';
import { digest, identity, requireThat } from './contracts.js';

export const PLANNING_POLICY = 'planning-facts/2';
const plain = text => text.replace(/[*_`]/gu, '').trim();

// Fenced code (CommonMark): a fence opens on a run of three or more backticks
// or tildes, and closes only on a line holding a run of the same character at
// least as long as the opening run, and nothing else. Returns, per line,
// whether it is prose, and whether a fence is left open.
const FENCE = /^\s*(`{3,}|~{3,})/u;
function fences(lines) {
  let fence = null;
  const prose = lines.map(line => {
    const marker = line.match(FENCE)?.[1];
    if (!fence) { if (marker) { fence = marker; return false; } return true; }
    const closing = line.match(/^\s*(`{3,}|~{3,})\s*$/u)?.[1];
    if (closing && closing[0] === fence[0] && closing.length >= fence.length) fence = null;
    return false;
  });
  return { prose, open: fence !== null };
}
const outsideFences = lines => fences(lines).prose;

// Extract identities and referenced text, not semantic adequacy. The original
// documents remain reviewer inputs. Unknown definitions are errors, never omissions.
export function planningFacts(body) {
  requireThat(typeof body === 'string', 'Planning document must be text');
  const lines = body.split(/\r?\n/u), criteria = [], acceptance = [], warnings = [];
  const { prose, open } = fences(lines);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!prose[i]) continue;
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
  requireThat(!open, 'Unclosed code fence makes planning extraction ambiguous');
  requireThat(acceptance.length && criteria.length, 'Specification needs acceptance criteria and rubric definitions');
  for (const [label, entries] of [['acceptance', acceptance], ['rubric', criteria]]) {
    requireThat(new Set(entries.map(item => item.id)).size === entries.length, `Duplicate ${label} identity`);
    requireThat(entries.every(item => !Object.values(item).some(value => typeof value === 'string' && /\bTODO\b/u.test(value))), `Unresolved ${label} definition`);
  }
  if (!body.includes('## Acceptance Criteria') || !body.includes('## Rubric')) warnings.push('Alternative presentation parsed; semantic adequacy remains a review obligation');
  return { policy: PLANNING_POLICY, source: digest(body), acceptance, criteria, warnings };
}

// Specification rules (spec AC3, AC4; design D3, D4). Separate from fact
// extraction: a grandfathered spec reports them as warnings, never silently.
// ATX headings may be indented up to three spaces (CommonMark).
const SECTION_END = /^ {0,3}#{1,2}(?:\s|$)/u;
const UNBOUNDED = Object.freeze([['always', /\balways\b/iu], ['any', /\bany\b/iu], ['all cases', /\ball cases\b/iu],
  ['never fails', /\bnever fails\b/iu], ['converges', /\bconverges\b/iu], ['robust', /\brobust\b/iu]]);
// A bound on the same line: a failure-model reference, a numeral or a bounding
// phrase. Requirement identifiers (AC1, R2, I-3, D4, P5) are not numerals.
const BOUND = /failure model|\b(?:at most|at least|up to|no more than|within)\b|\b\d+\b/iu;
const IDENTIFIER = /\b(?:AC|R|D|P|I-)\d+\b/gu;
function sectionLines(lines, prose, pattern) {
  const start = lines.findIndex((line, i) => prose[i] && pattern.test(line));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !(prose[end] && SECTION_END.test(lines[end]))) end++;
  return { heading: start, body: Array.from({ length: end - start - 1 }, (_, k) => start + 1 + k) };
}
export function specificationRules(body, facts) {
  const lines = body.split(/\r?\n/u), prose = outsideFences(lines), problems = [];
  const model = sectionLines(lines, prose, /^ {0,3}##\s+failure model\s*#*\s*$/iu);
  if (!model) problems.push('Specification needs a "## Failure model" section naming the handled conditions and the detect-and-refuse behaviour outside them');
  else {
    const content = model.body.filter(i => prose[i] && lines[i].trim());
    if (!content.length) problems.push(`Failure model section at line ${model.heading + 1} is empty`);
    else if (content.some(i => /\bTODO\b/u.test(lines[i]))) problems.push(`Failure model section at line ${model.heading + 1} is unresolved (TODO)`);
  }
  const linted = new Set([...facts.acceptance, ...facts.criteria].map(item => item.line - 1));
  for (const pattern of [/^ {0,3}##\s+acceptance criteria\s*#*\s*$/iu, /^ {0,3}##\s+rubric\s*#*\s*$/iu]) {
    for (const i of sectionLines(lines, prose, pattern)?.body ?? []) linted.add(i);
  }
  const unbounded = [];
  for (const i of [...linted].sort((a, b) => a - b)) {
    if (!prose[i]) continue;
    const text = lines[i].replace(/`+[^`]*`+/gu, ' ');
    const words = UNBOUNDED.filter(([, pattern]) => pattern.test(text)).map(([word]) => word);
    if (words.length && !BOUND.test(text.replace(IDENTIFIER, ' '))) unbounded.push(`line ${i + 1} (${words.join(', ')})`);
  }
  if (unbounded.length) problems.push(`Unbounded wording in criteria without a bound or failure-model reference on the same line: ${unbounded.join('; ')}`);
  return problems;
}

// Parsing is deterministic text processing under the supported JavaScript contract.
// Bind its implementation, not the incidental CLI or Electron Node version.
export async function planningBinding() {
  return { policy: PLANNING_POLICY, parser: digest(await readFile(new URL('./planning.js', import.meta.url))),
    contracts: digest(await readFile(new URL('./contracts.js', import.meta.url))) };
}
// A grandfathered spec (one already validated under an earlier policy, spec
// AC5) gets the specification rules as warnings; every other spec fails on them.
export async function validatePlanning(body, { grandfathered = false } = {}) {
  const binding = await planningBinding();
  const flag = grandfathered ? { grandfathered: true } : {};
  try {
    const facts = planningFacts(body), problems = specificationRules(body, facts);
    if (problems.length && !grandfathered) return { guardId: 'spec.validation.current', binding, ...flag, passed: false, exitCode: 1, diagnostic: problems.join('; ') };
    facts.warnings.push(...problems.map(problem => `Grandfathered specification (validated before ${PLANNING_POLICY}): ${problem}`));
    return { guardId: 'spec.validation.current', binding, ...flag, passed: true, exitCode: 0, facts };
  } catch (error) { return { guardId: 'spec.validation.current', binding, ...flag, passed: false, exitCode: 1, diagnostic: error.message }; }
}
export async function assertPlanningProof(proof) {
  requireThat(proof?.passed && identity(proof.binding) === identity(await planningBinding()), 'Planning validation is stale or unavailable');
}
// Whether the spec with this hash is grandfathered in the run (spec AC5,
// design D5): its exact bytes were validated (passed or failed) under an
// earlier policy, or a validation already grandfathered them. A run resumed
// from an earlier activation or contract has no verifiable record of its old
// spec, so nothing is grandfathered; an unreadable earlier proof grandfathers nothing.
export async function grandfatheredSpecification(events, hash, readProof) {
  for (const event of events) {
    // Validations are recorded by SPEC_VALIDATED, VALIDATION_FAILED and an amendment's DECIDED.
    const record = event.type === 'SPEC_VALIDATED' ? event.payload
      : event.type === 'VALIDATION_FAILED' ? { spec: event.payload.documents?.['spec.md'], proof: event.payload.proof }
        : event.type === 'DECIDED' ? event.payload.specValidation : null;
    if (!record?.proof || record.spec?.hash !== hash) continue;
    let proof = null;
    try { proof = await readProof(record.proof); } catch { continue; }
    if (proof && (proof.binding?.policy !== PLANNING_POLICY || proof.grandfathered === true)) return true;
  }
  return false;
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
