import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const RESOURCE_ROOTS = {
  commands: 'resources/commands',
  scripts: 'resources/scripts',
  templates: 'resources/templates',
  policy: 'resources/policy',
  resourceGuides: 'resources',
};

const FORBIDDEN_TEXT = [
  { label: 'personal macOS home path', pattern: /\/Users\/[^/\s`"']+/ },
  { label: 'personal Linux home path', pattern: /\/home\/[^/\s`"']+/ },
  { label: 'personal Windows home path', pattern: /[A-Za-z]:\\Users\\[^\\\s`"']+/ },
  { label: 'legacy agent home path', pattern: /~\/\.(?:agents|codex|claude)(?:\/|\b)/ },
  { label: 'canonical source checkout path', pattern: /~\/agentic-development-workflow(?:\/|\b)/ },
  { label: 'source-only workflow path', pattern: /agentic-development-workflow\/(?:skills|commands|scripts|templates)\// },
  { label: 'plugin-root escape', pattern: /(?:^|[\s`"'])\.\.\//m },
  { label: 'platform root marker in shared source', pattern: /\$\{?(?:CLAUDE_)?PLUGIN_ROOT\}?/ },
  { label: 'unresolved build root marker', pattern: /(?:__|\{\{)PLUGIN_ROOT(?:__|\}\})/ },
  { label: 'macOS-only application path', pattern: /\/Applications\// },
  { label: 'macOS-only command', pattern: /\b(?:pbcopy|pbpaste|osascript|xcode-select)\b/ },
];

function portablePath(path) {
  return path.split(sep).join('/');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function inventoryFiles(root) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = resolve(directory, entry.name);
      const path = portablePath(relative(root, absolutePath));
      if (
        entry.name === '__pycache__' ||
        entry.name === '.DS_Store' ||
        entry.name.endsWith('.pyc')
      ) {
        throw new Error(`Transient file must not enter canonical plugin sources: ${path}`);
      }
      if (entry.isSymbolicLink()) {
        throw new Error(`Canonical plugin sources must not contain symlinks: ${path}`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push({ path, absolutePath });
      } else {
        throw new Error(`Unsupported canonical plugin source entry: ${path}`);
      }
    }
  }

  await visit(root);
  return files;
}

async function validateDeclaredInventory(sourceRoot, sharedRoot, files) {
  const inventory = JSON.parse(
    await readFile(resolve(sourceRoot, 'contracts/workflow-inventory.json'), 'utf8')
  );
  const filePaths = new Set(files.map((file) => file.path));
  const existingSkills = inventory.skills
    .filter((skill) => skill.state === 'existing')
    .map((skill) => skill.name)
    .sort();
  const skillEntries = await readdir(resolve(sharedRoot, 'skills'), {
    withFileTypes: true,
  });
  const actualSkills = skillEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert(
    JSON.stringify(actualSkills) === JSON.stringify(existingSkills),
    `Canonical skills differ from inventory: expected ${existingSkills.join(', ')}; ` +
      `found ${actualSkills.join(', ')}`
  );

  for (const skill of existingSkills) {
    assert(filePaths.has(`skills/${skill}/SKILL.md`), `Missing SKILL.md for ${skill}`);
  }

  for (const [group, root] of Object.entries(RESOURCE_ROOTS)) {
    const declared = [...(inventory.resources[group] ?? [])].sort();
    for (const path of declared) {
      const declaredPath = `${root}/${path}`;
      assert(filePaths.has(declaredPath), `Missing declared ${group} resource: ${declaredPath}`);
    }

    const prefix = `${root}/`;
    const actual = files
      .map((file) => file.path)
      .filter((path) => path.startsWith(prefix))
      .map((path) => path.slice(prefix.length))
      .filter((path) => group !== 'resourceGuides' || !path.includes('/'))
      .filter((path) => {
        if (group !== 'resourceGuides') return true;
        return !Object.values(RESOURCE_ROOTS)
          .filter((nestedRoot) => nestedRoot !== root)
          .some((nestedRoot) => `${root}/${path}`.startsWith(`${nestedRoot}/`));
      })
      .sort();
    assert(
      JSON.stringify(actual) === JSON.stringify(declared),
      `${group} resources differ from inventory: expected ${declared.join(', ')}; ` +
        `found ${actual.join(', ')}`
    );
  }

  return { existingSkillCount: existingSkills.length };
}

export async function lintPortability(sourceRoot) {
  const normalizedSourceRoot = resolve(sourceRoot);
  const sharedRoot = resolve(normalizedSourceRoot, 'shared');
  const files = await inventoryFiles(sharedRoot);
  const findings = [];

  for (const file of files) {
    const content = await readFile(file.absolutePath, 'utf8');
    for (const rule of FORBIDDEN_TEXT) {
      if (rule.pattern.test(content)) {
        findings.push(`${file.path}: ${rule.label}`);
      }
    }
  }

  if (findings.length > 0) {
    throw new Error(`Portability violations:\n- ${findings.join('\n- ')}`);
  }

  const inventory = await validateDeclaredInventory(
    normalizedSourceRoot,
    sharedRoot,
    files
  );
  return {
    schemaVersion: 1,
    fileCount: files.length,
    ...inventory,
  };
}
