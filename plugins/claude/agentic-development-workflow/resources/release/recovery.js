export function classifyFailure(error) {
  if (['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'EPIPE'].includes(error?.code)) return { kind: 'transport', retryable: true };
  if ([429, 502, 503, 504].includes(error?.status)) return { kind: error.status === 429 ? 'rate-limit' : 'provider-unavailable', retryable: true };
  return { kind: [401, 403].includes(error?.status) ? 'authentication-or-permission' : 'investigation', retryable: false };
}

export async function retryTransient(operation, { budgetMs = 120000, now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), random = Math.random, onAttempt = () => {} } = {}) {
  if (!Number.isFinite(budgetMs) || budgetMs < 0) throw new Error('Retry elapsed-time budget must be nonnegative');
  const started = now(), attempts = [];
  for (;;) {
    try {
      const value = await operation();
      const attempt = { number: attempts.length + 1, outcome: 'PASS', elapsedMs: now() - started };
      attempts.push(attempt); await onAttempt(attempt);
      return { value, attempts };
    } catch (error) {
      const classification = classifyFailure(error);
      const delayMs = Math.max(error.retryAfterMs ?? 0, Math.min(30000, 1000 * 2 ** Math.min(attempts.length, 5)) * (0.8 + 0.4 * random()));
      const retry = classification.retryable && now() - started + delayMs <= budgetMs;
      const attempt = { number: attempts.length + 1, outcome: 'FAIL', classification: classification.kind,
        elapsedMs: now() - started, retry, delayMs: retry ? delayMs : null };
      attempts.push(attempt); await onAttempt(attempt);
      if (!retry) { error.attempts = attempts; throw error; }
      await sleep(delayMs);
    }
  }
}

