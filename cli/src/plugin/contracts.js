import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function unique(values, label) {
  assert(new Set(values).size === values.length, `${label} contains duplicates`);
}

function assertPortableRelativePath(path, label) {
  assert(typeof path === 'string' && path.length > 0, `${label} must be a non-empty path`);
  assert(!isAbsolute(path), `${label} must be relative: ${path}`);
  assert(!path.split('/').includes('..'), `${label} must not escape its root: ${path}`);
  assert(!path.includes('\\'), `${label} must use portable forward slashes: ${path}`);
}

function validateWorkflowInventory(inventory) {
  assert(inventory.schemaVersion === 1, 'Workflow inventory schemaVersion must be 1');
  const skills = inventory.skills ?? [];
  const names = skills.map((skill) => skill.name);
  unique(names, 'Workflow skill inventory');
  assert(
    names.length === inventory.plugin.expectedSkillCount,
    `Expected ${inventory.plugin.expectedSkillCount} skills, found ${names.length}`
  );

  for (const skill of skills) {
    assert(
      skill.canonicalPath === `shared/skills/${skill.name}`,
      `Canonical path mismatch for ${skill.name}: ${skill.canonicalPath}`
    );
    assertPortableRelativePath(skill.canonicalPath, `${skill.name} canonicalPath`);
    assert(
      ['existing', 'planned'].includes(skill.state),
      `Invalid state for ${skill.name}: ${skill.state}`
    );
  }

  const planned = skills
    .filter((skill) => skill.state === 'planned')
    .map((skill) => skill.name)
    .sort();
  assert(planned.length === 0, `Unexpected planned skill set: ${planned.join(', ')}`);

  for (const [group, paths] of Object.entries(inventory.resources)) {
    unique(paths, `Resource group ${group}`);
    for (const path of paths) {
      assertPortableRelativePath(path, `Resource ${group}/${path}`);
    }
  }

  const nodeRuntime = (inventory.runtimePrerequisites ?? []).find(
    (item) => item.name === 'node'
  );
  assert(nodeRuntime?.required === true, 'Node must be a required plugin runtime');
  assert(
    nodeRuntime.minimumVersion === '22.12.0',
    'Node plugin runtime minimum must be 22.12.0'
  );

  return { skillCount: names.length, plannedSkillCount: planned.length };
}

function validatePlatformContracts(contracts, inventory) {
  assert(contracts.schemaVersion === 1, 'Platform contracts schemaVersion must be 1');
  assert(
    contracts.variables.plugin === inventory.plugin.id,
    'Platform plugin ID does not match workflow inventory'
  );
  assert(
    contracts.shared.defaultHooksPath === 'hooks/hooks.json',
    'Shared hook path must use default hooks/hooks.json discovery'
  );

  for (const path of Object.values(contracts.releaseBranchLayout)) {
    assertPortableRelativePath(path, `Release branch path ${path}`);
  }
  assertPortableRelativePath(
    contracts.codex.catalogPackageSource.path.replace(/^\.\//, ''),
    'Codex catalog package source'
  );
  assertPortableRelativePath(
    contracts.claudeCode.catalogPackageSource.replace(/^\.\//, ''),
    'Claude catalog package source'
  );
  assert(contracts.codex.hookTrustRequired === true, 'Codex hook trust must be explicit');
  assert(
    contracts.claudeCode.manifestRequired === false,
    'Claude platform manifest requirement changed; reverify the contract'
  );
  for (const source of contracts.officialSources) {
    assert(source.startsWith('https://'), `Official source must use HTTPS: ${source}`);
  }

  return {
    marketplace: contracts.variables.marketplace,
    platforms: ['codex', 'claude'],
  };
}

export function validateContractData({ inventory, platforms }) {
  const inventoryResult = validateWorkflowInventory(inventory);
  const platformResult = validatePlatformContracts(platforms, inventory);

  return {
    schemaVersion: 1,
    ...inventoryResult,
    ...platformResult,
  };
}

export async function loadAndValidateContracts(sourceRoot) {
  const contractsRoot = resolve(sourceRoot, 'contracts');
  const [inventoryText, platformsText] = await Promise.all([
    readFile(resolve(contractsRoot, 'workflow-inventory.json'), 'utf8'),
    readFile(resolve(contractsRoot, 'platform-contracts.json'), 'utf8'),
  ]);

  for (const [name, text] of [
    ['workflow-inventory.json', inventoryText],
    ['platform-contracts.json', platformsText],
  ]) {
    assert(!text.includes('/Users/'), `${name} contains a personal macOS home path`);
    assert(!/[A-Za-z]:\\Users\\/.test(text), `${name} contains a personal Windows home path`);
  }

  return validateContractData({
    inventory: JSON.parse(inventoryText),
    platforms: JSON.parse(platformsText),
  });
}
