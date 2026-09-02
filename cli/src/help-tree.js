function commandPath(command) {
  const parts = [];
  for (let current = command; current; current = current.parent) {
    if (current.name()) parts.unshift(current.name());
  }
  return parts;
}

function findCommand(program, path) {
  let current = program;
  for (const name of path) {
    current = current.commands.find((candidate) => candidate.name() === name);
    if (!current) return null;
  }
  return current;
}

function recurseDepth(value) {
  if (value === undefined) return 1;
  if (value === true) return Number.POSITIVE_INFINITY;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('--recurse depth must be a non-negative integer');
  }
  return parsed;
}

function optionLines(command, indent) {
  const lines = [];
  for (const option of command.options) {
    const details = [];
    if (option.defaultValue !== undefined) {
      details.push(`default: ${String(option.defaultValue)}`);
    }
    if (option.mandatory) details.push('required');
    const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';
    lines.push(`${indent}${option.flags} ${option.description ?? ''}${suffix}`.trimEnd());
    if (Array.isArray(option.argChoices) && option.argChoices.length > 0) {
      lines.push(`${indent}    choices: ${option.argChoices.join(' | ')}`);
    }
  }
  for (const argument of command.registeredArguments ?? []) {
    const name = typeof argument.name === 'function' ? argument.name() : argument.name;
    const description = argument.description ? ` ${argument.description}` : '';
    lines.push(`${indent}<${name}>${description}`);
  }
  return lines;
}

function renderCommand(command, level, maximumDepth) {
  const indent = '    '.repeat(level);
  const displayName = level === 0 && command.parent
    ? commandPath(command).slice(1).join(' ')
    : command.name();
  const aliases = command.aliases();
  const aliasText = aliases.length > 0 ? ` (${aliases.join(', ')})` : '';
  const lines = [
    `${indent}${displayName}${aliasText} ${command.description()}`.trimEnd(),
    ...optionLines(command, `${indent}    `),
  ];
  if (level >= maximumDepth) return lines;
  for (const child of command.commands) {
    if (child.name() === 'help' && command.parent) continue;
    lines.push(...renderCommand(child, level + 1, maximumDepth));
  }
  return lines;
}

function printTree(program, path, maximumDepth) {
  const target = findCommand(program, path);
  if (!target) throw new Error(`Command path '${path.join(' ')}' not found`);
  console.log(renderCommand(target, 0, maximumDepth).join('\n'));
  console.log('\nLegend:');
  console.log('■ Command with subcommands');
  console.log('■ Command without subcommands');
  console.log('■ Options and arguments');
  console.log('■ Default values');
}

export function addTreeCommand(program) {
  program
    .command('help [commandPath...]')
    .description('Display command tree with all subcommands and options')
    .option('-r, --recurse [depth]', 'Show recursive tree, optionally limited to N levels')
    .action((path, options) => printTree(program, path, recurseDepth(options.recurse)));
}
