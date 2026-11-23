#!/usr/bin/env node
// Spec AC2 / R2 evidence: run the full CLI test suite and show that it leaves
// the shared metrics store and the host scratch root unchanged. Exits non-zero
// when the suite fails or when either changed in a way only tests could cause.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { rootPath } from '../../plugin-src/shared/resources/performance/store.js';

const here = dirname(fileURLToPath(import.meta.url));
// Under a GateReeve runner the inherited GATEREEVE_SCRATCH_ROOT is the host root
// (TMPDIR then points inside the runner's own run).
const hostScratch = process.env.GATEREEVE_HOST_SCRATCH_ROOT || process.env.GATEREEVE_SCRATCH_ROOT || join(tmpdir(), 'gatereeve');
const store = join(rootPath(), 'metrics.sqlite');

function snapshot() {
  const count = dir => existsSync(dir) ? readdirSync(dir).length : 0;
  const result = { runs: count(join(hostScratch, 'runs')), reports: count(join(hostScratch, 'reports')), workflows: new Map(), observations: 0 };
  if (existsSync(store)) {
    const db = new DatabaseSync(store, { readOnly: true });
    try {
      const has = name => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
      if (has('reporting_workflows')) for (const row of db.prepare('SELECT id, home FROM reporting_workflows').all()) result.workflows.set(row.id, row.home);
      if (has('reporting_observations')) result.observations = db.prepare('SELECT COUNT(*) AS n FROM reporting_observations').get().n;
    } finally { db.close(); }
  }
  return result;
}

const before = snapshot();
const env = { ...process.env };
// The suite must isolate itself; never pass the host roots through as private ones.
for (const key of ['GATEREEVE_SCRATCH_ROOT', 'GATEREEVE_METRICS_DIR', 'GATEREEVE_TEST_ISOLATED']) delete env[key];
const code = await new Promise((resolveRun, reject) => {
  // Run from cli/ exactly as `npm test --prefix cli` does, so node --test
  // discovers the CLI suite and nothing else in the repository.
  const child = spawn(process.execPath, [join(here, 'isolated-test.js'), ...process.argv.slice(2)], { cwd: join(here, '..'), env, stdio: 'inherit' });
  child.on('error', reject);
  child.on('close', status => resolveRun(status ?? 1));
});
const after = snapshot();
const added = [...after.workflows].filter(([id]) => !before.workflows.has(id));
const summary = { store, hostScratch, suiteExit: code,
  before: { runs: before.runs, reports: before.reports, workflows: before.workflows.size, observations: before.observations },
  after: { runs: after.runs, reports: after.reports, workflows: after.workflows.size, observations: after.observations },
  addedWorkflows: added.map(([id, home]) => ({ id, home })) };
console.log(`Isolation evidence: ${JSON.stringify(summary)}`);
const problems = [];
if (code !== 0) problems.push(`the CLI test suite exited ${code}`);
if (added.length) problems.push(`${added.length} workflow(s) were added to the shared metrics store`);
if (after.runs !== before.runs) problems.push(`host scratch runs changed ${before.runs} -> ${after.runs}`);
if (after.reports !== before.reports) problems.push(`host scratch reports changed ${before.reports} -> ${after.reports}`);
// Observations of already-known workflows may be captured by the invoking
// workflow itself while the suite runs; test rows would need a new workflow.
if (problems.length) { console.error(`Isolation evidence failed: ${problems.join('; ')}`); process.exitCode = 1; }
else console.log('Isolation evidence passed: the full CLI suite left the shared metrics store and host scratch root unchanged.');
