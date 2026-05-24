export type NodeKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'export'
  | 'file';

export type EdgeKind = 'call' | 'import' | 'reference' | 'extends' | 'implements' | 'contains';

export interface NodeData {
  tokens: number;
  file: string;
  kind: NodeKind;
  name?: string;
  startLine?: number;
  endLine?: number;
}

export interface EdgeData {
  weight: number;
  kind: EdgeKind;
}

export interface OutEdge {
  target: string;
  data: EdgeData;
}

export class SymbolGraph {
  private readonly nodeData = new Map<string, NodeData>();
  private readonly outAdj = new Map<string, Map<string, EdgeData>>();
  private readonly inAdj = new Map<string, Map<string, EdgeData>>();
  private edgeCount = 0;

  addNode(id: string, data: NodeData): void {
    if (this.nodeData.has(id)) {
      throw new Error(`duplicate node: ${id}`);
    }
    this.nodeData.set(id, data);
    this.outAdj.set(id, new Map());
    this.inAdj.set(id, new Map());
  }

  hasNode(id: string): boolean {
    return this.nodeData.has(id);
  }

  getNode(id: string): NodeData | undefined {
    return this.nodeData.get(id);
  }

  nodes(): string[] {
    return [...this.nodeData.keys()];
  }

  order(): number {
    return this.nodeData.size;
  }

  size(): number {
    return this.edgeCount;
  }

  addEdge(source: string, target: string, data: EdgeData): void {
    if (!this.nodeData.has(source)) throw new Error(`missing source node: ${source}`);
    if (!this.nodeData.has(target)) throw new Error(`missing target node: ${target}`);

    const out = this.outAdj.get(source)!;
    const existing = out.get(target);
    if (existing) {
      existing.weight += data.weight;
      return;
    }
    out.set(target, { ...data });
    this.inAdj.get(target)!.set(source, out.get(target)!);
    this.edgeCount += 1;
  }

  hasEdge(source: string, target: string): boolean {
    return this.outAdj.get(source)?.has(target) ?? false;
  }

  getEdge(source: string, target: string): EdgeData | undefined {
    return this.outAdj.get(source)?.get(target);
  }

  outNeighbors(id: string): string[] {
    return [...(this.outAdj.get(id)?.keys() ?? [])];
  }

  inNeighbors(id: string): string[] {
    return [...(this.inAdj.get(id)?.keys() ?? [])];
  }

  neighbors(id: string): string[] {
    const set = new Set<string>(this.outNeighbors(id));
    for (const n of this.inNeighbors(id)) set.add(n);
    return [...set];
  }

  *outEdges(id: string): IterableIterator<OutEdge> {
    const adj = this.outAdj.get(id);
    if (!adj) return;
    for (const [target, data] of adj) {
      yield { target, data };
    }
  }

  *inEdges(id: string): IterableIterator<OutEdge> {
    const adj = this.inAdj.get(id);
    if (!adj) return;
    for (const [source, data] of adj) {
      yield { target: source, data };
    }
  }

  /**
   * Boundary cut cost: sum of edge weights crossing T → V\T (directed).
   *
   * This is the objective we minimize in the budget-constrained selection.
   * Lower = the selected region T is more self-contained.
   */
  cutCost(t: ReadonlySet<string>): number {
    if (t.size === 0 || t.size === this.nodeData.size) return 0;
    let cost = 0;
    for (const source of t) {
      const adj = this.outAdj.get(source);
      if (!adj) continue;
      for (const [target, data] of adj) {
        if (!t.has(target)) cost += data.weight;
      }
    }
    return cost;
  }

  /**
   * Sum of token costs over a node set.  Used by the budget-constrained selector.
   */
  tokensOf(t: Iterable<string>): number {
    let sum = 0;
    for (const id of t) {
      sum += this.nodeData.get(id)?.tokens ?? 0;
    }
    return sum;
  }
}
