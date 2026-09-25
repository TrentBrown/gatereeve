import assert from 'node:assert/strict';
import test from 'node:test';

import { validateJsonSchema } from '../../plugin-src/shared/resources/protocol/json-schema.js';

test('validates the bounded schema vocabulary used by agent workflows', () => {
  const schema = {
    type: 'object',
    required: ['version', 'names'],
    properties: {
      version: { const: 1 },
      names: {
        type: 'array', minItems: 1, uniqueItems: true,
        items: { type: 'string', minLength: 1, pattern: '^[a-z]+$' },
      },
    },
    additionalProperties: false,
  };
  assert.deepEqual(validateJsonSchema(schema, { version: 1, names: ['one'] }), {
    version: 1, names: ['one'],
  });
  assert.throws(
    () => validateJsonSchema(schema, { version: 1, names: ['one', 'one'] }),
    /unique items/u,
  );
  assert.throws(
    () => validateJsonSchema(schema, { version: 1, names: ['ONE'] }),
    /must match/u,
  );
  assert.throws(
    () => validateJsonSchema(schema, { version: 1, names: ['one'], extra: true }),
    /not allowed/u,
  );
});

test('enforces maxProperties on stage dependency packets', () => {
  assert.throws(
    () => validateJsonSchema({ type: 'object', maxProperties: 0 }, { inherited: true }),
    /at most 0 properties/u,
  );
});
