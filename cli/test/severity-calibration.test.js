import './helpers/private-scratch.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatorInstructions, REVIEW_CONTRACT_VERSION, retainedContractQualifies } from '../../plugin-src/shared/resources/protocol/current/execution.js';
import { planningInstructions } from '../../plugin-src/shared/resources/protocol/current/delegation.js';

// Issue #143: severity calibration (AC1), the failure model in reviews (AC2)
// and the light-run documentation bar (AC6), asserted on the exact text each
// reviewer receives.
const full = evaluatorInstructions(null);
const brief = evaluatorInstructions({ requirements: { 'brief.md': {} } });
const LIKELIHOOD = [
  /Judge likelihood before consequence\./u,
  /realistic when it arises in ordinary use within the handled conditions, with no one acting unusually\./u,
  /two or more independent uncommon conditions at once/u,
  /is low whatever its consequence: a severe consequence never raises an unusual scenario above low/u,
  /a crash or signal at one specific step, a concurrent writer, a hand-edited or corrupted record, a clock change, a provider outage/u,
  /Name the conditions a scenario needs in its failureScenario/u,
];
const FAILURE_MODEL = [
  /The stated failure model is the Failure model section of requirements\/spec\.md, or of requirements\/brief\.md/u,
  /a finding whose trigger lies outside its handled conditions is low/u,
  /a failure of the model's own detect-and-refuse behaviour is inside the model and is rated on its scenario/u,
  /no finding is low merely for lying outside a model/u,
];
const DOCS_BAR = [
  /Documentation bar for this light run/u,
  /blocks only when a reader following the text as written, in a realistic scenario, reaches a wrong or unsafe outcome/u,
  /a wrong command, flag, path or value; a missing warning before a destructive or irreversible step; or a statement that contradicts the shipped code or the brief/u,
  /Wording, style, tone, structure, narrower restatements of an already fixed point, rare edge cases the text does not mention and suggestions to document more are low/u,
  /The bar never lowers the brief: documentation that the brief's goal or scope asks for is a requirement/u,
];

test('code reviewers judge likelihood before consequence in full and light runs (AC1)', () => {
  for (const text of [full, brief]) for (const pattern of LIKELIHOOD) assert.match(text, pattern);
  // The D8 definitions and the low-never-blocks rule stay.
  for (const text of [full, brief]) {
    assert.match(text, /low when it needs an unusual combination of conditions or lies outside the stated failure model/u);
    assert.match(text, /Low findings never block: set blocking false/u);
  }
});

test('planning reviewers apply the same severity rule and judge failure-model gaps (AC1, AC2)', () => {
  for (const pattern of LIKELIHOOD) assert.match(planningInstructions, pattern);
  assert.match(planningInstructions, /The stated failure model is the Failure model section of requirements\/spec\.md, or of requirements\/brief\.md for a brief/u);
  assert.match(planningInstructions, /a finding whose trigger lies outside its handled conditions is low/u);
  assert.match(planningInstructions, /detect-and-refuse behaviour is inside the model and is rated on its scenario/u);
  assert.match(planningInstructions, /When there is no Failure model section, no finding is low merely for lying outside a model/u);
  assert.match(planningInstructions, /also judge whether it has an obvious gap: a realistic condition the work must meet that the model neither handles nor refuses/u);
});

test('code reviewers read the failure model from the requirement basis (AC2)', () => {
  for (const text of [full, brief]) for (const pattern of FAILURE_MODEL) assert.match(text, pattern);
});

test('only light-run reviewers receive the documentation bar (AC6)', () => {
  for (const pattern of DOCS_BAR) assert.match(brief, pattern);
  assert.doesNotMatch(full, /Documentation bar/u);
  // Full rules stay a prefix of the brief-based rules.
  assert.ok(brief.startsWith(full));
});

test('the review contract version moved and keeps retained qualification rules (AC8)', () => {
  assert.equal(REVIEW_CONTRACT_VERSION, 'gatereeve-review/2026-11-c2');
  assert.equal(retainedContractQualifies({ reviewContract: 'sha256:old', reviewContractVersion: 'gatereeve-review/2026-11-c1' }, 'sha256:new'), true,
    'a result retained under the previous version keeps its recorded qualification');
  assert.equal(retainedContractQualifies({ reviewContract: 'sha256:old', reviewContractVersion: REVIEW_CONTRACT_VERSION }, 'sha256:new'), false,
    'within the new version the fingerprint must match');
});
