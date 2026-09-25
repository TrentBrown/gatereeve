import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createWhiteboardBundle,
  createWhiteboardValidationReceipt,
  validateWhiteboardBundle,
  whiteboardDigest,
} from '../../plugin-src/plugins/whiteboard-test/shared/resources/whiteboard-test/validator.js';

const challengeOutput = {
  schemaVersion: 1,
  scopeSummary: 'A pinned change to request routing.',
  complexity: 'nontrivial',
  challenges: [{
    id: 'routing-boundary',
    prompt: 'Why is routing decided at this boundary?',
    rationale: 'Tests architectural intent.',
    pushHarder: [{
      id: 'routing-failure',
      prompt: 'What fails when route metadata is stale?',
      rationale: 'Tests failure understanding.',
    }],
  }],
};

const evidence = [{
  path: 'src/router.js', startLine: 10, endLine: 22,
  claim: 'The router owns selection and rejects stale metadata.',
}];

const defenseOutput = {
  schemaVersion: 1,
  title: 'Routing Whiteboard Defense',
  summary: 'The route boundary owns selection while handlers own execution.',
  challenges: [{
    id: 'routing-boundary',
    prompt: 'Why is routing decided at this boundary?',
    conciseDefense: 'It centralizes selection before handler side effects.',
    deepDefense: 'The boundary validates metadata once and passes an immutable selection.',
    evidence,
    pushHarder: [{
      id: 'routing-failure',
      prompt: 'What fails when route metadata is stale?',
      answer: 'The router rejects the request before a handler runs.',
      evidence,
    }],
  }],
  findings: [{
    type: 'Known limitation', challengeId: 'routing-boundary',
    summary: 'The current metrics do not distinguish every rejection cause.',
  }],
  visualModels: [{
    id: 'request-flow', title: 'Request flow', kind: 'sequence',
    description: 'A request flows through validation and routing before one handler runs.',
    evidenceRefs: ['src/router.js:10-22'],
  }],
  html: '',
};

const html = `<!doctype html><html><body><main id="whiteboard-defense">
  <article data-challenge-id="routing-boundary">
  <details data-challenge-ref="routing-boundary" data-layer="concise"><summary>Reveal concise defense</summary><p>Concise</p></details>
  <details data-layer="deep" data-challenge-ref="routing-boundary"><summary>Reveal deep defense</summary><p>Deep</p></details>
  <details data-challenge-ref="routing-boundary" data-layer="evidence"><summary>Reveal evidence</summary><p>Evidence</p></details>
  <details data-push-harder-id="routing-failure"><summary>Push harder</summary><p>Answer</p></details></article>
  <section id="defense-findings">Known limitation</section>
  <figure data-visual-id="request-flow"><svg role="img" aria-label="Request flow"></svg><figcaption>Request flow</figcaption></figure>
</main><script>document.documentElement.dataset.whiteboardReady='true';</script></body></html>`;

function artifactValidation(value = html, result = 'PASS', errors = []) {
  return {
    schemaVersion: 1,
    validator: 'gatereeve/generated-html-dom-v1',
    engine: 'linkedom-vm',
    result,
    htmlDigest: whiteboardDigest(value),
    checks: [
      'parsed-document',
      'self-contained-resources',
      'inline-script-runtime',
      'native-reveal-controls',
      'visual-accessibility',
      'finding-links',
    ],
    errors,
  };
}

function receipt(stage) {
  return {
    stage,
    isolation: { freshContext: true, inheritedTurns: 0 },
    policy: { repositoryAccess: 'read-only-pinned', networkAccess: 'denied' },
  };
}

function bundle() {
  const defender = structuredClone(defenseOutput);
  defender.html = html;
  const receipts = [receipt('challenger'), receipt('defender-publisher')];
  const generatedValidation = artifactValidation();
  return {
    html,
    challengeOutput,
    defenseOutput: defender,
    receipts,
    artifactValidation: generatedValidation,
    manifest: {
      schemaVersion: 1,
      kind: 'whiteboard-defense',
      module: { id: 'whiteboard-test/defense', version: '1.0.0', digest: `sha256:${'a'.repeat(64)}` },
      source: {
        attemptId: 'attempt-1', scope: 'SLICE', baseSha: 'base', headSha: 'head',
        inputFingerprint: `sha256:${'b'.repeat(64)}`,
      },
      outcome: 'PASS',
      summary: 'A substantive defense with one disclosed limitation.',
      substantive: true,
      artifactDeficiencies: [],
      validation: createWhiteboardValidationReceipt({
        html, challengeOutput, defenseOutput: defender, receipts,
        artifactValidation: generatedValidation,
      }),
      files: {
        html: { path: 'whiteboard-defense.html', sha256: whiteboardDigest(html) },
        challenger: { path: 'challenger.json', sha256: whiteboardDigest(challengeOutput) },
        defender: { path: 'defender-publisher.json', sha256: whiteboardDigest(defender) },
      },
      receipts: receipts.map((item) => ({ stage: item.stage, sha256: whiteboardDigest(item) })),
    },
  };
}

function refreshValidation(value) {
  value.manifest.validation = createWhiteboardValidationReceipt({
    html: value.html,
    challengeOutput: value.challengeOutput,
    defenseOutput: value.defenseOutput,
    receipts: value.receipts,
    artifactValidation: value.artifactValidation,
  });
  return value;
}

test('work deficiencies remain visible without failing a substantive Whiteboard Defense', () => {
  const value = bundle();
  assert.equal(validateWhiteboardBundle(value).outcome, 'PASS');
  assert.equal(value.defenseOutput.findings[0].type, 'Known limitation');
});

test('artifact deficiencies fail validation when questions are softened or evidence is omitted', () => {
  const rewritten = bundle();
  rewritten.defenseOutput.challenges[0].prompt = 'A softer question?';
  refreshValidation(rewritten);
  assert.throws(() => validateWhiteboardBundle(rewritten), /rewrote question/);

  const unsupported = bundle();
  unsupported.defenseOutput.challenges[0].evidence = [];
  refreshValidation(unsupported);
  assert.throws(() => validateWhiteboardBundle(unsupported), /needs repository evidence/);
});

test('missing native reveal controls and stale validation receipts prevent passage', () => {
  const staticArtifact = bundle();
  staticArtifact.html = staticArtifact.html.replace(
    '<details data-challenge-ref="routing-boundary" data-layer="concise"><summary>Reveal concise defense</summary><p>Concise</p></details>',
    '<div data-challenge-ref="routing-boundary" data-layer="concise"><p>Concise</p></div>'
  );
  staticArtifact.manifest.files.html.sha256 = whiteboardDigest(staticArtifact.html);
  staticArtifact.artifactValidation = artifactValidation(staticArtifact.html);
  staticArtifact.manifest.validation = createWhiteboardValidationReceipt({
    html: staticArtifact.html,
    challengeOutput: staticArtifact.challengeOutput,
    defenseOutput: staticArtifact.defenseOutput,
    receipts: staticArtifact.receipts,
    artifactValidation: staticArtifact.artifactValidation,
  });
  assert.throws(() => validateWhiteboardBundle(staticArtifact), /native details and summary/u);

  const stale = bundle();
  stale.manifest.validation.inputDigest = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => validateWhiteboardBundle(stale), /validation receipt is invalid or stale/u);
});

test('nontrivial defenses require a bound visual and self-contained sandbox-safe HTML', () => {
  const missingVisual = bundle();
  missingVisual.defenseOutput.visualModels = [];
  refreshValidation(missingVisual);
  assert.throws(() => validateWhiteboardBundle(missingVisual), /needs a visual model/);

  const external = bundle();
  external.html = external.html.replace('</main>', '<script src="helper.js"></script></main>');
  external.manifest.files.html.sha256 = whiteboardDigest(external.html);
  external.artifactValidation = artifactValidation(external.html);
  refreshValidation(external);
  assert.throws(() => validateWhiteboardBundle(external), /forbidden external authority/);
});

test('bundle creation turns artifact defects into an auditable gate FAIL without grading work findings', () => {
  const value = bundle();
  const module = value.manifest.module;
  const input = { source: value.manifest.source };
  const passed = createWhiteboardBundle({
    module,
    input,
    outputs: { challenger: value.challengeOutput, 'defender-publisher': value.defenseOutput },
    receipts: value.receipts,
    artifactValidation: value.artifactValidation,
  });
  assert.equal(passed.outcome, 'PASS');
  assert.deepEqual(passed.manifest.artifactDeficiencies, []);

  const broken = structuredClone(value.defenseOutput);
  broken.challenges[0].prompt = 'Softened';
  const failed = createWhiteboardBundle({
    module,
    input,
    outputs: { challenger: value.challengeOutput, 'defender-publisher': broken },
    receipts: value.receipts,
    artifactValidation: value.artifactValidation,
  });
  assert.equal(failed.outcome, 'FAIL');
  assert.match(failed.manifest.artifactDeficiencies[0], /rewrote question/);
});

test('governed validation resolves every evidence line against the pinned repository', async () => {
  const repositoryPath = await mkdtemp(join(tmpdir(), 'whiteboard-evidence-'));
  await mkdir(join(repositoryPath, 'src'));
  await writeFile(
    join(repositoryPath, 'src/router.js'),
    Array.from({ length: 25 }, (_, index) => `line ${index + 1}`).join('\n')
  );
  const value = bundle();
  assert.equal(validateWhiteboardBundle({ ...value, repositoryPath }).outcome, 'PASS');

  value.defenseOutput.challenges[0].evidence[0].endLine = 26;
  refreshValidation(value);
  assert.throws(
    () => validateWhiteboardBundle({ ...value, repositoryPath }),
    /evidence line exceeds src\/router\.js/
  );
});
