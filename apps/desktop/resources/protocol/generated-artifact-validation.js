import { createHash } from 'node:crypto';
import vm from 'node:vm';

import { parseHTML } from 'linkedom';

const VALIDATOR = 'gatereeve/generated-html-dom-v1';
const CHECKS = Object.freeze([
  'parsed-document',
  'self-contained-resources',
  'inline-script-runtime',
  'native-reveal-controls',
  'visual-accessibility',
  'finding-links',
]);

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function allowedReference(element, attribute, value) {
  if (attribute === 'href') return value.startsWith('#');
  if (attribute === 'action' || attribute === 'srcset') return false;
  if (attribute === 'src' && element.localName === 'script') return false;
  return value.startsWith('#') || value.startsWith('data:');
}

function validateReferences(document, errors) {
  for (const element of document.querySelectorAll('base, form, iframe, object, embed, link')) {
    errors.push(`forbidden embedded element: ${element.localName}`);
  }
  for (const element of document.querySelectorAll('[src], [href], [action], [poster], [srcset]')) {
    for (const attribute of ['src', 'href', 'action', 'poster', 'srcset']) {
      const value = element.getAttribute(attribute);
      if (value === null || value === '') continue;
      if (!allowedReference(element, attribute, value.trim())) {
        errors.push(`${element.localName} uses non-embedded ${attribute}: ${value}`);
      }
    }
  }
  const styles = [
    ...[...document.querySelectorAll('style')].map((element) => element.textContent ?? ''),
    ...[...document.querySelectorAll('[style]')].map((element) => element.getAttribute('style') ?? ''),
  ];
  for (const css of styles) {
    if (/@import\b/iu.test(css)) errors.push('CSS imports are forbidden');
    for (const match of css.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/giu)) {
      if (!(match[2].startsWith('#') || match[2].startsWith('data:'))) {
        errors.push(`CSS uses non-embedded resource: ${match[2]}`);
      }
    }
  }
}

function executeInlineScripts(window, document, errors) {
  const messages = [];
  const originalConsole = window.console;
  window.console = Object.freeze({
    ...console,
    error: (...items) => messages.push(items.map(String).join(' ')),
  });
  window.requestAnimationFrame = (callback) => { callback(0); return 1; };
  window.cancelAnimationFrame = () => {};
  window.setTimeout = (callback) => { if (typeof callback === 'function') callback(); return 1; };
  window.clearTimeout = () => {};
  window.setInterval = () => 1;
  window.clearInterval = () => {};
  const context = vm.createContext(window, {
    name: 'gatereeve-whiteboard-html',
    codeGeneration: { strings: false, wasm: false },
  });
  for (const script of document.querySelectorAll('script')) {
    if (script.hasAttribute('src')) continue;
    const type = (script.getAttribute('type') ?? '').trim().toLowerCase();
    if (type && !['text/javascript', 'application/javascript'].includes(type)) {
      errors.push(`unsupported inline script type: ${type}`);
      continue;
    }
    try {
      new vm.Script(script.textContent ?? '', { filename: 'whiteboard-defense.html' })
        .runInContext(context, { timeout: 250 });
    } catch (error) {
      errors.push(`inline script error: ${error.message}`);
    }
  }
  try {
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    window.dispatchEvent(new window.Event('load'));
  } catch (error) {
    errors.push(`document lifecycle error: ${error.message}`);
  }
  errors.push(...messages.map((message) => `console error: ${message}`));
  window.console = originalConsole;
}

function validateControls(document, challengeOutput, defenseOutput, errors) {
  for (const challenge of challengeOutput?.challenges ?? []) {
    const root = document.querySelector(`[data-challenge-id="${challenge.id}"]`);
    if (!root) {
      errors.push(`missing challenge root ${challenge.id}`);
      continue;
    }
    for (const layer of ['concise', 'deep', 'evidence']) {
      const details = root.querySelector(
        `details[data-challenge-ref="${challenge.id}"][data-layer="${layer}"]`
      );
      if (!details?.querySelector(':scope > summary')) {
        errors.push(`missing ${challenge.id} ${layer} reveal control`);
      } else {
        details.open = true;
        if (!details.open) errors.push(`${challenge.id} ${layer} reveal cannot open`);
      }
    }
    for (const push of challenge.pushHarder ?? []) {
      const details = root.querySelector(`details[data-push-harder-id="${push.id}"]`);
      if (!details?.querySelector(':scope > summary')) {
        errors.push(`missing Push Harder reveal ${push.id}`);
      } else {
        details.open = true;
        if (!details.open) errors.push(`Push Harder reveal cannot open: ${push.id}`);
      }
    }
  }
  for (const visual of defenseOutput?.visualModels ?? []) {
    const root = document.querySelector(`[data-visual-id="${visual.id}"]`);
    const svg = root?.matches('svg') ? root : root?.querySelector('svg');
    if (!root || !svg || svg.getAttribute('role') !== 'img') {
      errors.push(`visual ${visual.id} lacks an SVG image role`);
      continue;
    }
    const description = svg.querySelector('desc')?.textContent?.trim()
      || svg.getAttribute('aria-label')?.trim();
    if (!description) errors.push(`visual ${visual.id} lacks a text alternative`);
  }
  if ((defenseOutput?.findings ?? []).length > 0) {
    const summary = document.querySelector('#defense-findings');
    if (!summary) errors.push('missing Defense Findings summary');
    for (const link of summary?.querySelectorAll('a[href^="#"]') ?? []) {
      if (!document.querySelector(link.getAttribute('href'))) {
        errors.push(`finding link has no target: ${link.getAttribute('href')}`);
      }
    }
  }
}

export async function validateGeneratedArtifacts({ module, outputs }) {
  if (module.id !== 'whiteboard-test/defense') return null;
  const html = outputs?.['defender-publisher']?.html;
  const errors = [];
  if (typeof html !== 'string' || html.trim() === '') {
    errors.push('generated HTML is empty');
  } else {
    try {
      const { window, document } = parseHTML(html);
      if (!document.documentElement || !document.querySelector('#whiteboard-defense')) {
        errors.push('generated HTML has no Whiteboard Defense document root');
      }
      validateReferences(document, errors);
      executeInlineScripts(window, document, errors);
      validateControls(document, outputs?.challenger, outputs?.['defender-publisher'], errors);
    } catch (error) {
      errors.push(`DOM validation error: ${error.message}`);
    }
  }
  return {
    schemaVersion: 1,
    validator: VALIDATOR,
    engine: 'linkedom-vm',
    result: errors.length === 0 ? 'PASS' : 'FAIL',
    htmlDigest: digest(html ?? ''),
    checks: [...CHECKS],
    errors,
  };
}
