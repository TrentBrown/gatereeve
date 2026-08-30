// @ts-check

import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
});

export function registerRendererProtocol(
  protocol,
  rendererRoot,
  { brandingAsset = null, readArtifact } = {},
) {
  const rootPromise = realpath(rendererRoot);
  const brandingPromise = brandingAsset === null ? null : realpath(brandingAsset);
  protocol.handle('gatereeve-app', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'desktop' || request.method !== 'GET') {
      return new Response('Not found', { status: 404 });
    }
    let relativePath;
    try {
      relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    } catch {
      return new Response('Not found', { status: 404 });
    }
    try {
      const root = await rootPromise;
      const brandingRoute = 'branding/gatereeve-rolling-vale.png';
      const servesBranding = relativePath === brandingRoute && brandingPromise !== null;
      const path = servesBranding
        ? await brandingPromise
        : await realpath(resolve(root, relativePath));
      if (!servesBranding && !path.startsWith(`${root}${sep}`)) {
        return new Response('Not found', { status: 404 });
      }
      const contentType = CONTENT_TYPES[extname(path)];
      if (contentType === undefined) return new Response('Not found', { status: 404 });
      return new Response(await readFile(path), {
        status: 200,
        headers: {
          'content-type': contentType,
          'cache-control': 'no-store',
          'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; frame-src gatereeve-artifact:; object-src 'none'; base-uri 'none'; form-action 'none'",
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  protocol.handle('gatereeve-artifact', async (request) => {
    if (request.method !== 'GET' || typeof readArtifact !== 'function') {
      return new Response('Not found', { status: 404 });
    }
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'desktop') return new Response('Not found', { status: 404 });
      const artifactId = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      if (!artifactId) return new Response('Not found', { status: 404 });
      const detail = await readArtifact(artifactId);
      if (detail?.kind !== 'artifact' || detail.data?.artifact?.format !== 'html') {
        return new Response('Not found', { status: 404 });
      }
      return new Response(detail.data.content, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
