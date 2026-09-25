import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const FINDING_TYPES = new Set([
  'Undocumented rationale',
  'Evidence gap',
  'Known limitation',
  'Open risk',
  'Unresolved unknown',
  'Supported inference',
  'Accepted tradeoff',
]);

function fail(message) {
  throw new Error(`Whiteboard Defense invalid: ${message}`);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function nonempty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be nonempty`);
}

function digest(value) {
  const content = typeof value === 'string' || Buffer.isBuffer(value)
    ? value
    : `${JSON.stringify(value)}\n`;
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function unique(items, label) {
  if (new Set(items).size !== items.length) fail(`${label} must be unique`);
}

function validateEvidence(evidence, label, repositoryPath = null) {
  if (!Array.isArray(evidence) || evidence.length === 0) fail(`${label} needs repository evidence`);
  for (const item of evidence) {
    object(item, `${label} evidence`);
    nonempty(item.path, `${label} evidence path`);
    nonempty(item.claim, `${label} evidence claim`);
    if (!Number.isSafeInteger(item.startLine) || item.startLine < 1) fail(`${label} evidence startLine is invalid`);
    if (!Number.isSafeInteger(item.endLine) || item.endLine < item.startLine) fail(`${label} evidence endLine is invalid`);
    if (repositoryPath !== null) {
      if (
        item.path.startsWith('/')
        || item.path.includes('\\')
        || item.path.split('/').some((part) => part === '' || part === '.' || part === '..')
      ) fail(`${label} evidence path is unsafe`);
      const root = realpathSync(repositoryPath);
      let path;
      try { path = realpathSync(resolve(root, item.path)); }
      catch { fail(`${label} evidence path does not exist: ${item.path}`); }
      if (!path.startsWith(`${root}${sep}`) || !lstatSync(path).isFile()) {
        fail(`${label} evidence path escapes the pinned repository: ${item.path}`);
      }
      const lineCount = readFileSync(path, 'utf8').split(/\r?\n/u).length;
      if (item.endLine > lineCount) fail(`${label} evidence line exceeds ${item.path}`);
    }
  }
}

function assertQuestionsPreserved(challengeOutput, defenseOutput, repositoryPath) {
  if (!Array.isArray(challengeOutput.challenges) || challengeOutput.challenges.length === 0) {
    fail('Challenger produced no questions');
  }
  if (!Array.isArray(defenseOutput.challenges)) fail('Defender challenges are missing');
  const challengeIds = challengeOutput.challenges.map((item) => item.id);
  unique(challengeIds, 'Challenger question IDs');
  if (JSON.stringify(defenseOutput.challenges.map((item) => item.id)) !== JSON.stringify(challengeIds)) {
    fail('Defender removed, added, or reordered primary questions');
  }
  for (let index = 0; index < challengeOutput.challenges.length; index += 1) {
    const source = challengeOutput.challenges[index];
    const answer = defenseOutput.challenges[index];
    if (answer.prompt !== source.prompt) fail(`Defender rewrote question ${source.id}`);
    nonempty(answer.conciseDefense, `${source.id} concise defense`);
    nonempty(answer.deepDefense, `${source.id} deep defense`);
    validateEvidence(answer.evidence, source.id, repositoryPath);
    const sourcePush = source.pushHarder ?? [];
    const answerPush = answer.pushHarder ?? [];
    if (
      JSON.stringify(answerPush.map((item) => [item.id, item.prompt]))
      !== JSON.stringify(sourcePush.map((item) => [item.id, item.prompt]))
    ) fail(`Defender removed, added, reordered, or rewrote Push Harder questions for ${source.id}`);
    for (const push of answerPush) {
      nonempty(push.answer, `${push.id} answer`);
      validateEvidence(push.evidence, push.id, repositoryPath);
    }
  }
}

function validateHtml(html, challengeOutput, defenseOutput) {
  nonempty(html, 'HTML');
  if (!/<html[\s>]/iu.test(html) || !/id=["']whiteboard-defense["']/iu.test(html)) {
    fail('HTML does not implement the Whiteboard Defense semantic root');
  }
  for (const challenge of challengeOutput.challenges) {
    const escaped = challenge.id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    if (!new RegExp(`data-challenge-id=["']${escaped}["']`, 'u').test(html)) {
      fail(`HTML omits challenge ${challenge.id}`);
    }
  }
  for (const layer of ['concise', 'deep', 'evidence']) {
    const count = html.match(new RegExp(`data-layer=["']${layer}["']`, 'gu'))?.length ?? 0;
    if (count < challengeOutput.challenges.length) fail(`HTML omits ${layer} reveal layers`);
  }
  for (const push of challengeOutput.challenges.flatMap((challenge) => challenge.pushHarder ?? [])) {
    const escaped = push.id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    if (!new RegExp(`data-push-harder-id=["']${escaped}["']`, 'u').test(html)) {
      fail(`HTML omits Push Harder question ${push.id}`);
    }
  }
  if (defenseOutput.findings.length > 0 && !/id=["']defense-findings["']/u.test(html)) {
    fail('HTML omits the linked Defense Findings summary');
  }
  for (const visual of defenseOutput.visualModels ?? []) {
    const escaped = visual.id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    if (!new RegExp(`data-visual-id=["']${escaped}["']`, 'u').test(html)) {
      fail(`HTML omits visual model ${visual.id}`);
    }
  }
  if (challengeOutput.complexity === 'nontrivial') {
    if (!Array.isArray(defenseOutput.visualModels) || defenseOutput.visualModels.length === 0) {
      fail('Nontrivial defense needs a visual model');
    }
    if (!/<(?:svg|figure)[\s>]/iu.test(html)) fail('HTML omits its declared visual model');
  }
  const forbidden = [
    /<(?:script|img|iframe|link|audio|video|source)\b[^>]+\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//iu,
    /<(?:base|form|object|embed)\b/iu,
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/u,
    /\b(?:window\.parent|window\.top|parent\.|top\.)/u,
    /\blocation\s*=|\.location\s*=/u,
  ];
  if (forbidden.some((pattern) => pattern.test(html))) fail('HTML requests forbidden external authority');
}

function validateFileBinding(binding, expectedPath, content, label) {
  object(binding, `${label} binding`);
  if (binding.path !== expectedPath || !SHA256.test(binding.sha256)) fail(`${label} binding is invalid`);
  if (binding.sha256 !== digest(content)) fail(`${label} digest mismatch`);
}

export function validateWhiteboardBundle({
  manifest,
  html,
  challengeOutput,
  defenseOutput,
  receipts,
  repositoryPath = null,
}) {
  object(manifest, 'manifest');
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'whiteboard-defense') fail('manifest kind or version is unsupported');
  object(manifest.module, 'manifest module');
  object(manifest.source, 'manifest source');
  for (const field of ['id', 'version', 'digest']) nonempty(manifest.module[field], `manifest module ${field}`);
  for (const field of ['attemptId', 'scope', 'baseSha', 'headSha', 'inputFingerprint']) {
    nonempty(manifest.source[field], `manifest source ${field}`);
  }
  if (!['PASS', 'FAIL'].includes(manifest.outcome)) fail('manifest outcome is invalid');
  nonempty(manifest.summary, 'manifest summary');
  if (typeof manifest.substantive !== 'boolean') fail('manifest substantive flag is invalid');
  if (!Array.isArray(manifest.artifactDeficiencies)) fail('manifest artifact deficiencies must be an array');
  if (manifest.outcome === 'PASS' && manifest.substantive !== true) fail('PASS requires a substantive defense');
  if (manifest.outcome === 'PASS' && manifest.artifactDeficiencies.length > 0) fail('PASS cannot declare artifact deficiencies');
  if (manifest.outcome === 'FAIL' && manifest.artifactDeficiencies.length === 0) fail('FAIL must identify an artifact deficiency');

  object(challengeOutput, 'Challenger output');
  object(defenseOutput, 'Defender output');
  if (challengeOutput.schemaVersion !== 1 || defenseOutput.schemaVersion !== 1) fail('stage output version is unsupported');
  assertQuestionsPreserved(challengeOutput, defenseOutput, repositoryPath);

  if (!Array.isArray(defenseOutput.findings)) fail('findings must be an array');
  for (const finding of defenseOutput.findings) {
    if (!FINDING_TYPES.has(finding.type)) fail(`unknown finding type ${finding.type}`);
    nonempty(finding.summary, 'finding summary');
    if (finding.challengeId !== null && !challengeOutput.challenges.some((item) => item.id === finding.challengeId)) {
      fail(`finding references unknown challenge ${finding.challengeId}`);
    }
  }
  const evidenceRefs = new Set(defenseOutput.challenges.flatMap((challenge) => [
    ...challenge.evidence,
    ...challenge.pushHarder.flatMap((push) => push.evidence),
  ]).flatMap((item) => [item.path, `${item.path}:${item.startLine}-${item.endLine}`]));
  for (const visual of defenseOutput.visualModels ?? []) {
    nonempty(visual.id, 'visual model id');
    nonempty(visual.title, 'visual model title');
    nonempty(visual.kind, 'visual model kind');
    nonempty(visual.description, 'visual model text alternative');
    if (!Array.isArray(visual.evidenceRefs) || visual.evidenceRefs.length === 0) fail(`${visual.id} needs evidence references`);
    if (visual.evidenceRefs.some((reference) => !evidenceRefs.has(reference))) {
      fail(`${visual.id} references evidence outside the defended challenges`);
    }
  }
  validateHtml(html, challengeOutput, defenseOutput);

  object(manifest.files, 'manifest files');
  validateFileBinding(manifest.files.html, 'whiteboard-defense.html', html, 'HTML');
  validateFileBinding(manifest.files.challenger, 'challenger.json', challengeOutput, 'Challenger output');
  validateFileBinding(manifest.files.defender, 'defender-publisher.json', defenseOutput, 'Defender output');
  if (!Array.isArray(receipts) || receipts.length !== 2 || !Array.isArray(manifest.receipts)) {
    fail('exactly two stage receipts are required');
  }
  const stages = receipts.map((receipt) => receipt.stage);
  if (JSON.stringify(stages) !== JSON.stringify(['challenger', 'defender-publisher'])) {
    fail('stage receipts do not prove the required isolation sequence');
  }
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index];
    const binding = manifest.receipts[index];
    if (binding.stage !== receipt.stage || binding.sha256 !== digest(receipt)) fail(`receipt binding mismatch for ${receipt.stage}`);
    if (
      receipt.isolation?.freshContext !== true
      || receipt.isolation?.inheritedTurns !== 0
      || receipt.policy?.repositoryAccess !== 'read-only-pinned'
      || receipt.policy?.networkAccess !== 'denied'
    ) fail(`receipt policy is insufficient for ${receipt.stage}`);
  }
  return manifest;
}

export function whiteboardDigest(value) {
  return digest(value);
}

export function createWhiteboardBundle({ module, input, outputs, receipts, repositoryPath = null }) {
  const challengeOutput = outputs?.challenger;
  const defenseOutput = outputs?.['defender-publisher'];
  const html = defenseOutput?.html;
  const source = input?.source;
  const receiptBindings = (receipts ?? []).map((receipt) => ({
    stage: receipt.stage,
    path: `${receipt.stage}-receipt.json`,
    sha256: digest(receipt),
  }));
  const manifest = {
    schemaVersion: 1,
    kind: 'whiteboard-defense',
    module: { id: module.id, version: module.version, digest: module.digest },
    source: {
      attemptId: source?.attemptId,
      scope: source?.scope,
      baseSha: source?.baseSha,
      headSha: source?.headSha,
      inputFingerprint: source?.inputFingerprint,
    },
    outcome: 'PASS',
    summary: defenseOutput?.summary ?? 'Whiteboard Defense artifact validation failed.',
    substantive: true,
    artifactDeficiencies: [],
    files: {
      html: { path: 'whiteboard-defense.html', sha256: digest(html ?? '') },
      challenger: { path: 'challenger.json', sha256: digest(challengeOutput ?? null) },
      defender: { path: 'defender-publisher.json', sha256: digest(defenseOutput ?? null) },
    },
    receipts: receiptBindings,
  };
  try {
    validateWhiteboardBundle({
      manifest, html, challengeOutput, defenseOutput, receipts, repositoryPath,
    });
  } catch (error) {
    manifest.outcome = 'FAIL';
    manifest.substantive = false;
    manifest.artifactDeficiencies = [error.message];
  }
  return {
    outcome: manifest.outcome,
    summary: manifest.summary,
    manifest,
    files: {
      'whiteboard-defense.json': manifest,
      'whiteboard-defense.html': html ?? '',
      'challenger.json': challengeOutput ?? null,
      'defender-publisher.json': defenseOutput ?? null,
      'challenger-receipt.json': receipts?.find((receipt) => receipt.stage === 'challenger') ?? null,
      'defender-publisher-receipt.json': receipts?.find((receipt) => receipt.stage === 'defender-publisher') ?? null,
    },
  };
}
