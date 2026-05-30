# Frontier-as-Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the min-cut's outbound dependency frontier as type-aware signature stubs (an opt-in `contract` on `pack()`), and measure on the existing 28-task eval whether those stubs recover dropped correct-file coverage at a fraction of the full-file token cost.

**Architecture:** A new `src/select/contract.ts` computes the frontier (selected nodes' outbound type-edges, minus selected) and emits one stub per frontier symbol. Signature text is produced by re-parsing only the frontier files with an opt-in `signatures` flag added to the existing parsers — the index/cache hot path never sets the flag, so it is untouched. A new eval strategy `mincut-contract` and a `boundaryCoverage` metric run the A/B.

**Tech Stack:** TypeScript (ESM, NodeNext), tree-sitter parsers, Vitest. Commands: `npm test`, `npm run typecheck`, `npm run eval`.

**Sequencing note:** Tasks 1–7 are a complete TypeScript-only vertical slice — parser → contract → pack → eval — sufficient to test the hypothesis on the TS self-repo fixtures. Tasks 8–10 extend signature extraction to Python/PHP/Vue for the cross-repo eval. Stop after Task 7 if the hypothesis result is the only goal.

**Key shared types (defined in Task 1, referenced everywhere):**

```ts
// src/parsers/parser.ts
export interface ParseOptions { signatures?: boolean }
// ParsedSymbol gains:  signature?: string

// src/select/contract.ts
export interface ContractStub {
  id: string; file: string; kind: NodeKind; name: string;
  signature: string; tokens: number; via: string[];
}
export interface Contract { stubs: ContractStub[]; tokens: number; files: string[]; }
export interface ContractOptions { maxTokens?: number }
```

---

### Task 1: Shared signature slicer + ParseOptions plumbing

**Files:**
- Modify: `src/parsers/parser.ts` (add `ParseOptions`, `signature?` field, `sliceSignature` helper)
- Test: `tests/parsers/signature-slicer.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/parsers/signature-slicer.test.ts
import { describe, it, expect } from 'vitest';
import { sliceSignature } from '../../src/parsers/parser.js';

describe('sliceSignature', () => {
  const src =
    'export function add(a: number, b: number): number {\n  return a + b;\n}\n';

  it('keeps a function header and elides the body', () => {
    const node = { startIndex: 0, endIndex: src.length };
    const body = { startIndex: src.indexOf('{') };
    const sig = sliceSignature(src, node, body, 'function');
    expect(sig).toBe('export function add(a: number, b: number): number { /* … */ }');
    expect(sig).not.toContain('return a + b');
  });

  it('returns the full text for interfaces (they are the contract)', () => {
    const i = 'interface User { id: string; name: string }';
    const node = { startIndex: 0, endIndex: i.length };
    expect(sliceSignature(i, node, null, 'interface')).toBe(i);
  });

  it('returns only the first line for a variable with no body', () => {
    const v = 'export const TIMEOUT = 5000;\nconst other = 1;';
    const node = { startIndex: 0, endIndex: v.length };
    expect(sliceSignature(v, node, null, 'variable')).toBe('export const TIMEOUT = 5000;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parsers/signature-slicer.test.ts`
Expected: FAIL — `sliceSignature is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/parsers/parser.ts` (after `approxTokens`):

```ts
export interface ParseOptions {
  /** When true, parsers populate ParsedSymbol.signature (used by the contract path). */
  signatures?: boolean;
}

/** A minimal node span — matches tree-sitter SyntaxNode without importing it. */
interface SpanLike { startIndex: number; endIndex: number }

/**
 * Produce a body-free signature stub for a symbol.
 *   - interface/type : full text (it IS the contract)
 *   - has a body node : text from node start up to body start, body elided
 *   - otherwise       : first source line only (variable / export)
 */
export function sliceSignature(
  source: string,
  node: SpanLike,
  body: SpanLike | null,
  kind: NodeKind,
): string {
  if (kind === 'interface' || kind === 'type') {
    return source.slice(node.startIndex, node.endIndex).trim();
  }
  if (body) {
    const head = source.slice(node.startIndex, body.startIndex).trimEnd();
    return `${head} { /* … */ }`;
  }
  const text = source.slice(node.startIndex, node.endIndex);
  const nl = text.indexOf('\n');
  return (nl === -1 ? text : text.slice(0, nl)).trim();
}
```

Also add the optional field to `ParsedSymbol` (in the existing interface):

```ts
  /** Body-free signature stub. Populated only when parsed with { signatures: true }. */
  signature?: string;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parsers/signature-slicer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/parsers/parser.ts tests/parsers/signature-slicer.test.ts
git commit -m "feat(parser): add sliceSignature helper + ParseOptions plumbing"
```

---

### Task 2: TS parser emits signatures when opted in

**Files:**
- Modify: `src/parsers/ts.ts` (thread `ParseOptions` into the visitor; set `signature` in `makeSymbol`)
- Test: `tests/parsers/ts-signatures.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/parsers/ts-signatures.test.ts
import { describe, it, expect } from 'vitest';
import { parseTypeScript } from '../../src/parsers/ts.js';

const SRC = `
export function login(user: string, pass: string): boolean {
  return user === pass;
}
export interface Session { id: string; user: string }
export class Auth {
  check(token: string): boolean { return token.length > 0; }
}
`;

describe('parseTypeScript signatures', () => {
  it('omits signature by default', () => {
    const { symbols } = parseTypeScript('a.ts', SRC);
    expect(symbols.every((s) => s.signature === undefined)).toBe(true);
  });

  it('emits body-free signatures when opted in', () => {
    const { symbols } = parseTypeScript('a.ts', SRC, undefined, { signatures: true });
    const login = symbols.find((s) => s.name === 'login');
    expect(login?.signature).toContain('login(user: string, pass: string): boolean');
    expect(login?.signature).not.toContain('return user === pass');

    const session = symbols.find((s) => s.name === 'Session');
    expect(session?.signature).toContain('id: string');

    const auth = symbols.find((s) => s.name === 'Auth');
    expect(auth?.signature).toContain('class Auth');
    expect(auth?.signature).not.toContain('return token.length');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parsers/ts-signatures.test.ts`
Expected: FAIL — `parseTypeScript` takes 3 args / `signature` is undefined when opted in.

- [ ] **Step 3: Write minimal implementation**

In `src/parsers/ts.ts`:

1. Add the 4th param and pass through into `VisitorContext`:

```ts
import { approxTokens, sliceSignature, type ChunkOptions, type ParseOptions,
  type ParsedCall, type ParsedImport, type ParsedSymbol, type ParseResult } from './parser.js';

export function parseTypeScript(
  file: string,
  source: string,
  chunkOptions?: ChunkOptions,
  parseOptions?: ParseOptions,
): ParseResult {
  // ...existing parser selection + try/catch...
  visit(tree.rootNode, {
    file, source, symbols, imports, calls,
    classStack: [], callerStack: [], inTypeContext: false,
    chunkOptions,
    signatures: parseOptions?.signatures ?? false,
  });
  return { symbols, imports, calls };
}
```

2. Add `signatures: boolean;` to the `VisitorContext` interface.

3. In `makeSymbol`, accept the defining node's body and set the signature when enabled. Change its signature and body:

```ts
function makeSymbol(
  ctx: VisitorContext,
  node: Parser.SyntaxNode,
  bareName: string,
  qualifiedName: string,
  kind: ParsedSymbol['kind'],
): ParsedSymbol {
  const text = ctx.source.slice(node.startIndex, node.endIndex);
  const sym: ParsedSymbol = {
    id: `${ctx.file}:${qualifiedName}`,
    name: bareName,
    file: ctx.file,
    kind,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    tokens: approxTokens(text),
  };
  if (ctx.signatures) {
    const body = node.childForFieldName('body');
    sym.signature = sliceSignature(ctx.source, node, body, kind);
  }
  return sym;
}
```

(`childForFieldName('body')` returns `null` for interfaces/type aliases/variables, which `sliceSignature` handles.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parsers/ts-signatures.test.ts`
Expected: PASS (2 tests). Also run `npx vitest run tests/parsers/` to confirm no regression.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/parsers/ts.ts tests/parsers/ts-signatures.test.ts
git commit -m "feat(ts): emit body-free signatures under { signatures: true }"
```

---

### Task 3: buildContract — frontier scoping + stub assembly

**Files:**
- Create: `src/select/contract.ts`
- Test: `tests/select/contract.test.ts` (create)

- [ ] **Step 1: Write the failing test** (hand-built graph; no parsing)

```ts
// tests/select/contract.test.ts
import { describe, it, expect } from 'vitest';
import { SymbolGraph } from '../../src/core/graph.js';
import { buildFrontier } from '../../src/select/contract.js';

function g(): SymbolGraph {
  const graph = new SymbolGraph();
  const n = (id: string, kind: any) =>
    graph.addNode(id, { tokens: 10, file: id.split(':')[0], kind });
  n('a.ts:foo', 'function');     // selected
  n('a.ts:bar', 'function');     // selected
  n('b.ts:dep', 'function');     // frontier (called by foo)
  n('b.ts:Type', 'interface');   // frontier (referenced by bar)
  n('c.ts:caller', 'function');  // inbound — must NOT appear
  n('a.ts', 'file');             // contains target — must NOT appear
  graph.addEdge('a.ts:foo', 'b.ts:dep', { weight: 1, kind: 'call' });
  graph.addEdge('a.ts:bar', 'b.ts:Type', { weight: 1, kind: 'reference' });
  graph.addEdge('c.ts:caller', 'a.ts:foo', { weight: 1, kind: 'call' });
  graph.addEdge('a.ts', 'a.ts:foo', { weight: 1, kind: 'contains' });
  return graph;
}

describe('buildFrontier', () => {
  const selected = new Set(['a.ts:foo', 'a.ts:bar']);

  it('includes outbound call/reference targets, with via attribution', () => {
    const f = buildFrontier(g(), selected);
    const ids = f.map((x) => x.id).sort();
    expect(ids).toEqual(['b.ts:Type', 'b.ts:dep']);
    expect(f.find((x) => x.id === 'b.ts:dep')!.via).toEqual(['a.ts:foo']);
  });

  it('excludes inbound callers and contains targets', () => {
    const ids = buildFrontier(g(), selected).map((x) => x.id);
    expect(ids).not.toContain('c.ts:caller');
    expect(ids).not.toContain('a.ts');
  });

  it('excludes already-selected nodes', () => {
    const sel = new Set(['a.ts:foo', 'a.ts:bar', 'b.ts:dep']);
    const ids = buildFrontier(g(), sel).map((x) => x.id);
    expect(ids).not.toContain('b.ts:dep');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/select/contract.test.ts`
Expected: FAIL — cannot find module `contract.js` / `buildFrontier` undefined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/select/contract.ts
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
      (via.get(e.target) ?? via.set(e.target, new Set()).get(e.target)!).add(src);
    }
  }
  return [...via.entries()]
    .map(([id, set]) => ({ id, via: [...set].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/select/contract.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/select/contract.ts tests/select/contract.test.ts
git commit -m "feat(contract): frontier scoping (outbound type-edges, via attribution)"
```

---

### Task 4: buildContract — assemble stubs from re-parsed frontier files

**Files:**
- Modify: `src/select/contract.ts` (add `buildContract`)
- Test: `tests/select/contract.test.ts` (extend)

- [ ] **Step 1: Write the failing test** (append to the existing file)

```ts
import { buildContract } from '../../src/select/contract.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexRepo } from '../../src/index/builder.js';

describe('buildContract', () => {
  it('emits body-free stubs for frontier symbols, summing tokens', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcx-contract-'));
    writeFileSync(join(dir, 'dep.ts'),
      'export function dep(x: number): number {\n  return x * 2;\n}\n');
    writeFileSync(join(dir, 'main.ts'),
      "import { dep } from './dep.js';\nexport function main(): number {\n  return dep(21);\n}\n");

    const { graph } = indexRepo(dir);
    const selected = new Set(graph.nodes().filter((id) => id.startsWith('main.ts:')));
    // sanity: main is selected, dep is not
    expect([...selected].some((id) => id.endsWith(':main'))).toBe(true);

    const contract = buildContract(graph, selected, dir);
    const depStub = contract.stubs.find((s) => s.id.endsWith(':dep'));
    expect(depStub).toBeDefined();
    expect(depStub!.signature).toContain('dep(x: number): number');
    expect(depStub!.signature).not.toContain('return x * 2');
    expect(contract.tokens).toBe(contract.stubs.reduce((n, s) => n + s.tokens, 0));
    expect(contract.files).toContain('dep.ts');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/select/contract.test.ts`
Expected: FAIL — `buildContract` undefined.

- [ ] **Step 3: Write minimal implementation** (append to `src/select/contract.ts`)

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approxTokens } from '../parsers/parser.js';
import { parseTypeScript } from '../parsers/ts.js';
import { parsePython } from '../parsers/py.js';
import { parsePhp } from '../parsers/php.js';
import { parseVueSfc } from '../parsers/vue.js';
import type { ParsedSymbol } from '../parsers/parser.js';

const TS_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function parseWithSignatures(file: string, source: string): ParsedSymbol[] {
  const ext = file.slice(file.lastIndexOf('.'));
  const opts = { signatures: true } as const;
  if (TS_EXT.has(ext)) return parseTypeScript(file, source, undefined, opts).symbols;
  if (ext === '.py' || ext === '.pyi') return parsePython(file, source, undefined, opts).symbols;
  if (ext === '.php') return parsePhp(file, source, undefined, opts).symbols;
  if (ext === '.vue') return parseVueSfc(file, source, undefined, opts).symbols;
  return [];
}

export function buildContract(
  graph: SymbolGraph,
  selected: ReadonlySet<string>,
  repo: string,
  options: ContractOptions = {},
): Contract {
  const frontier = buildFrontier(graph, selected);

  // Group wanted symbol ids by file so each file is parsed at most once.
  const wantByFile = new Map<string, FrontierEntry[]>();
  for (const entry of frontier) {
    const file = graph.getNode(entry.id)!.file;
    (wantByFile.get(file) ?? wantByFile.set(file, []).get(file)!).push(entry);
  }

  const stubs: ContractStub[] = [];
  for (const [file, wanted] of wantByFile) {
    let symbols: ParsedSymbol[];
    try {
      symbols = parseWithSignatures(file, readFileSync(join(repo, file), 'utf8'));
    } catch {
      continue; // unreadable / unparseable frontier file — skip silently
    }
    const byId = new Map(symbols.map((s) => [s.id, s]));
    for (const entry of wanted) {
      const sym = byId.get(entry.id);
      const node = graph.getNode(entry.id)!;
      if (!sym?.signature) continue;
      stubs.push({
        id: entry.id,
        file,
        kind: node.kind,
        name: node.name ?? entry.id,
        signature: sym.signature,
        tokens: approxTokens(sym.signature),
        via: entry.via,
      });
    }
  }

  // Optional budget cap: keep the most-referenced stubs first.
  stubs.sort((a, b) => b.via.length - a.via.length || a.id.localeCompare(b.id));
  let kept = stubs;
  if (options.maxTokens && options.maxTokens > 0) {
    kept = [];
    let total = 0;
    for (const s of stubs) {
      if (total + s.tokens > options.maxTokens) continue;
      kept.push(s);
      total += s.tokens;
    }
  }
  kept.sort((a, b) => a.id.localeCompare(b.id)); // stable, deterministic output

  return {
    stubs: kept,
    tokens: kept.reduce((n, s) => n + s.tokens, 0),
    files: [...new Set(kept.map((s) => s.file))].sort(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/select/contract.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/select/contract.ts tests/select/contract.test.ts
git commit -m "feat(contract): assemble body-free stubs by re-parsing frontier files"
```

---

### Task 5: Wire contract into pack()

**Files:**
- Modify: `src/select/pack.ts` (add `contract?` option + `PackResult.contract`)
- Modify: `src/adapters/lib/index.ts` (re-export contract types)
- Test: `tests/select/pack-contract.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/select/pack-contract.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pack } from '../../src/select/pack.js';

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mcx-pack-contract-'));
  writeFileSync(join(dir, 'validate.ts'),
    'export function validateLogin(u: string, p: string): boolean {\n  return u.length > 0 && p.length > 0;\n}\n');
  writeFileSync(join(dir, 'login.ts'),
    "import { validateLogin } from './validate.js';\nexport function login(u: string, p: string) {\n  if (!validateLogin(u, p)) throw new Error('bad');\n  return true;\n}\n");
  return dir;
}

describe('pack({ contract: true })', () => {
  it('omits contract by default', async () => {
    const r = await pack({ task: 'login validation', repo: fixture(), budget: 60 });
    expect(r.contract).toBeUndefined();
  });

  it('returns a contract whose files are not double-counted in pack tokens', async () => {
    const repo = fixture();
    const r = await pack({ task: 'login validation', repo, budget: 60, contract: true });
    expect(r.contract).toBeDefined();
    // contract tokens are reported separately from the selected-region tokens
    expect(typeof r.contract!.tokens).toBe('number');
    expect(r.contract!.tokens).toBe(
      r.contract!.stubs.reduce((n, s) => n + s.tokens, 0),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/select/pack-contract.test.ts`
Expected: FAIL — `contract` not accepted / always undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/select/pack.ts`:

1. Import and extend types at the top:

```ts
import { buildContract, type Contract, type ContractOptions } from './contract.js';
export type { Contract, ContractStub, ContractOptions } from './contract.js';
```

2. Add to `PackOptions`:

```ts
  /**
   * Emit a typed-handoff contract: body-free signature stubs for the selected
   * region's outbound dependency frontier. `true` = uncapped; pass
   * `{ maxTokens }` to bound it. Default off.
   */
  contract?: boolean | ContractOptions;
```

3. Add to `PackResult`:

```ts
  /** Present only when options.contract was set. */
  contract?: Contract;
```

4. Destructure `contract` in the options block (`const { ..., contract } = options;`).

5. Just before the final `return { ... }`, compute it:

```ts
  let contractResult: Contract | undefined;
  if (contract) {
    const contractOpts: ContractOptions = contract === true ? {} : contract;
    contractResult = buildContract(graph, selection.selected, repo, contractOpts);
  }
```

6. Add `contract: contractResult,` to the returned object.

(Note: `selection.selected` is the full selected set, computed before file-trimming — the frontier is a property of the selected region, independent of low-score file trimming. This is intentional.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/select/pack-contract.test.ts`
Expected: PASS (2 tests). Run `npm test` to confirm no regressions across the suite.

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/select/pack.ts src/adapters/lib/index.ts tests/select/pack-contract.test.ts
git commit -m "feat(pack): opt-in typed-handoff contract on PackResult"
```

---

### Task 6: boundaryCoverage eval metric

**Files:**
- Create: `eval/boundary.ts`
- Test: `tests/eval/boundary.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/eval/boundary.test.ts
import { describe, it, expect } from 'vitest';
import { computeBoundary } from '../../eval/boundary.js';

describe('computeBoundary', () => {
  const correct = ['a.ts', 'b.ts', 'c.ts'];

  it('coverage counts correct files reachable via selection OR contract stub', () => {
    const r = computeBoundary({
      selectedFiles: ['a.ts'],
      contractFiles: ['b.ts'],
      selectedTokens: 1000,
      contractTokens: 80,
      correct,
    });
    expect(r.recall).toBeCloseTo(1 / 3);            // full-body only
    expect(r.boundaryCoverage).toBeCloseTo(2 / 3);  // + signature stub
    // marginal correct-files recovered per 1k contract tokens
    expect(r.recoveredPerKToken).toBeCloseTo(((2 / 3) - (1 / 3)) / (80 / 1000));
  });

  it('recoveredPerKToken is 0 when no contract tokens were spent', () => {
    const r = computeBoundary({
      selectedFiles: ['a.ts'], contractFiles: [],
      selectedTokens: 1000, contractTokens: 0, correct,
    });
    expect(r.recoveredPerKToken).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/eval/boundary.test.ts`
Expected: FAIL — cannot find `eval/boundary.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// eval/boundary.ts
export interface BoundaryInput {
  selectedFiles: string[];
  contractFiles: string[];
  selectedTokens: number;
  contractTokens: number;
  correct: string[];
}

export interface BoundaryResult {
  /** Full-body file recall (selection only). */
  recall: number;
  /** Signature-level coverage: correct files reachable via selection OR a stub. NOT full recall. */
  boundaryCoverage: number;
  /** Marginal correct files recovered by the contract, per 1000 contract tokens. */
  recoveredPerKToken: number;
  contractTokens: number;
}

export function computeBoundary(input: BoundaryInput): BoundaryResult {
  const correct = new Set(input.correct);
  const total = correct.size || 1;
  const sel = new Set(input.selectedFiles);
  const covered = new Set([...input.selectedFiles, ...input.contractFiles]);

  let recallHits = 0;
  let coverHits = 0;
  for (const c of correct) {
    if (sel.has(c)) recallHits += 1;
    if (covered.has(c)) coverHits += 1;
  }
  const recall = recallHits / total;
  const boundaryCoverage = coverHits / total;
  const recoveredPerKToken =
    input.contractTokens > 0 ? (boundaryCoverage - recall) / (input.contractTokens / 1000) : 0;

  return { recall, boundaryCoverage, recoveredPerKToken, contractTokens: input.contractTokens };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/eval/boundary.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add eval/boundary.ts tests/eval/boundary.test.ts
git commit -m "feat(eval): boundaryCoverage metric (signature-level, separate from recall)"
```

---

### Task 7: `mincut-contract` eval strategy + A/B report

**Files:**
- Modify: `eval/runner.ts` (add the strategy; emit the A/B block)
- Manual run (no unit test — it's a reporting script)

- [ ] **Step 1: Add the strategy to the runner**

In `eval/runner.ts`, extend `STRATEGIES`:

```ts
const STRATEGIES = ['mincut', 'mincut-embed', 'mincut-contract', 'grep', 'random'] as const;
```

In the per-task strategy switch (where `mincut` calls `pack`), add a branch. The
`mincut-contract` retrieval treats selected files **plus** contract files as
"retrieved", and reports contract tokens separately for the boundary metric:

```ts
import { computeBoundary } from './boundary.js';

// inside the task loop, alongside the existing mincut branch:
if (strategy === 'mincut-contract') {
  const r = await pack({ task: t.task, repo, budget, exclude, contract: true });
  const selectedFiles = r.files.map((f) => f.path);
  const contractFiles = r.contract?.files ?? [];
  const boundary = computeBoundary({
    selectedFiles,
    contractFiles,
    selectedTokens: r.tokens,
    contractTokens: r.contract?.tokens ?? 0,
    correct: t.correct,
  });
  retrieval = { files: [...selectedFiles, ...contractFiles], tokens: r.tokens + (r.contract?.tokens ?? 0) };
  boundaryByTask.push({ taskId: t.id, ...boundary });
}
```

(Declare `const boundaryByTask: Array<{ taskId: string } & ReturnType<typeof computeBoundary>> = [];` near the other accumulators.)

- [ ] **Step 2: Emit the A/B block in the Markdown report**

After the existing per-strategy tables are written, append a boundary section.
Average the per-task numbers:

```ts
function avg(ns: number[]): number { return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0; }

const aggRecall = avg(boundaryByTask.map((b) => b.recall));
const aggCoverage = avg(boundaryByTask.map((b) => b.boundaryCoverage));
const aggContractTokens = avg(boundaryByTask.map((b) => b.contractTokens));
const aggRecovered = avg(boundaryByTask.map((b) => b.recoveredPerKToken));

const lines = [
  '',
  '## Frontier-contract A/B (signature-level coverage)',
  '',
  '| metric | value |',
  '|---|---|',
  `| cut-only file recall | ${(aggRecall * 100).toFixed(1)}% |`,
  `| cut+contract boundary coverage | ${(aggCoverage * 100).toFixed(1)}% |`,
  `| avg contract tokens / task | ${aggContractTokens.toFixed(0)} |`,
  `| correct files recovered per 1k contract tokens | ${aggRecovered.toFixed(3)} |`,
  '',
  '> Boundary coverage is signature-level: a file recovered via a stub is reachable, not fully present.',
  '',
].join('\n');
// append `lines` to the report string that gets written to eval/results.md
```

- [ ] **Step 3: Run the eval and capture numbers**

Run: `npm run build && npm run eval`
Expected: `eval/results.md` now contains the "Frontier-contract A/B" section with four populated numbers. Read them — the headline is *correct files recovered per 1k contract tokens*. A flat or negative number is a valid, reportable result (means dropped correct files are mostly not in the outbound frontier).

- [ ] **Step 4: Commit**

```bash
git add eval/runner.ts eval/results.md
git commit -m "feat(eval): mincut-contract strategy + frontier-contract A/B report"
```

---

### Task 8: Python parser signatures

**Files:**
- Modify: `src/parsers/py.ts` (4th `ParseOptions` param; set `signature` in its symbol factory)
- Test: `tests/parsers/py-signatures.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/parsers/py-signatures.test.ts
import { describe, it, expect } from 'vitest';
import { parsePython } from '../../src/parsers/py.js';

const SRC = `
def login(user, password):
    return user == password

class Auth:
    def check(self, token):
        return len(token) > 0
`;

describe('parsePython signatures', () => {
  it('emits body-free signatures when opted in', () => {
    const { symbols } = parsePython('a.py', SRC, undefined, { signatures: true });
    const login = symbols.find((s) => s.name === 'login');
    expect(login?.signature).toContain('def login(user, password)');
    expect(login?.signature).not.toContain('return user == password');
    const auth = symbols.find((s) => s.name === 'Auth');
    expect(auth?.signature).toContain('class Auth');
  });

  it('omits signature by default', () => {
    const { symbols } = parsePython('a.py', SRC);
    expect(symbols.every((s) => s.signature === undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parsers/py-signatures.test.ts`
Expected: FAIL — `parsePython` takes 3 args / signature undefined.

- [ ] **Step 3: Write minimal implementation**

Mirror Task 2 in `src/parsers/py.ts`:
1. Add `parseOptions?: ParseOptions` as the 4th param; import `sliceSignature, type ParseOptions` from `./parser.js`.
2. Thread `signatures: parseOptions?.signatures ?? false` into the visitor context (add the field to its context interface).
3. In the function/method/class symbol factory, after building the symbol object:

```ts
if (ctx.signatures) {
  const body = node.childForFieldName('body');
  sym.signature = sliceSignature(ctx.source, node, body, kind);
}
```

Python `function_definition`/`class_definition` both expose a `body` field (confirmed at `py.ts:64` and `py.ts:101`), so the slicer's "text up to body start" rule yields `def login(user, password):` / `class Auth:`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parsers/py-signatures.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/parsers/py.ts tests/parsers/py-signatures.test.ts
git commit -m "feat(py): emit body-free signatures under { signatures: true }"
```

---

### Task 9: PHP parser signatures

**Files:**
- Modify: `src/parsers/php.ts` (4th `ParseOptions` param; set `signature`)
- Test: `tests/parsers/php-signatures.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/parsers/php-signatures.test.ts
import { describe, it, expect } from 'vitest';
import { parsePhp } from '../../src/parsers/php.js';

const SRC = `<?php
function login($user, $pass) {
    return $user === $pass;
}
class Auth {
    public function check($token) { return strlen($token) > 0; }
}
`;

describe('parsePhp signatures', () => {
  it('emits body-free signatures when opted in', () => {
    const { symbols } = parsePhp('a.php', SRC, undefined, { signatures: true });
    const login = symbols.find((s) => s.name === 'login');
    expect(login?.signature).toContain('function login($user, $pass)');
    expect(login?.signature).not.toContain('return $user === $pass');
  });

  it('omits signature by default', () => {
    const { symbols } = parsePhp('a.php', SRC);
    expect(symbols.every((s) => s.signature === undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parsers/php-signatures.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Mirror Task 2 in `src/parsers/php.ts`. `function_definition`, `method_declaration`, `class_declaration`, `trait_declaration` all expose a `body` field (confirmed at `php.ts:60/92/110`). `interface_declaration` has a body too, but since it is emitted with `kind: 'interface'`/(structure) — pass its `kind` so the slicer returns the full text for interfaces. Add the same `if (ctx.signatures) { ... }` block after the symbol factory builds each symbol.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parsers/php-signatures.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add src/parsers/php.ts tests/parsers/php-signatures.test.ts
git commit -m "feat(php): emit body-free signatures under { signatures: true }"
```

---

### Task 10: Vue parser signatures + full cross-repo eval

**Files:**
- Modify: `src/parsers/vue.ts` (4th `ParseOptions` param; delegate to the TS path with signatures on)
- Test: `tests/parsers/vue-signatures.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/parsers/vue-signatures.test.ts
import { describe, it, expect } from 'vitest';
import { parseVueSfc } from '../../src/parsers/vue.js';

const SRC = `<script setup lang="ts">
export function useAuth(token: string): boolean {
  return token.length > 0;
}
</script>
<template><div /></template>
`;

describe('parseVueSfc signatures', () => {
  it('emits body-free signatures from the <script> block when opted in', () => {
    const { symbols } = parseVueSfc('a.vue', SRC, undefined, { signatures: true });
    const useAuth = symbols.find((s) => s.name === 'useAuth');
    expect(useAuth?.signature).toContain('useAuth(token: string): boolean');
    expect(useAuth?.signature).not.toContain('return token.length');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parsers/vue-signatures.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/parsers/vue.ts` extracts the `<script>` block and delegates to the TS
parser. Add the 4th `parseOptions?: ParseOptions` param and forward it to the
`parseTypeScript(...)` call it already makes (passing `parseOptions` as the 4th
arg). No new extraction logic — it inherits Task 2's behavior. Verify by reading
`src/parsers/vue.ts` to find the exact `parseTypeScript` call site and thread the
param through.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parsers/vue-signatures.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite + cross-repo eval, then commit**

```bash
npm test
npm run typecheck
npm run build
npm run eval   # now exercises contract stubs across TS/PY/PHP/Vue frontier files
git add src/parsers/vue.ts tests/parsers/vue-signatures.test.ts eval/results.md
git commit -m "feat(vue): forward signatures option; run full cross-repo contract eval"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| Architecture: contract module + opt-in parser flag | 1, 2, 3, 4, 5 |
| Data shapes (ContractStub / Contract / ContractOptions) | 3, 4 |
| Frontier scoping (outbound type-edges, exclude contains/inbound/file) | 3 |
| Type-aware stub rules (fn/interface/type/class/var) | 1 (slicer), 2/8/9/10 (per-language) |
| `maxTokens` cap (rank by reference count) | 4 |
| Eval boundaryCoverage metric (separate from recall) | 6 |
| `mincut-contract` strategy + A/B report + honesty labelling | 7 |
| Testing: per-language extraction, buildContract, integration, eval | 2/8/9/10, 3/4, 5, 7 |

No spec requirement is left without a task.

**2. Placeholder scan**

The only "read the file to find the exact call site" instructions are in Tasks 9 and 10, where the change mirrors the fully-shown Task 2 block and the local node-type detail can't be quoted without the file open. The pattern and the exact code block to insert are given; this is guidance, not a placeholder. No "TODO/TBD/handle edge cases" left.

**3. Type consistency**

`sliceSignature(source, node, body, kind)`, `ParseOptions { signatures? }`, `ParsedSymbol.signature?`, `buildFrontier(graph, selected) → FrontierEntry[]`, `buildContract(graph, selected, repo, options) → Contract`, `ContractStub`/`Contract`/`ContractOptions`, `computeBoundary(BoundaryInput) → BoundaryResult` — names and signatures are consistent across every task that references them. `pack` option is `contract?: boolean | ContractOptions`; runner passes `contract: true`.

**Deviation from spec §4 (flagged):** class stubs in this plan are `class X extends Y { /* … */ }` (header only), not header + public member signatures. Rationale: the headline boundary-coverage metric is file-level and insensitive to stub richness, so member-signature enrichment is deferred as a fidelity follow-up that does not change the eval. If you want full §4 fidelity in the prototype, add a task to recurse class bodies and slice each member up to its own body — say the word and I'll insert it.
