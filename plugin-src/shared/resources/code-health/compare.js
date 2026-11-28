// The regression rule (design D3, D4): for each enforced (file, smell, source
// rule) group, FAIL when the head has more issues than the base. Lines and
// message text are ignored; renamed files are compared under their head path.
import { disabledSmell, severityOf } from './sensors.js';

function flatten(findings, config, rename = path => path) {
  const issues = [];
  for (const finding of findings) {
    if (disabledSmell(finding.smell, config)) continue;
    const severity = severityOf(finding.smell, config);
    for (const issue of finding.issues) {
      const file = rename(issue.details?.file ?? issue.key);
      issues.push({
        smell: finding.smell,
        severity,
        file,
        source: issue.details?.source ?? '',
        line: issue.details?.line ?? null,
        message: issue.details?.message ?? issue.details?.content ?? '',
        language: finding.language ?? null,
      });
    }
  }
  return issues;
}

const groupKey = issue => JSON.stringify([issue.file, issue.smell, issue.source]);

function countGroups(issues) {
  const counts = new Map();
  for (const issue of issues) counts.set(groupKey(issue), (counts.get(groupKey(issue)) ?? 0) + 1);
  return counts;
}

export function compare({ baseFindings, headFindings, config, files }) {
  const toHead = new Map(files.filter(file => file.base).map(file => [file.base, file.head]));
  const base = flatten(baseFindings, config, path => toHead.get(path) ?? path).filter(issue => issue.severity === 'enforced');
  const head = flatten(headFindings, config);
  const baseCounts = countGroups(base);
  const headEnforced = head.filter(issue => issue.severity === 'enforced');
  const headCounts = countGroups(headEnforced);
  const regressed = new Set([...headCounts].filter(([key, count]) => count > (baseCounts.get(key) ?? 0)).map(([key]) => key));
  const findings = { new: [], preExisting: [], advisory: head.filter(issue => issue.severity !== 'enforced') };
  for (const issue of headEnforced) (regressed.has(groupKey(issue)) ? findings.new : findings.preExisting).push(issue);
  const groups = [...regressed].map(key => {
    const [file, smell, source] = JSON.parse(key);
    return { file, smell, source, base: baseCounts.get(key) ?? 0, head: headCounts.get(key) };
  });
  const counts = {};
  for (const [bucket, issues] of Object.entries(findings)) {
    for (const issue of issues) {
      counts[issue.smell] ??= { new: 0, preExisting: 0, advisory: 0 };
      counts[issue.smell][bucket] += 1;
    }
  }
  return { verdict: groups.length ? 'FAIL' : 'PASS', groups, findings, counts };
}

// Findings in Habit Hooks' own shape, restricted to the regressed groups, for
// the mapper to coach.
export function regressionFindings(headFindings, groups) {
  const wanted = new Set(groups.map(group => JSON.stringify([group.file, group.smell, group.source])));
  return headFindings
    .map(finding => ({
      ...finding,
      issues: finding.issues.filter(issue => wanted.has(JSON.stringify([issue.details?.file ?? issue.key, finding.smell, issue.details?.source ?? '']))),
    }))
    .filter(finding => finding.issues.length);
}
