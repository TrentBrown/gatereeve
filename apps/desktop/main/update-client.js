// @ts-check

import {
  DESKTOP_UPDATE_MANIFEST_URL,
  requireDesktopUpdateManifest,
} from './update-manifest.js';

export const UPDATE_RESPONSE_LIMIT_BYTES = 65_536;
export const UPDATE_REQUEST_TIMEOUT_MS = 10_000;

async function readBoundedBody(response, limit) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > limit) throw new Error('Update manifest exceeds the size limit.');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > limit) throw new Error('Update manifest exceeds the size limit.');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Update manifest exceeds the size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

export async function fetchDesktopUpdateManifest({
  fetchFn = globalThis.fetch,
  signal = null,
  timeoutMs = UPDATE_REQUEST_TIMEOUT_MS,
  responseLimitBytes = UPDATE_RESPONSE_LIMIT_BYTES,
} = {}) {
  if (typeof fetchFn !== 'function') throw new Error('Update transport is unavailable.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener?.('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const response = await fetchFn(DESKTOP_UPDATE_MANIFEST_URL, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Update manifest returned HTTP ${response.status}.`);
    const text = await readBoundedBody(response, responseLimitBytes);
    return requireDesktopUpdateManifest(JSON.parse(text));
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.('abort', abort);
  }
}
