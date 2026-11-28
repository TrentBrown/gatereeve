// Human-readable output: what to fix first (coaching for regressions), then
// the advisory list, then the effective thresholds.
const location = issue => `${issue.file}${issue.line ? `:${issue.line}` : ''}`;

function list(title, issues, limit = 50) {
  if (!issues.length) return [];
  const lines = issues.slice(0, limit).map(issue => `  ${location(issue)}  ${issue.smell} (${issue.source}) ${issue.message}`.trimEnd());
  if (issues.length > limit) lines.push(`  … ${issues.length - limit} more`);
  return [`${title} (${issues.length}):`, ...lines, ''];
}

function formatThresholds(thresholds) {
  if (!thresholds) return [];
  const parts = [];
  if (thresholds.eslint) parts.push(`ESLint ${Object.entries(thresholds.eslint).map(([key, value]) => `${key}=${value ?? 'unset'}`).join(' ')}`);
  if (thresholds.ruff) parts.push(`Ruff (${thresholds.ruff.source}) ${Object.entries(thresholds.ruff).filter(([key]) => key !== 'source').map(([key, value]) => `${key}=${value ?? 'unset'}`).join(' ')}`);
  return parts.length ? ['Effective thresholds:', ...parts.map(part => `  ${part}`), ''] : [];
}

export function renderText(result) {
  const lines = [`Code health: ${result.verdict}  (base ${result.base}${result.mergeBase ? ` → merge base ${result.mergeBase.slice(0, 12)}` : ''}, ${result.scope.files.length} scoped file(s))`, ''];
  for (const reason of result.reasons) {
    lines.push(reason.message, '');
    if (reason.remedy) lines.push(reason.remedy, '');
  }
  if (result.verdict === 'FAIL') {
    lines.push('New enforced smells compared with the merge base:');
    for (const group of result.groups) lines.push(`  ${group.file}  ${group.smell} (${group.source}): ${group.base} → ${group.head}`);
    lines.push('');
    if (result.coaching) lines.push(result.coaching, '');
    lines.push(...list('Issues in regressed groups', result.findings.new));
  }
  lines.push(...list('Pre-existing enforced smells (advisory)', result.findings.preExisting, 20));
  lines.push(...list('Suggested smells (advisory)', result.findings.advisory, 20));
  if (result.governed.matched) lines.push(`Governed configuration change approved: ${result.governed.matched}`, '');
  lines.push(...formatThresholds(result.thresholds));
  return `${lines.join('\n').trimEnd()}\n`;
}
