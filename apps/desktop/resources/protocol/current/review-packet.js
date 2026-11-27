// Complete review packets (issue #142): the documents a spec incorporates by
// reference, and the rubric rows a spec marks as checked only after merge.
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';

// The canonical global Definition of Done, shipped with the protocol so every
// staged copy (plugin, CLI, desktop) carries it.
export const DEFINITION_OF_DONE_URL = new URL('../DEFINITION-OF-DONE.md', import.meta.url);
export const DEFINITION_OF_DONE_VIEW_PATH = 'incorporated/gatereeve/DEFINITION-OF-DONE.md';
export const INCORPORATED_FEATURE_ROOT = 'incorporated/feature';
export const MAX_INCORPORATED_DOCUMENTS = 16;
export const MAX_INCORPORATED_BYTES = 256 * 1024;

// A spec incorporates the global Definition of Done when it says so in these
// words, in any case and with any whitespace (the spec template's sentence).
export function incorporatesDefinitionOfDone(spec) {
  return /\bglobal\s+definition\s+of\s+done\b/iu.test(String(spec));
}

// Markdown prose without fenced code blocks or inline code spans, where links
// are not references.
function prose(text) {
  const lines = String(text).split(/\r?\n/u), kept = [];
  let fence = null;
  for (const line of lines) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
    if (marker) { if (!fence) fence = marker[0]; else if (fence === marker[0]) fence = null; kept.push(''); continue; }
    kept.push(fence ? '' : line.replace(/(`+)[\s\S]*?\1/gu, ''));
  }
  return kept.join('\n');
}
// The destination of an inline link or image starting at `index` (just after
// its opening parenthesis), as CommonMark reads it: `<...>`, or a bare run
// without whitespace whose parentheses balance at any depth (backslash
// escapes count as text), then an optional title and the closing parenthesis.
// Returns null when the text there is not a link destination.
function inlineDestination(body, index) {
  let at = index;
  while (body[at] === ' ' || body[at] === '\t') at += 1;
  let target;
  if (body[at] === '<') {
    const close = body.indexOf('>', at + 1);
    if (close === -1 || body.slice(at + 1, close).includes('\n')) return null;
    target = body.slice(at, close + 1); at = close + 1;
  } else {
    let depth = 0; const begin = at;
    for (; at < body.length; at += 1) {
      const char = body[at];
      if (char === '\\' && at + 1 < body.length) { at += 1; continue; }
      if (/\s/u.test(char)) break;
      if (char === '(') depth += 1;
      else if (char === ')') { if (depth === 0) break; depth -= 1; }
    }
    if (depth !== 0 || at === begin) return null;
    target = body.slice(begin, at);
  }
  const rest = /^[ \t]*(?:\n[ \t]*)?(?:(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\))[ \t]*)?\)/u.exec(body.slice(at));
  return rest ? target : null;
}
// Link targets in Markdown text: inline links and images `[x](target "t")`
// and reference definitions `[x]: target`, in document order. An inline
// link is found from the `](` that closes its label, so whatever the label
// holds (nested brackets, code, escapes) never hides it; a stray `](` that
// is not followed by a destination is ignored.
export function markdownLinks(text) {
  const body = prose(text), found = [];
  for (const match of body.matchAll(/\]\(/gu)) {
    const target = inlineDestination(body, match.index + 2);
    if (target !== null) found.push({ index: match.index, target });
  }
  for (const match of body.matchAll(/^[ ]{0,3}\[(?:[^\]\\\n]|\\.)+\]:[ \t]*(<[^>\n]*>|\S+)/gmu)) found.push({ index: match.index, target: match[1] });
  // Angle brackets delimit a destination; a backslash escapes ASCII punctuation.
  return found.sort((a, b) => a.index - b.index).map(item => item.target.replace(/^<|>$/gu, '').replace(/\\([!-/:-@[-`{-~])/gu, '$1'));
}
// The feature-home path a relative link names, or why it names none. External
// links (with a scheme) and in-document anchors are not references to include.
export function linkedPath(target) {
  const value = String(target).split('#')[0].split('?')[0];
  if (!value || /^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith('//')) return { external: true };
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { return { reason: 'the link is not a valid path' }; }
  if (decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0')) return { reason: 'the link is not a relative path in the feature home' };
  const path = posix.normalize(decoded);
  if (path === '.' || /^\.\.(?:\/|$)/u.test(path)) return { reason: 'the link points outside the feature home' };
  // Dot entries hold run stores, checkpoints and handoffs, never requirements.
  if (path.split('/').some(part => part.startsWith('.'))) return { reason: 'the link names a hidden or workflow-record path' };
  return { path };
}

// The documents a pinned spec incorporates, captured into the store so the
// execution input binds their bytes, and a note for each reference that could
// not be included. `carried` lists feature-home names the packet already holds
// (requirements and planning support), which are not repeated.
export async function incorporatedDocuments(store, spec, carried = []) {
  const documents = [], notes = [];
  if (incorporatesDefinitionOfDone(spec)) {
    const bytes = await readFile(DEFINITION_OF_DONE_URL);
    documents.push({ reference: 'global Definition of Done', path: DEFINITION_OF_DONE_VIEW_PATH, ref: { path: 'DEFINITION-OF-DONE.md', ...await store.put(bytes) } });
  }
  const seen = new Set(carried);
  for (const target of markdownLinks(spec)) {
    const linked = linkedPath(target);
    if (linked.external) continue;
    if (!linked.path) { notes.push({ reference: target, reason: linked.reason }); continue; }
    if (seen.has(linked.path)) continue;
    seen.add(linked.path);
    if (documents.length >= MAX_INCORPORATED_DOCUMENTS) { notes.push({ reference: target, reason: `past the ${MAX_INCORPORATED_DOCUMENTS}-document bound` }); continue; }
    let ref;
    try { ref = await store.capture(linked.path); }
    catch (error) {
      notes.push({ reference: target, reason: error?.code === 'ENOENT' ? 'no such file in the feature home' : 'not a readable regular file inside the feature home' });
      continue;
    }
    if (ref.bytes > MAX_INCORPORATED_BYTES) { notes.push({ reference: target, reason: `larger than ${MAX_INCORPORATED_BYTES / 1024} KiB` }); continue; }
    documents.push({ reference: target, path: `${INCORPORATED_FEATURE_ROOT}/${linked.path}`, ref });
  }
  return { documents, notes };
}

// Rubric rows the spec marks as checked only after merge: the criterion text
// starts with "After merge:". They are never selected for boundary review.
export const AFTER_MERGE_MARKER = /^after merge:/iu;
export function afterMergeCriteria(facts) {
  return (facts?.criteria ?? []).filter(row => AFTER_MERGE_MARKER.test(String(row.criterion ?? '').trim())).map(row => ({ id: row.id, criterion: row.criterion }));
}
