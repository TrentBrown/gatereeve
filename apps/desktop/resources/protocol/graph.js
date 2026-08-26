function nodeId(value) {
  return String(value).replace(/[^A-Za-z0-9_]/g, '_');
}

function quote(value) {
  return `"${String(value).replaceAll('"', "'")}"`;
}

function machineGraph(machine, prefix, group) {
  const nodes = machine.states.map((state) => ({
    id: `${prefix}:${state}`,
    label: state,
    group,
  }));
  const edges = machine.transitions.map((transition) => ({
    id: `${prefix}:${transition.id}`,
    from: `${prefix}:${transition.from}`,
    to: `${prefix}:${transition.to}`,
    label: transition.id,
    authority: transition.authority,
  }));
  return { nodes, edges };
}

export function modelGraph(model) {
  const machines = [
    machineGraph(model.feature, 'feature', 'Feature lifecycle'),
    machineGraph(model.slice, 'slice', 'Slice lifecycle'),
    machineGraph(model.change, 'change', 'Change lifecycle'),
  ];
  const gateNodes = model.boundary.gates.map((gate) => ({
    id: `gate:${gate.id}`,
    label: gate.id,
    group: 'PR boundary gates',
  }));
  const gateEdges = model.boundary.gates.flatMap((gate) =>
    gate.dependsOn.map((dependency) => ({
      id: `gate:${dependency}->${gate.id}`,
      from: `gate:${dependency}`,
      to: `gate:${gate.id}`,
      label: 'requires',
    }))
  );
  const graph = {
    schemaVersion: 1,
    kind: 'model',
    modelId: model.modelId,
    modelVersion: model.modelVersion,
    nodes: [...machines.flatMap((machine) => machine.nodes), ...gateNodes],
    edges: [...machines.flatMap((machine) => machine.edges), ...gateEdges],
  };
  return { ...graph, mermaid: renderMermaid(graph) };
}

export function currentGraph(projection) {
  const nodes = [
    {
      id: `feature:${projection.feature.state}`,
      label: `Feature: ${projection.feature.state}`,
      group: 'Current feature',
      status: 'current',
    },
  ];
  const edges = [];
  for (const slice of projection.slices) {
    nodes.push({
      id: `slice:${slice.id}`,
      label: `${slice.id}: ${slice.state}`,
      group: 'Slices',
      status: slice.id === projection.activeSliceId ? 'current' : 'recorded',
    });
    edges.push({
      id: `feature->slice:${slice.id}`,
      from: `feature:${projection.feature.state}`,
      to: `slice:${slice.id}`,
      label: 'contains',
    });
  }
  for (const attempt of projection.boundaryAttempts) {
    nodes.push({
      id: `attempt:${attempt.id}`,
      label: `${attempt.id}: ${attempt.state}`,
      group: 'Boundary attempts',
      status: attempt.state === 'ACTIVE' ? 'current' : 'recorded',
    });
    edges.push({
      id: `slice:${attempt.sliceId}->attempt:${attempt.id}`,
      from: `slice:${attempt.sliceId}`,
      to: `attempt:${attempt.id}`,
      label: attempt.scope,
    });
    for (const gate of attempt.gates) {
      const id = `attempt:${attempt.id}:gate:${gate.id}`;
      nodes.push({
        id,
        label: `${gate.id}: ${gate.outcome}/${gate.freshness}`,
        group: 'Gates',
        status:
          gate.freshness === 'STALE'
            ? 'stale'
            : gate.eligible
              ? 'eligible'
              : gate.outcome === 'PASS'
                ? 'passed'
                : 'recorded',
      });
      const dependencies = gate.dependsOn.length > 0
        ? gate.dependsOn.map((dependency) => `attempt:${attempt.id}:gate:${dependency}`)
        : [`attempt:${attempt.id}`];
      for (const dependency of dependencies) {
        edges.push({
          id: `${dependency}->${id}`,
          from: dependency,
          to: id,
          label: 'requires',
        });
      }
    }
  }
  for (const change of projection.changes) {
    const id = `change:${change.id}`;
    nodes.push({
      id,
      label: `${change.id}: ${change.state}`,
      group: 'Changes',
      status: projection.blockingChangeIds.includes(change.id) ? 'blocked' : 'recorded',
    });
    edges.push({
      id: `feature->${id}`,
      from: `feature:${projection.feature.state}`,
      to: id,
      label: change.target,
    });
  }
  const graph = {
    schemaVersion: 1,
    kind: 'current',
    featureId: projection.featureId,
    nodes,
    edges,
  };
  return { ...graph, mermaid: renderMermaid(graph) };
}

export function renderMermaid(graph) {
  const lines = ['flowchart TD'];
  for (const node of graph.nodes) {
    lines.push(`    ${nodeId(node.id)}[${quote(node.label)}]`);
  }
  for (const edge of graph.edges) {
    lines.push(
      `    ${nodeId(edge.from)} -->|${String(edge.label).replaceAll('|', '/')}| ${nodeId(edge.to)}`
    );
  }
  const styles = {
    current: 'fill:#2563eb,color:#fff,stroke:#1d4ed8,stroke-width:3px',
    eligible: 'fill:#dcfce7,stroke:#16a34a,stroke-width:2px',
    passed: 'fill:#f0fdf4,stroke:#22c55e',
    stale: 'fill:#fef3c7,stroke:#d97706,stroke-width:2px',
    blocked: 'fill:#fee2e2,stroke:#dc2626,stroke-width:2px',
  };
  for (const [status, style] of Object.entries(styles)) {
    const selected = graph.nodes.filter((node) => node.status === status);
    for (const node of selected) lines.push(`    style ${nodeId(node.id)} ${style}`);
  }
  return `${lines.join('\n')}\n`;
}
