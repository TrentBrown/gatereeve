import { identity, requireThat, TRIPWIRE_CATEGORIES } from './contracts.js';
import { ContractError } from '../errors.js';
import { withObjects } from './git-source.js';

// Escalation tripwires (spec AC4, design D10). Deterministic classifiers over a
// light candidate's change from its pinned base to its pinned head: path rules
// match every changed path (added, modified or deleted) and content rules match
// lines the head adds. Built-in patterns cover the five categories; each
// repository may extend or narrow them in `.gatereeve/tripwires.json`, read from
// the candidate's pinned BASE commit so a change cannot weaken its own tripwires.
// Changing that file is itself always a hit.
export const TRIPWIRE_POLICY = 'tripwires/1';
export const TRIPWIRE_CONFIG = '.gatereeve/tripwires.json';
// Content is read only for blobs up to this size; larger or binary files are
// classified by path alone and reported as content-skipped.
export const CONTENT_LIMIT = 1024 * 1024;

const SQL = '(?:TABLE|INDEX|COLUMN|SCHEMA|TYPE|VIEW|SEQUENCE)';
const AUTH = 'auth|authn|authz|authentication|authorization|authorize|security|permissions?|oauth2?|oidc|saml|sso|login|logout|passwords?|credentials?|crypto|rbac|acl|csrf|jwt|sessions?';
// [rule, regex source, flags]. Regexes are matched against repository-relative
// paths (forward slashes) or single added lines.
export const BUILT_IN = Object.freeze({
  'migrations-schema': {
    paths: [
      ['migration-directory', '(?:^|/)(?:migrations?|migrate|alembic|flyway|liquibase)/', 'i'],
      ['sql-file', '\\.sql$', 'i'],
      ['schema-file', '(?:^|/)(?:schema\\.(?:prisma|rb|sql)|structure\\.sql|[^/]+\\.prisma)$', 'i'],
      ['schema-directory', '(?:^|/)schemas?/', 'i'],
    ],
    content: [
      ['ddl-statement', `\\b(?:CREATE|ALTER|DROP)\\s+${SQL}\\b`, ''],
      ['add-column', '\\bADD\\s+COLUMN\\b', ''],
      ['migration-call', '\\b(?:createTable|alterTable|dropTable|addColumn|removeColumn|renameColumn|changeColumn|create_table|add_column|remove_column|rename_column|change_column)\\s*\\(', ''],
    ],
  },
  'auth-security': {
    paths: [
      ['auth-security-path', `(?:^|[/._-])(?:${AUTH})(?:[/._-]|$)`, 'i'],
      // Changing the tripwire configuration is a change to a safety control.
      ['tripwire-configuration', '^\\.gatereeve/tripwires\\.json$', ''],
    ],
    content: [],
  },
  secrets: {
    paths: [
      ['env-file', '(?:^|/)\\.env(?:\\.[^/]*)?$', ''],
      ['key-material', '\\.(?:pem|key|p12|pfx|jks|keystore|ppk|asc|gpg)$', 'i'],
      ['ssh-private-key', '(?:^|/)id_(?:rsa|dsa|ecdsa|ed25519)$', ''],
      ['credential-file', '(?:^|/)(?:credentials?|secrets?)(?:\\.[^/]*)?$', 'i'],
      ['auth-rc-file', '(?:^|/)\\.(?:npmrc|netrc|pypirc|htpasswd)$', ''],
    ],
    content: [
      ['private-key', '-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----', ''],
      ['aws-access-key', '\\b(?:AKIA|ASIA)[0-9A-Z]{16}\\b', ''],
      ['github-token', '\\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})', ''],
      ['slack-token', '\\bxox[abprs]-[A-Za-z0-9-]{10,}', ''],
      ['provider-api-key', '\\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}', ''],
      ['assigned-secret', '(?:api[_-]?key|secret|passw(?:or)?d|token|access[_-]?key|private[_-]?key)["\']?\\s*[:=]\\s*["\'][^"\'\\s]{8,}["\']', 'i'],
    ],
  },
  'public-api': {
    paths: [
      ['openapi-document', '(?:^|/)(?:openapi|swagger)[^/]*\\.(?:ya?ml|json)$', 'i'],
      ['protobuf', '\\.proto$', ''],
      ['graphql-schema', '\\.(?:graphqls?|gql)$', ''],
      ['avro-schema', '\\.avsc$', ''],
      ['json-schema', '\\.schema\\.json$', ''],
      ['type-declarations', '\\.d\\.ts$', ''],
    ],
    content: [],
  },
  'data-deletion': {
    paths: [],
    content: [
      ['sql-drop', '\\bDROP\\s+(?:TABLE|DATABASE|SCHEMA|COLUMN)\\b', ''],
      ['sql-truncate', '\\bTRUNCATE\\s+(?:TABLE\\s+)?[\\w"`.]', ''],
      ['sql-delete', '\\bDELETE\\s+FROM\\b', ''],
      ['bulk-delete-call', '\\.(?:deleteMany|bulkDelete|destroyAll|delete_all|destroy_all|truncate)\\s*\\(', ''],
      ['recursive-remove', '\\brm\\s+-[a-zA-Z]*(?:r[a-zA-Z]*f|f[a-zA-Z]*r)\\b|\\bshutil\\.rmtree\\s*\\(|\\bfs\\.rm(?:Sync)?\\s*\\([^)]*recursive', ''],
    ],
  },
});

// Glob syntax as in pattern-review triggers: `**` crosses directories, `*` and
// `?` stay within one, `{a,b}` alternates. A pattern without `/` matches the
// file name anywhere.
export function globExpression(glob) {
  requireThat(typeof glob === 'string' && glob.trim() && !glob.startsWith('/') && !glob.includes('\\'), `Invalid tripwire path glob: ${JSON.stringify(glob)}`);
  let source = '', depth = 0;
  for (let index = 0; index < glob.length; index++) {
    const character = glob[index];
    if (character === '*') {
      if (glob[index + 1] === '*') {
        index++;
        if (glob[index + 1] === '/') { index++; source += '(?:.*/)?'; } else source += '.*';
      } else source += '[^/]*';
    } else if (character === '?') source += '[^/]';
    else if (character === '{') { depth++; source += '(?:'; }
    else if (character === '}' && depth) { depth--; source += ')'; }
    else if (character === ',' && depth) source += '|';
    else source += character.replace(/[.+^$()|[\]\\]/gu, '\\$&');
  }
  requireThat(depth === 0, `Invalid tripwire path glob: ${JSON.stringify(glob)}`);
  return new RegExp(glob.includes('/') ? `^${source}$` : `(?:^|/)${source}$`, 'u');
}
function expression(source, flags, label) {
  try { return new RegExp(source, `u${flags}`); }
  catch (error) { throw new ContractError(`Invalid tripwire content pattern ${label}: ${error.message}`); }
}
// Repository configuration: { schemaVersion: 1, categories: { <category>: {
//   paths?: [glob], content?: [regex | {pattern, ignoreCase}], excludePaths?: [glob], builtIn?: boolean } } }
export function parseTripwireConfig(bytes) {
  let value;
  try { value = JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch (error) { throw new ContractError(`${TRIPWIRE_CONFIG} is not valid JSON: ${error.message}`); }
  requireThat(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => ['schemaVersion', 'categories'].includes(key)) && value.schemaVersion === 1,
  `${TRIPWIRE_CONFIG} must be {"schemaVersion": 1, "categories": {...}}`);
  const categories = value.categories ?? {};
  requireThat(categories && typeof categories === 'object' && !Array.isArray(categories), `${TRIPWIRE_CONFIG} categories must be an object`);
  const parsed = {};
  for (const [category, entry] of Object.entries(categories)) {
    requireThat(TRIPWIRE_CATEGORIES.includes(category), `${TRIPWIRE_CONFIG} names unknown tripwire category ${category}; use ${TRIPWIRE_CATEGORIES.join(', ')}`);
    requireThat(entry && typeof entry === 'object' && !Array.isArray(entry)
      && Object.keys(entry).every(key => ['paths', 'content', 'excludePaths', 'builtIn'].includes(key)), `${TRIPWIRE_CONFIG} category ${category} supports paths, content, excludePaths and builtIn`);
    const list = key => {
      const items = entry[key] ?? [];
      requireThat(Array.isArray(items), `${TRIPWIRE_CONFIG} ${category}.${key} must be an array`);
      return items;
    };
    requireThat(entry.builtIn === undefined || typeof entry.builtIn === 'boolean', `${TRIPWIRE_CONFIG} ${category}.builtIn must be boolean`);
    parsed[category] = {
      builtIn: entry.builtIn !== false,
      paths: list('paths').map(glob => ({ rule: `repository-path:${glob}`, pattern: globExpression(glob) })),
      excludePaths: list('excludePaths').map(glob => globExpression(glob)),
      content: list('content').map(item => {
        const pattern = typeof item === 'string' ? item : item?.pattern;
        requireThat(typeof pattern === 'string' && pattern && (typeof item === 'string'
          || (Object.keys(item).every(key => ['pattern', 'ignoreCase'].includes(key)) && [undefined, true, false].includes(item.ignoreCase))),
        `${TRIPWIRE_CONFIG} ${category}.content entries are regex strings or {pattern, ignoreCase}`);
        return { rule: `repository-content:${pattern}`, pattern: expression(pattern, item?.ignoreCase ? 'i' : '', `${category}.content`) };
      }),
    };
  }
  return parsed;
}
export function tripwireRules(config = null) {
  const rules = [];
  for (const category of TRIPWIRE_CATEGORIES) {
    const configured = config?.[category];
    const builtIn = BUILT_IN[category];
    for (const kind of ['paths', 'content']) {
      for (const [rule, source, flags] of builtIn[kind]) {
        // The configuration rule cannot be disabled by the configuration itself.
        if (configured && !configured.builtIn && rule !== 'tripwire-configuration') continue;
        rules.push({ category, rule, source: 'built-in', kind: kind === 'paths' ? 'path' : 'content', pattern: new RegExp(source, `u${flags}`),
          exempt: rule === 'tripwire-configuration' });
      }
      for (const item of configured?.[kind] ?? []) rules.push({ category, rule: item.rule, source: 'repository', kind: kind === 'paths' ? 'path' : 'content', pattern: item.pattern });
    }
  }
  return rules.map(rule => ({ ...rule, excluded: path => !rule.exempt && (config?.[rule.category]?.excludePaths ?? []).some(pattern => pattern.test(path)) }));
}
async function readCapped(reader, oid) {
  const chunks = []; let size = 0, overflow = false;
  await reader.read(oid, bytes => {
    size += bytes.length;
    if (size > CONTENT_LIMIT) { overflow = true; return; }
    chunks.push(Buffer.from(bytes));
  });
  return overflow ? null : Buffer.concat(chunks);
}
const lines = bytes => bytes.toString('utf8').split(/\r?\n/u);
export const hitKey = hit => `${hit.category}|${hit.rule}|${hit.repository}|${hit.path}`;
// The identity a human stay-light decision binds: the set of hits, not line numbers.
export const tripwireSubject = hits => identity({ policy: TRIPWIRE_POLICY, hits: [...new Set(hits.map(hitKey))].sort() });

// Classify a candidate value (not a reference). Deterministic for pinned source.
export async function evaluateTripwires(context, candidate) {
  const hits = [], configurations = [], skipped = [];
  for (const repo of candidate.repositories) {
    const repository = context.repositories.find(item => item.alias === repo.alias);
    requireThat(repository, `Tripwire repository is not configured: ${repo.alias}`);
    const base = new Map(repo.baseFiles.map(file => [file.path, file]));
    const head = new Map(repo.files.map(file => [file.path, file]));
    const changed = [...new Set([...base.keys(), ...head.keys()])]
      .filter(path => identity(base.get(path) ?? null) !== identity(head.get(path) ?? null)).sort();
    await withObjects(repository, {}, async reader => {
      const configEntry = base.get(TRIPWIRE_CONFIG);
      let config = null;
      if (configEntry) {
        requireThat(!configEntry.entryKind, `${TRIPWIRE_CONFIG} must be a regular file`);
        const bytes = await readCapped(reader, configEntry.oid);
        requireThat(bytes, `${TRIPWIRE_CONFIG} exceeds ${CONTENT_LIMIT} bytes`);
        config = parseTripwireConfig(bytes);
      }
      configurations.push({ repository: repo.alias, path: TRIPWIRE_CONFIG, commit: repo.base, oid: configEntry?.oid ?? null });
      const rules = tripwireRules(config);
      for (const path of changed) {
        const found = new Map();
        const hit = (rule, line = null) => {
          if (rule.excluded(path) || found.has(rule.category + rule.rule)) return;
          found.set(rule.category + rule.rule, true);
          hits.push({ category: rule.category, rule: rule.rule, source: rule.source, kind: rule.kind, repository: repo.alias, path, ...(line ? { line } : {}) });
        };
        for (const rule of rules) if (rule.kind === 'path' && rule.pattern.test(path)) hit(rule);
        const after = head.get(path);
        if (!after || after.entryKind) continue; // Deleted, symlink or gitlink: path rules only.
        const content = rules.filter(rule => rule.kind === 'content' && !rule.excluded(path));
        if (!content.length) continue;
        const bytes = await readCapped(reader, after.oid);
        if (!bytes || bytes.includes(0)) { skipped.push({ repository: repo.alias, path, reason: bytes ? 'binary' : `larger than ${CONTENT_LIMIT} bytes` }); continue; }
        const before = base.get(path);
        let previous = null;
        if (before && !before.entryKind) previous = await readCapped(reader, before.oid);
        // Lines present anywhere in the base are not additions. An unreadable
        // base counts every head line as added (more hits, never fewer).
        const existing = new Set(previous && !previous.includes(0) ? lines(previous) : []);
        for (const [index, line] of lines(bytes).entries()) {
          if (existing.has(line)) continue;
          for (const rule of content) if (rule.pattern.test(line)) hit(rule, index + 1);
        }
      }
    });
  }
  hits.sort((a, b) => hitKey(a).localeCompare(hitKey(b)));
  // Content hits record the rule and line, never the matched text (it may be a secret).
  return { policy: TRIPWIRE_POLICY, hits, subject: hits.length ? tripwireSubject(hits) : null, configurations, skipped };
}
export function describeHits(hits) {
  const categories = [...new Set(hits.map(hit => hit.category))];
  return `${hits.length} tripwire hit${hits.length === 1 ? '' : 's'} (${categories.join(', ')}): ${hits.slice(0, 5).map(hit => `${hit.repository}/${hit.path} [${hit.rule}]`).join('; ')}${hits.length > 5 ? '; ...' : ''}`;
}
