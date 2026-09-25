import assert from 'node:assert/strict';
import test from 'node:test';

import { validateGeneratedArtifacts } from '../resources/protocol/generated-artifact-validation.js';

const module = { id: 'whiteboard-test/defense' };
const challenger = {
  challenges: [{
    id: 'routing-boundary',
    pushHarder: [{ id: 'routing-failure' }],
  }],
};
const defense = {
  findings: [{ summary: 'A disclosed limitation.' }],
  visualModels: [{ id: 'request-flow' }],
};

function html(extra = '') {
  return `<!doctype html><html><body><main id="whiteboard-defense">
    <article id="challenge-routing" data-challenge-id="routing-boundary">
      <details data-challenge-ref="routing-boundary" data-layer="concise"><summary>Concise</summary><p>Answer</p></details>
      <details data-challenge-ref="routing-boundary" data-layer="deep"><summary>Deep</summary><p>Answer</p></details>
      <details data-challenge-ref="routing-boundary" data-layer="evidence"><summary>Evidence</summary><p>Evidence</p></details>
      <details data-push-harder-id="routing-failure"><summary>Push harder</summary><p>Answer</p></details>
    </article>
    <section id="defense-findings"><a href="#challenge-routing">Finding</a></section>
    <figure data-visual-id="request-flow"><svg role="img"><desc>Request flow</desc></svg></figure>
    ${extra}
  </main><script>document.documentElement.dataset.ready = 'true';</script></body></html>`;
}

async function validate(value) {
  return validateGeneratedArtifacts({
    module,
    outputs: {
      challenger,
      'defender-publisher': { ...defense, html: value },
    },
  });
}

test('executes and inspects the generated Whiteboard artifact in a DOM', async () => {
  const result = await validate(html());
  assert.equal(result.result, 'PASS');
  assert.deepEqual(result.errors, []);
  assert.equal(result.checks.includes('inline-script-runtime'), true);
});

test('rejects relative resources instead of treating them as self-contained', async () => {
  const result = await validate(html(`
    <script src="helper.js"></script>
    <style>@import "theme.css";</style>
  `));
  assert.equal(result.result, 'FAIL');
  assert.match(result.errors.join('\n'), /non-embedded src: helper\.js/u);
  assert.match(result.errors.join('\n'), /CSS imports are forbidden/u);
});

test('rejects inline runtime errors from the generated artifact', async () => {
  const result = await validate(html('<script>throw new Error("broken interaction")</script>'));
  assert.equal(result.result, 'FAIL');
  assert.match(result.errors.join('\n'), /inline script error: broken interaction/u);
});

test('rejects missing reveal controls and inaccessible visual models', async () => {
  const broken = html()
    .replace('<summary>Deep</summary>', '<span>Deep</span>')
    .replace('<svg role="img"><desc>Request flow</desc></svg>', '<svg></svg>');
  const result = await validate(broken);
  assert.equal(result.result, 'FAIL');
  assert.match(result.errors.join('\n'), /missing routing-boundary deep reveal control/u);
  assert.match(result.errors.join('\n'), /visual request-flow lacks an SVG image role/u);
});
