import { pack, type PackResult } from '../../select/pack.js';
import { indexRepo } from '../../index/builder.js';
import type { SymbolGraph } from '../../core/graph.js';

/**
 * MCP tool handler — pure functions, no JSON-RPC transport.
 * The stdio server in index.ts is a thin wrapper around this.
 *
 * Tools exposed:
 *   - pack_context(task, repo, budget?, seeds?, include?, exclude?)
 *       → packs minimal context and returns JSON of files/ranges/explain
 *   - explain_selection()
 *       → returns the rationale for the most recent pack call
 *   - expand_node(node, depth?)
 *       → returns the graph neighborhood of a symbol id
 *   - list_tools()  (used in tests / for introspection)
 */

export interface McpCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface McpResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

interface SessionCache {
  lastResult?: PackResult;
  lastRepo?: string;
  lastGraph?: SymbolGraph;
}

const session: SessionCache = {};

export const TOOLS = [
  {
    name: 'pack_context',
    description:
      'Pack a token-minimal, structurally-relevant context window for the given coding task. ' +
      'Builds a symbol graph of the repo, runs personalized PageRank from task-derived seeds, ' +
      'and selects the minimum-cut subgraph that fits the token budget.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Natural-language task description.' },
        repo: { type: 'string', description: 'Absolute path to the repo root.' },
        budget: { type: 'number', description: 'Token budget. Default 4000.', default: 4000 },
        seeds: { type: 'number', description: 'Top-k seed symbols. Default 8.', default: 8 },
        include: {
          type: 'array',
          items: { type: 'string' },
          description: "Glob-prefix includes, e.g. ['src/auth/**'].",
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description: 'Extra ignore patterns appended to .gitignore.',
        },
        cache: {
          type: 'boolean',
          description: 'Use persistent parse cache at <repo>/.mincut-cache/ for fast repeat calls.',
          default: false,
        },
        cacheDir: {
          type: 'string',
          description: 'Override cache directory (absolute path). Only used when cache=true.',
        },
        communityBoost: {
          type: 'number',
          description: 'Louvain same-community boost factor. 0 disables, 0.5 default.',
          default: 0.5,
        },
      },
      required: ['task', 'repo'],
    },
  },
  {
    name: 'explain_selection',
    description: 'Return the rationale string for the most recent pack_context call.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'expand_node',
    description:
      'Return the graph neighborhood (in+out neighbors) of a symbol id from the most ' +
      'recent pack_context call.  Useful when the agent decides it needs more around a node.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Symbol id, e.g. "src/auth/login.ts:login".' },
        depth: { type: 'number', default: 1 },
      },
      required: ['node'],
    },
  },
];

export async function handleMcpCall(call: McpCall): Promise<McpResponse> {
  try {
    switch (call.name) {
      case 'list_tools':
        return ok({ tools: TOOLS });

      case 'pack_context':
        return await handlePack(call.arguments);

      case 'explain_selection':
        if (!session.lastResult) return error('no prior pack_context call in this session');
        return ok({
          explain: session.lastResult.explain,
          files: session.lastResult.files.map((f) => f.path),
        });

      case 'expand_node':
        return handleExpand(call.arguments);

      default:
        return error(`unknown tool: ${call.name}`);
    }
  } catch (e) {
    return error((e as Error).message);
  }
}

async function handlePack(args: Record<string, unknown>): Promise<McpResponse> {
  const task = stringArg(args, 'task');
  const repo = stringArg(args, 'repo');
  if (!task || !repo) return error('task and repo are required');
  const budget = (args.budget as number) ?? 4000;
  const seeds = (args.seeds as number) ?? 8;
  const include = args.include as string[] | undefined;
  const exclude = args.exclude as string[] | undefined;
  const cache = args.cache as boolean | undefined;
  const cacheDir = args.cacheDir as string | undefined;
  const communityBoost = args.communityBoost as number | undefined;

  const result = await pack({
    task,
    repo,
    budget,
    seeds,
    include,
    exclude,
    cache,
    cacheDir,
    communityBoost,
  });
  session.lastResult = result;
  session.lastRepo = repo;
  // Re-index so expand_node can use a fresh graph (shares cache if enabled).
  session.lastGraph = indexRepo(repo, { include, exclude, cache, cacheDir }).graph;
  return ok(result);
}

function handleExpand(args: Record<string, unknown>): McpResponse {
  if (!session.lastGraph) return error('call pack_context first');
  const node = stringArg(args, 'node');
  if (!node) return error('node is required');
  const graph = session.lastGraph;
  if (!graph.hasNode(node)) return error(`unknown node: ${node}`);
  const data = graph.getNode(node);
  const out = [...graph.outEdges(node)].map((e) => ({
    target: e.target,
    kind: e.data.kind,
    weight: e.data.weight,
  }));
  const incoming = [...graph.inEdges(node)].map((e) => ({
    source: e.target,
    kind: e.data.kind,
    weight: e.data.weight,
  }));
  return ok({ node, data, neighbors: [...out.map((o) => o.target), ...incoming.map((i) => i.source)], out, incoming });
}

function stringArg(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function ok(payload: unknown): McpResponse {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function error(msg: string): McpResponse {
  return { content: [{ type: 'text', text: `error: ${msg}` }], isError: true };
}

/** For tests — clear the session cache between cases. */
export function _resetSession(): void {
  session.lastResult = undefined;
  session.lastRepo = undefined;
  session.lastGraph = undefined;
}
