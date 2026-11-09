import { requireThat } from './contracts.js';

export function runnerDiagnostics(result, configuration, environment) {
  const limit = configuration.diagnostics?.maxBytes ?? 65536;
  requireThat(Number.isSafeInteger(limit) && limit >= 0, 'Diagnostic maxBytes must be a nonnegative integer');
  // Named inherited additions are private by default, including low entropy
  // values. Never retain raw logs first and try to redact only their display.
  const privateNames = new Set([...(configuration.environment?.inherit ?? []), 'HOME', 'USER', 'LOGNAME']);
  const secrets = [...privateNames].map(name => environment[name]).filter(value => typeof value === 'string' && value.length)
    .sort((a, b) => b.length - a.length);
  const redact = value => secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), String(value ?? ''));
  const stdout = redact(result.stdout), stderr = redact(result.stderr);
  const combined = Buffer.from(`${stderr}${stderr && stdout ? '\n' : ''}${stdout}`);
  return { stdout, stderr, diagnostic: result.outcome === 'PASS' ? null : {
    excerpt: combined.subarray(0, limit).toString('utf8').replace(/\uFFFD$/u, ''),
    truncated: combined.length > limit, retainedBytes: combined.length, limit,
    detail: 'Redacted supporting output is retained in the stdout/stderr references.',
  } };
}
