import Parser from 'tree-sitter';
import { createRequire } from 'node:module';
import {
  approxTokens,
  type ChunkOptions,
  type ParsedImport,
  type ParsedSymbol,
  type ParseResult,
} from './parser.js';
import { tryChunkBody } from './chunking.js';

const require_ = createRequire(import.meta.url);
const Php = require_('tree-sitter-php') as { php: unknown };

const phpParser = new Parser();
phpParser.setLanguage(Php.php);

export function parsePhp(
  file: string,
  source: string,
  chunkOptions?: ChunkOptions,
): ParseResult {
  let tree: Parser.Tree;
  try {
    tree = phpParser.parse(source);
  } catch {
    return { symbols: [], imports: [], calls: [] };
  }

  const ctx: PhpContext = {
    file,
    source,
    symbols: [],
    imports: [],
    calls: [],
    classStack: [],
    callerStack: [],
    chunkOptions,
  };
  visit(tree.rootNode, ctx);
  return { symbols: ctx.symbols, imports: ctx.imports, calls: ctx.calls };
}

interface PhpContext {
  file: string;
  source: string;
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  calls: { from: string; toName: string }[];
  classStack: string[];
  callerStack: string[];
  chunkOptions?: ChunkOptions;
}

function visit(node: Parser.SyntaxNode, ctx: PhpContext): void {
  switch (node.type) {
    case 'function_definition': {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        const body = node.childForFieldName('body');
        const chunked = tryChunkBody({
          file: ctx.file,
          source: ctx.source,
          qualifiedName: name,
          bareName: name,
          kind: 'function',
          body,
          chunkOptions: ctx.chunkOptions,
          callerStack: ctx.callerStack,
        });
        if (chunked) {
          ctx.symbols.push(...chunked.symbols);
          chunked.walkStatements((stmt) => visit(stmt, ctx));
          return;
        }
        const sym = mk(ctx, node, name, name, 'function');
        ctx.symbols.push(sym);
        ctx.callerStack.push(sym.id);
        if (body) visit(body, ctx);
        ctx.callerStack.pop();
        return;
      }
      break;
    }

    case 'class_declaration':
    case 'trait_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) break;
      ctx.symbols.push(mk(ctx, node, name, name, 'class'));
      ctx.classStack.push(name);
      const body = node.childForFieldName('body');
      if (body) visit(body, ctx);
      ctx.classStack.pop();
      return;
    }

    case 'interface_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) break;
      ctx.symbols.push(mk(ctx, node, name, name, 'interface'));
      return; // interface bodies are signatures only
    }

    case 'method_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) break;
      const cls = ctx.classStack[ctx.classStack.length - 1];
      const qualified = cls ? `${cls}.${name}` : name;
      const body = node.childForFieldName('body');
      const chunked = tryChunkBody({
        file: ctx.file,
        source: ctx.source,
        qualifiedName: qualified,
        bareName: name,
        kind: 'method',
        body,
        chunkOptions: ctx.chunkOptions,
        callerStack: ctx.callerStack,
      });
      if (chunked) {
        ctx.symbols.push(...chunked.symbols);
        chunked.walkStatements((stmt) => visit(stmt, ctx));
        return;
      }
      const sym = mk(ctx, node, name, qualified, 'method');
      ctx.symbols.push(sym);
      ctx.callerStack.push(sym.id);
      if (body) visit(body, ctx);
      ctx.callerStack.pop();
      return;
    }

    case 'namespace_use_declaration': {
      collectUses(node, ctx);
      return;
    }

    case 'function_call_expression':
    case 'member_call_expression':
    case 'scoped_call_expression': {
      const name = callTargetName(node);
      if (name && ctx.callerStack.length > 0) {
        ctx.calls.push({
          from: ctx.callerStack[ctx.callerStack.length - 1],
          toName: name,
        });
      }
      visitChildren(node, ctx);
      return;
    }
  }
  visitChildren(node, ctx);
}

function visitChildren(node: Parser.SyntaxNode, ctx: PhpContext): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c) visit(c, ctx);
  }
}

function mk(
  ctx: PhpContext,
  node: Parser.SyntaxNode,
  bare: string,
  qualified: string,
  kind: ParsedSymbol['kind'],
): ParsedSymbol {
  const text = ctx.source.slice(node.startIndex, node.endIndex);
  return {
    id: `${ctx.file}:${qualified}`,
    name: bare,
    file: ctx.file,
    kind,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    tokens: approxTokens(text),
  };
}

function callTargetName(node: Parser.SyntaxNode): string | null {
  // function_call_expression:   function: <expr>
  // member_call_expression:     name: <name>
  // scoped_call_expression:     name: <name>
  if (node.type === 'function_call_expression') {
    const fn = node.childForFieldName('function');
    if (!fn) return null;
    if (fn.type === 'name' || fn.type === 'qualified_name') return fn.text.split('\\').pop() ?? null;
    return null;
  }
  const nameNode = node.childForFieldName('name');
  if (nameNode) return nameNode.text;
  return null;
}

function collectUses(node: Parser.SyntaxNode, ctx: PhpContext): void {
  // `use App\Foo;`  / `use App\Foo as Bar;`
  // `use App\{Foo, Bar as B, Baz};` (group)
  // Walk children, find namespace_use_clause and namespace_use_group nodes.
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    if (c.type === 'namespace_use_clause') {
      pushUseClause(c, '', ctx);
    } else if (c.type === 'namespace_use_group') {
      // Prefix is the first qualified_name before `{` — tree-sitter exposes it
      // as a child node of type `namespace_name` or `qualified_name`.
      let prefix = '';
      for (let j = 0; j < c.namedChildCount; j++) {
        const sub = c.namedChild(j);
        if (!sub) continue;
        if (sub.type === 'namespace_name' || sub.type === 'qualified_name') {
          prefix = sub.text + '\\';
        } else if (sub.type === 'namespace_use_clause' || sub.type === 'namespace_use_group_clause') {
          pushUseClause(sub, prefix, ctx);
        }
      }
    }
  }
}

function pushUseClause(node: Parser.SyntaxNode, prefix: string, ctx: PhpContext): void {
  // tree-sitter-php field names vary slightly between versions; do a tolerant
  // walk: collect the first dotted/qualified name and an optional alias.
  let source = '';
  let alias: string | undefined;
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (!c) continue;
    if (c.type === 'qualified_name' || c.type === 'namespace_name' || c.type === 'name') {
      if (!source) source = c.text;
      else alias = c.text; // a second name child is the alias
    }
  }
  if (!source) return;
  const full = prefix + source;
  const bare = full.split('\\').pop() ?? source;
  ctx.imports.push({ source: full, names: [alias ?? bare], namespace: alias });
}
