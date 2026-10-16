import { node } from './dom.js';

const labels = { required: 'Required prerequisite', conditional: 'Module ordering when enabled', owner: 'Owner-selected ordering when enabled' };
let nextDiagramId = 0;

export function dependencyLayout(modules, edges) {
  const ids = new Set(modules.map(m => m.id));
  const active = edges.filter(e => ids.has(e.from) && ids.has(e.to));
  const depth = new Map();
  const visit = (id, path = new Set()) => {
    if (depth.has(id)) return depth.get(id);
    if (path.has(id)) throw new Error('Dependency diagram contains a cycle');
    const next = new Set(path).add(id);
    const parents = active.filter(e => e.to === id).map(e => e.from);
    const value = parents.length ? 1 + Math.max(...parents.map(parent => visit(parent, next))) : 0;
    depth.set(id, value); return value;
  };
  modules.forEach(m => visit(m.id));
  const levels = [...new Set(depth.values())].sort((a, b) => a - b);
  const width = Math.max(440, ...levels.map(level => modules.filter(m => depth.get(m.id) === level).length * 240));
  const positions = new Map();
  for (const level of levels) {
    const peers = modules.filter(m => depth.get(m.id) === level);
    peers.forEach((m, i) => positions.set(m.id, { x: width * (i + 0.5) / peers.length, y: 24 + level * 108 }));
  }
  return { edges: active, positions, width, height: 100 + (levels.at(-1) ?? 0) * 108 };
}

/** Draw only actual relationships; visual rows never impose extra dependencies. */
export function renderDependencyDiagram(container, modules, edges, { onSelect = null } = {}) {
  const layout = dependencyLayout(modules, edges);
  const document = container.ownerDocument;
  const svgNode = (tag, attrs = {}, text = null) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    if (text !== null) el.textContent = text;
    return el;
  };
  const markerId = `dependency-arrow-${++nextDiagramId}`;
  const skipped = layout.edges.filter(edge => layout.positions.get(edge.to).y - layout.positions.get(edge.from).y > 108);
  const routeMargin = skipped.length ? 24 + skipped.length * 12 : 0;
  const svg = svgNode('svg', { class: 'dependency-diagram', viewBox: `0 0 ${layout.width + routeMargin} ${layout.height}`, role: 'group', 'aria-label': 'Exact module dependency graph' });
  const defs = svgNode('defs');const marker = svgNode('marker', { id: markerId, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.append(svgNode('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'context-stroke' }));defs.append(marker);svg.append(defs);
  const byId = new Map(modules.map(m => [m.id, m]));
  for (const edge of layout.edges) {
    const from = layout.positions.get(edge.from);const to = layout.positions.get(edge.to);
    const y1 = from.y + 54;const y2 = to.y;const mid = (y1 + y2) / 2;
    const lane = layout.width + 12 + skipped.indexOf(edge) * 12;
    const route = skipped.includes(edge)
      ? `M ${from.x} ${y1} V ${y1 + 12} H ${lane} V ${y2 - 12} H ${to.x} V ${y2}`
      : `M ${from.x} ${y1} C ${from.x} ${mid} ${to.x} ${mid} ${to.x} ${y2}`;
    const path = svgNode('path', { class: `dependency-edge dependency-edge-${edge.kind}`, d: route, 'marker-end': `url(#${markerId})`, 'data-edge-from': edge.from, 'data-edge-to': edge.to, 'data-edge-kind': edge.kind });
    path.append(svgNode('title', {}, `${byId.get(edge.from).label} → ${byId.get(edge.to).label}: ${labels[edge.kind]}`));svg.append(path);
  }
  for (const module of modules) {
    const point = layout.positions.get(module.id);
    const group = svgNode('g', { class: 'dependency-node', transform: `translate(${point.x - 106}, ${point.y})`, 'data-module-id': module.id, ...(onSelect ? { role: 'button', tabindex: 0, 'aria-label': `Inspect ${module.label}` } : {}) });
    group.append(svgNode('rect', { width: 212, height: 54, rx: 8 }));
    group.append(svgNode('text', { x: 106, y: 23, 'text-anchor': 'middle' }, module.label.length > 30 ? `${module.label.slice(0, 29)}…` : module.label));
    group.append(svgNode('text', { class: 'dependency-node-status', x: 106, y: 42, 'text-anchor': 'middle' }, module.outcome ? `${module.outcome} · ${module.freshness}` : module.locked ? 'Protected module' : 'Workflow module'));
    group.append(svgNode('title', {}, module.label));
    if (onSelect) {
      group.addEventListener('click', () => onSelect(module));
      group.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); onSelect(module); } });
    }
    svg.append(group);
  }
  const legend = node('p', { className: 'dependency-legend', text: 'Solid: required prerequisite · Dashed: module ordering · Dotted: owner ordering. Ordering applies while both modules are enabled. Rows show dependency depth, not completion barriers.' });
  const relationships = node('details', { className: 'dependency-relationships' }, [node('summary', { text: 'Read dependency relationships' })]);
  const list = node('ul');
  for (const edge of layout.edges) list.append(node('li', { text: `${byId.get(edge.to).label} waits for ${byId.get(edge.from).label}: ${labels[edge.kind]}.` }));
  if (layout.edges.length === 0) list.append(node('li', { text: 'No dependencies between these modules.' }));
  relationships.append(list);container.append(svg, legend, relationships);
  return layout;
}
