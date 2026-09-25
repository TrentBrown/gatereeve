import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createWhiteboardBundle,
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
  <article data-challenge-id="routing-boundary"><button aria-controls="answer-routing-boundary">Reveal</button>
  <section id="answer-routing-boundary" hidden><div data-layer="concise">Concise</div>
  <div data-layer="deep">Deep</div><div data-layer="evidence">Evidence</div></section>
  <section data-push-harder-id="routing-failure">Push harder</section></article>
  <section id="defense-findings">Known limitation</section>
  <figure data-visual-id="request-flow"><svg role="img" aria-label="Request flow"></svg><figcaption>Request flow</figcaption></figure>
</main><script>document.querySelector('button').onclick=()=>{};</script></body></html>`;

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
  return {
    html,
    challengeOutput,
    defenseOutput: defender,
    receipts,
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
      files: {
        html: { path: 'whiteboard-defense.html', sha256: whiteboardDigest(html) },
        challenger: { path: 'challenger.json', sha256: whiteboardDigest(challengeOutput) },
        defender: { path: 'defender-publisher.json', sha256: whiteboardDigest(defender) },
      },
      receipts: receipts.map((item) => ({ stage: item.stage, sha256: whiteboardDigest(item) })),
    },
  };
}

test('work deficiencies remain visible without failing a substantive Whiteboard Defense', () => {
  const value = bundle();
  assert.equal(validateWhiteboardBundle(value).outcome, 'PASS');
  assert.equal(value.defenseOutput.findings[0].type, 'Known limitation');
});

test('artifact deficiencies fail validation when questions are softened or evidence is omitted', () => {
  const rewritten = bundle();
  rewritten.defenseOutput.challenges[0].prompt = 'A softer question?';
  assert.throws(() => validateWhiteboardBundle(rewritten), /rewrote question/);

  const unsupported = bundle();
  unsupported.defenseOutput.challenges[0].evidence = [];
  assert.throws(() => validateWhiteboardBundle(unsupported), /needs repository evidence/);
});

test('nontrivial defenses require a bound visual and self-contained sandbox-safe HTML', () => {
  const missingVisual = bundle();
  missingVisual.defenseOutput.visualModels = [];
  assert.throws(() => validateWhiteboardBundle(missingVisual), /needs a visual model/);

  const external = bundle();
  external.html = external.html.replace('</main>', '<img src="https://example.com/x.png"></main>');
  external.manifest.files.html.sha256 = whiteboardDigest(external.html);
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
  assert.throws(
    () => validateWhiteboardBundle({ ...value, repositoryPath }),
    /evidence line exceeds src\/router\.js/
  );
});
