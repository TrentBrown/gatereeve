import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { renderCurrentOverview } from '../renderer/current-view.js';

test('the desktop preserves dissent, exposes both receipts and labels autonomous risk acceptance', async t => {
  const { document } = parseHTML(await readFile(new URL('../renderer/index.html', import.meta.url), 'utf8'));
  globalThis.document = document; t.after(() => delete globalThis.document);
  const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
  const references = [{ hash: `sha256:${'a'.repeat(64)}` }, { hash: `sha256:${'b'.repeat(64)}` }];
  const selected = ['openai', 'anthropic'].map((modelProvider, index) => ({ modelProvider, model: `daily-${index}`, reasoningEffort: 'high' }));
  const snapshot = { featureId: 'feature', current: { phase: 'ACCEPTING', reviewerSelection: { selection: { reviewers: selected } } },
    dials: { rigor: 'full', autonomy: 'autonomous' }, phases: [], artifacts: [], blockers: [], actions: [],
    obligations: [{ id: 'review', label: 'Independent acceptance assessment', at: 'acceptance', role: 'independent' }],
    milestones: [{ name: 'acceptance', allowed: true, missing: [], outcomes: [{ id: 'review', outcome: 'FAIL', satisfied: true, reviews: references,
      adjudication: { reason: 'Bounded in-mandate judgment', stopReason: 'Further rounds add no evidence', dispositions: [{ findingId: 'anthropic/F1', outcome: 'accepted-risk', reason: 'Known trade-off', residualRisk: 'The reviewer objection remains open.' }] } }] }] };
  const opened = [];
  renderCurrentOverview(snapshot, elements, { readResult: hash => opened.push(hash) });
  const text = elements['module-settings-list'].textContent;
  assert.match(text, /openai: daily-0/); assert.match(text, /anthropic: daily-1/);
  assert.match(text, /Original reviewer verdicts remain FAIL/);
  assert.match(text, /Further rounds add no evidence/);
  assert.match(text, /reviewer objection remains open/);
  const buttons = [...elements['module-settings-list'].querySelectorAll('button')];
  assert.equal(buttons.length, 2); buttons.forEach(button => button.click());
  assert.deepEqual(opened, references.map(reference => reference.hash));
  assert.match(elements['workflow-dials'].textContent, /Autonomy · Autonomous/);
  assert.ok(elements['workflow-dials'].querySelector('.dial-autonomous'));
  const nativeResult = { hash: `sha256:${'c'.repeat(64)}` };
  snapshot.current.delegation = { decisions: [{ judgment: { reason: 'Planning objection rebutted with evidence.' }, evaluationOutcome: 'FAIL', nativeResult }] };
  renderCurrentOverview(snapshot, elements, { readResult: hash => opened.push(hash) });
  assert.match(elements['global-alerts'].textContent, /Original independent planning outcome: FAIL/);
  elements['global-alerts'].querySelector('button').click();
  assert.equal(opened.at(-1), nativeResult.hash);
});
