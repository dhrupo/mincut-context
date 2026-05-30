import type { SymbolGraph, NodeKind, EdgeKind } from '../core/graph.js';

export interface ContractStub {
  id: string;
  file: string;
  kind: NodeKind;
  name: string;
  signature: string;
  tokens: number;
  via: string[];
}
export interface Contract {
  stubs: ContractStub[];
  tokens: number;
  files: string[];
}
export interface ContractOptions {
  maxTokens?: number;
}

/** Edge kinds that represent an outbound *type* dependency of the region. */
const TYPE_EDGES: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  'call', 'reference', 'extends', 'implements', 'import',
]);

export interface FrontierEntry {
  id: string;
  via: string[];   // selected symbols that reference this frontier symbol
}

/**
 * The selected region's outbound dependency boundary: targets of TYPE_EDGES
 * leaving the selected set, that are not themselves selected and are not files.
 */
export function buildFrontier(
  graph: SymbolGraph,
  selected: ReadonlySet<string>,
): FrontierEntry[] {
  const via = new Map<string, Set<string>>();
  for (const src of selected) {
    for (const e of graph.outEdges(src)) {
      if (selected.has(e.target)) continue;
      if (!TYPE_EDGES.has(e.data.kind)) continue;
      const node = graph.getNode(e.target);
      if (!node || node.kind === 'file') continue;
      let set = via.get(e.target);
      if (!set) {
        set = new Set<string>();
        via.set(e.target, set);
      }
      set.add(src);
    }
  }
  return [...via.entries()]
    .map(([id, set]) => ({ id, via: [...set].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
