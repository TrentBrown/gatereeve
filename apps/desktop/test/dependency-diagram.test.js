import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { dependencyLayout, renderDependencyDiagram } from '../renderer/dependency-diagram.js';

test('exact diagram handles partial dependencies and skipped levels without all-to-all barriers', () => {
  const { document } = parseHTML('<html><body><div id="graph"></div></body></html>');const previous = globalThis.document;globalThis.document = document;
  try {
    const modules = ['Verification', 'Code Review', 'Spec Evaluation', 'Judge', 'Packet'].map(id => ({ id, label: id }));
    const edges = [{ from: 'Verification', to: 'Code Review', kind: 'required' }, { from: 'Verification', to: 'Spec Evaluation', kind: 'required' }, { from: 'Verification', to: 'Judge', kind: 'required' }, { from: 'Code Review', to: 'Judge', kind: 'owner' }, { from: 'Judge', to: 'Packet', kind: 'conditional' }];
    const layout = dependencyLayout(modules, edges);assert.equal(layout.positions.get('Code Review').y, layout.positions.get('Spec Evaluation').y);
    const graph = document.getElementById('graph');let selected = null;renderDependencyDiagram(graph, modules, edges, { onSelect: m => { selected = m.id; } });
    const actual = [...graph.querySelectorAll('.dependency-edge')].map(e => ({ from: e.getAttribute('data-edge-from'), to: e.getAttribute('data-edge-to'), kind: e.getAttribute('data-edge-kind') }));assert.deepEqual(actual, edges);
    assert(!actual.some(e => e.from === 'Spec Evaluation' && e.to === 'Judge'));
    assert.match(graph.textContent, /Judge waits for Code Review: Owner-selected ordering/);assert.match(graph.textContent, /not completion barriers/);
    graph.querySelector('[data-module-id="Judge"]').dispatchEvent(new document.defaultView.Event('click'));assert.equal(selected, 'Judge');
    assert.throws(() => dependencyLayout(modules, [...edges, { from: 'Judge', to: 'Verification', kind: 'owner' }]), /cycle/);
  } finally { if (previous === undefined) delete globalThis.document;else globalThis.document = previous; }
});
