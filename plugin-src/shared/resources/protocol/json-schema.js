import { ContractError } from './errors.js';

function kind(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function problem(path, message) {
  throw new ContractError(`${path} ${message}`);
}

function validateType(schema, value, path) {
  if (schema.type === undefined) return;
  const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = kind(value);
  if (!expected.includes(actual) && !(actual === 'integer' && expected.includes('number'))) {
    problem(path, `must be ${expected.join(' or ')}`);
  }
}

function validateNode(schema, value, path) {
  if (schema === true) return;
  if (schema === false || schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    problem(path, 'uses an unsupported JSON Schema node');
  }
  validateType(schema, value, path);
  if (Object.hasOwn(schema, 'const') && !Object.is(value, schema.const)) {
    problem(path, `must equal ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    problem(path, `must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`);
  }
  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      problem(path, `must contain at least ${schema.minLength} characters`);
    }
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
      problem(path, `must contain at most ${schema.maxLength} characters`);
    }
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) {
      problem(path, `must match ${schema.pattern}`);
    }
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      problem(path, `must be at least ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      problem(path, `must be at most ${schema.maximum}`);
    }
  }
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      problem(path, `must contain at least ${schema.minItems} items`);
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      problem(path, `must contain at most ${schema.maxItems} items`);
    }
    if (schema.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      problem(path, 'must contain unique items');
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => validateNode(schema.items, item, `${path}[${index}]`));
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const name of schema.required ?? []) {
      if (!Object.hasOwn(value, name)) problem(`${path}.${name}`, 'is required');
    }
    if (Number.isInteger(schema.minProperties) && Object.keys(value).length < schema.minProperties) {
      problem(path, `must contain at least ${schema.minProperties} properties`);
    }
    if (Number.isInteger(schema.maxProperties) && Object.keys(value).length > schema.maxProperties) {
      problem(path, `must contain at most ${schema.maxProperties} properties`);
    }
    for (const [name, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, name)) validateNode(properties[name], child, `${path}.${name}`);
      else if (schema.additionalProperties === false) problem(`${path}.${name}`, 'is not allowed');
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateNode(schema.additionalProperties, child, `${path}.${name}`);
      }
    }
  }
}

export function validateJsonSchema(schema, value, { label = 'value' } = {}) {
  validateNode(schema, value, label);
  return value;
}
