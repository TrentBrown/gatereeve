import './helpers/private-scratch.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { goalLines } from '../src/commands/current.js';

test('the CLI current view reports goal terminal state and the decisions made for the human', () => {
  assert.deepEqual(goalLines(null), []);
  assert.deepEqual(goalLines({ terminal: null, reason: 'No candidate is pinned yet', decisions: [] }), ['Goal: not yet terminal; No candidate is pinned yet']);
  assert.deepEqual(goalLines({ terminal: 'parked', reason: 'Parked behind PR #12: Needs credentials', decisions: [{ file: 'scratchpad.md', heading: 'Merge method' }] }),
    ['Goal: parked; Parked behind PR #12: Needs credentials', 'Decision made for you: scratchpad.md Merge method']);
});
