import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { failureResult } from './result.js';
import { executeCurrentRequest } from './current/adapter.js';
export const executePluginRequest = executeCurrentRequest;
export { resolveWorkflowContext } from './context.js';
export { createCodexAgentAdapter, createClaudeCodeAgentAdapter } from './local-agent-adapters.js';

async function readRequest(argv) {
  if (argv[2] === '--request-file') {
    return JSON.parse(await readFile(argv[3], 'utf8'));
  }
  if (argv[2] === 'status') {
    const cwdIndex = argv.indexOf('--cwd');
    return {
      operation: 'status',
      cwd: cwdIndex === -1 ? process.cwd() : argv[cwdIndex + 1],
    };
  }
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input);
}

async function main(argv) {
  let result;
  try {
    result = await executePluginRequest(await readRequest(argv));
  } catch (error) {
    result = failureResult('plugin-adapter', error);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv);
}
