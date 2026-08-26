import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actionMeaning,
  featureStates,
  humanize,
  modeMessage,
} from '../renderer/presentation.js';

test('presentation derives the state rail from the pinned model and keeps exact IDs', () => {
  const snapshot = { projection: { feature: { state: 'PLANNING' } } };
  const model = {
    data: { lock: { model: { presentation: { featureOrder: [
      'DESIGNING', 'SPECIFYING', 'PLANNING', 'DELIVERING_SLICES',
    ] } } } },
  };
  assert.deepEqual(featureStates(snapshot, model).map(({ id, position }) => ({ id, position })), [
    { id: 'DESIGNING', position: 'complete' },
    { id: 'SPECIFYING', position: 'complete' },
    { id: 'PLANNING', position: 'current' },
    { id: 'DELIVERING_SLICES', position: 'pending' },
  ]);
  assert.equal(humanize('boundary.request-review'), 'Boundary request review');
});

test('diagnostic and action explanations distinguish observation from workflow passage', () => {
  assert.match(modeMessage({ mode: 'missing', blockers: [] }), /will not initialize or adopt/i);
  assert.match(modeMessage({ mode: 'legacy', blockers: [] }), /legacy workflow records/i);
  assert.match(modeMessage({ mode: 'inconsistent', blockers: [] }), /internally inconsistent/i);
  assert.match(modeMessage({ mode: 'incompatible', blockers: [] }), /will not reinterpret or migrate/i);
  assert.match(modeMessage({
    mode: 'governed', blockers: [], projection: { suspension: { paused: true } },
  }), /suspended/i);
  assert.match(actionMeaning('slice record-merge one'), /exact reviewed content/i);
});
