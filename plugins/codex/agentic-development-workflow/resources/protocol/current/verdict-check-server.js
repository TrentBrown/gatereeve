// GateReeve's read-only verdict self-check (issue #142). A reviewer's provider
// CLI starts this process as a stdio MCP server with one tool,
// validate_verdict. The tool applies the exact contract the review execution
// applies when it records the verdict (checkReviewOutput) and reports the
// result; it never changes the verdict.
//
// Read-only by construction: the process reads its context file once, then
// only reads JSON-RPC requests on standard input and writes responses on
// standard output. It writes no file, opens no network connection and starts
// no process, so it gives the reviewer no access beyond its sealed view.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkReviewOutput, SELF_VALIDATION_SERVER, SELF_VALIDATION_TOOL, SELF_VALIDATION_CONTEXT } from './execution.js';
// One request line, and so one verdict, is bounded.
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const SERVER_VERSION = '1.0.0';
const DEFAULT_PROTOCOL = '2025-06-18';

export const TOOL = Object.freeze({
  name: SELF_VALIDATION_TOOL,
  title: 'Validate a GateReeve verdict',
  description: 'Check the complete object you intend to return ({"verdicts":[...]}) against the contract GateReeve applies when it records your verdict. '
    + 'Reports, for each requested gate, whether it is valid, the first contract error with its field path, the outcome GateReeve would record and the corrections it would record. '
    + 'Read-only: it never changes your verdict. Correct only what it reports, then call it again.',
  inputSchema: { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object' } } }, required: ['verdicts'] },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
});

// The context file holds what the execution's check needs (see
// checkReviewVerdicts): it is written by GateReeve into the sealed view.
export function loadContext(path) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value?.contract !== SELF_VALIDATION_CONTEXT || !value.context || !Array.isArray(value.context.gates)) {
    throw new Error('Self-validation context is not a GateReeve verdict-check context');
  }
  return value.context;
}

const result = (id, value) => ({ jsonrpc: '2.0', id, result: value });
const failure = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const content = (value, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], isError });

// One JSON-RPC message in, at most one response out. Exported for tests.
export function respond(message, context, contextError = null) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return failure(message?.id, -32600, 'Invalid request');
  }
  const { id, method, params } = message;
  // Notifications (no id) need no response.
  if (id === undefined) return null;
  switch (method) {
    case 'initialize':
      return result(id, { protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } }, serverInfo: { name: SELF_VALIDATION_SERVER, version: SERVER_VERSION },
        instructions: 'Call validate_verdict with your complete verdict object before you return it.' });
    case 'ping': return result(id, {});
    case 'tools/list': return result(id, { tools: [TOOL] });
    case 'tools/call': {
      if (params?.name !== SELF_VALIDATION_TOOL) return failure(id, -32602, `Unknown tool: ${String(params?.name)}`);
      if (contextError || !context) return result(id, content({ valid: false, error: `Self-validation context is unavailable: ${contextError ?? 'missing'}`, verdicts: [] }, true));
      let report;
      try { report = checkReviewOutput(params.arguments, context); }
      catch (error) { report = { valid: false, error: error?.message ?? String(error), verdicts: [] }; }
      return result(id, content(report));
    }
    default: return failure(id, -32601, `Method not found: ${method}`);
  }
}

// Newline-delimited JSON-RPC over stdio. A line over the bound is dropped
// and answered with an error, and the server keeps answering.
export function serve({ contextPath, input = process.stdin, output = process.stdout }) {
  let context = null, contextError = null;
  try { context = loadContext(contextPath); } catch (error) { contextError = error.message; }
  const send = value => { if (value) output.write(`${JSON.stringify(value)}\n`); };
  let pending = [], size = 0, oversized = false;
  const line = text => {
    if (!text.trim()) return;
    let message;
    try { message = JSON.parse(text); } catch { send(failure(null, -32700, 'Parse error')); return; }
    send(respond(message, context, contextError));
  };
  input.on('data', chunk => {
    let rest = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    while (rest.length) {
      const end = rest.indexOf(0x0a);
      const piece = end === -1 ? rest : rest.subarray(0, end);
      if (!oversized) {
        size += piece.length;
        if (size > MAX_REQUEST_BYTES) { oversized = true; pending = []; }
        else pending.push(Buffer.from(piece));
      }
      if (end === -1) break;
      if (oversized) send(failure(null, -32600, `Request exceeds ${MAX_REQUEST_BYTES} bytes`));
      else line(Buffer.concat(pending).toString('utf8'));
      pending = []; size = 0; oversized = false;
      rest = rest.subarray(end + 1);
    }
  });
  input.on('end', () => {
    if (oversized) send(failure(null, -32600, `Request exceeds ${MAX_REQUEST_BYTES} bytes`));
    else if (pending.length) line(Buffer.concat(pending).toString('utf8'));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) serve({ contextPath: process.argv[2] });
