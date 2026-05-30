import Parser from 'tree-sitter';
import { createRequire } from 'node:module';
import {
  approxTokens,
  sliceSignature,
  type ChunkOptions,
  type ParseOptions,
  type ParsedImport,
  type ParsedSymbol,
  type ParseResult,
} from './parser.js';
import { tryChunkBody } from './chunking.js';

const require_ = createRequire(import.meta.url);
const Python = require_('tree-sitter-python');

const pyParser = new Parser();
pyParser.setLanguage(Python);

export function parsePython(
  file: string,
  source: string,
  chunkOptions?: ChunkOptions,
  parseOptions?: ParseOptions,
): ParseResult {
  let tree: Parser.Tree;
  try {
    tree = pyParser.parse(source);
  } catch {
    return { symbols: [], imports: [], calls: [] };
  }

  const ctx: PyContext = {
    file,
    source,
    symbols: [],
    imports: [],
    calls: [],
    classStack: [],
    callerStack: [],
    chunkOptions,
    signatures: parseOptions?.signatures ?? false,
  };
  visit(tree.rootNode, ctx);
  return { symbols: ctx.symbols, imports: ctx.imports, calls: ctx.calls };
}

interface PyContext {
  file: string;
  source: string;
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  calls: { from: string; toName: string }[];
  classStack: string[];
  callerStack: string[];
  chunkOptions?: ChunkOptions;
  signatures: boolean;
}

function visit(node: Parser.SyntaxNode, ctx: PyContext): void {
  switch (node.type) {
    case 'function_definition': {
      const nameNode = node.childForFieldName('name');
      if (!nameNode) return visitChildren(node, ctx);
      const bareName = nameNode.text;
      const cls = ctx.classStack[ctx.classStack.length - 1];
      const qualified = cls ? `${cls}.${bareName}` : bareName;
      const kind = cls ? 'method' : 'function';
      const body = node.childForFieldName('body');
      const chunked = tryChunkBody({
        file: ctx.file,
        source: ctx.source,
        qualifiedName: qualified,
        bareName,
        kind,
        body,
        chunkOptions: ctx.chunkOptions,
        callerStack: ctx.callerStack,
      });
      if (chunked) {
        ctx.symbols.push(...chunked.symbols);
        chunked.walkStatements((stmt) => visit(stmt, ctx));
        return;
      }
      const sym = makeSym(ctx, node, bareName, qualified, kind);
      ctx.symbols.push(sym);
      ctx.callerStack.push(sym.id);
      if (body) visit(body, ctx);
      ctx.callerStack.pop();
      return;
    }

    case 'decorated_definition': {
      // Skip decorators, descend into the inner definition.
      const def = node.childForFieldName('definition');
      if (def) visit(def, ctx);
      return;
    }

    case 'class_definition': {
      const nameNode = node.childForFieldName('name');
      if (!nameNode) return visitChildren(node, ctx);
      const name = nameNode.text;
      ctx.symbols.push(makeSym(ctx, node, name, name, 'class'));
      ctx.classStack.push(name);
      const body = node.childForFieldName('body');
      if (body) visit(body, ctx);
      ctx.classStack.pop();
      return;
    }

    case 'import_statement': {
      // `import X` or `import X as Y` or `import X, Y as Z`
      for (let i = 0; i < node.namedChildCount; i++) {
        const c = node.namedChild(i);
        if (!c) continue;
        if (c.type === 'dotted_name') {
          ctx.imports.push({ source: c.text, names: [c.text.split('.')[0]] });
        } else if (c.type === 'aliased_import') {
          const inner = c.childForFieldName('name');
          const alias = c.childForFieldName('alias');
          if (inner) {
            ctx.imports.push({
              source: inner.text,
              names: [inner.text.split('.')[0]],
              namespace: alias?.text,
            });
          }
        }
      }
      return;
    }

    case 'import_from_statement': {
      // `from X import Y` / `from . import Y` / `from X import *`
      const moduleNode = node.childForFieldName('module_name');
      let source = '';
      if (moduleNode) {
        source = moduleNode.text;
      } else {
        // Pure relative `from . import X`
        const firstChild = node.child(1);
        if (firstChild && firstChild.text.startsWith('.')) source = firstChild.text;
      }
      const names: string[] = [];
      for (let i = 0; i < node.namedChildCount; i++) {
        const c = node.namedChild(i);
        if (!c) continue;
        if (c === moduleNode) continue;
        if (c.type === 'dotted_name' || c.type === 'identifier') {
          if (source && c === moduleNode) continue;
          if (c.text !== source) names.push(c.text);
        } else if (c.type === 'aliased_import') {
          const inner = c.childForFieldName('name');
          if (inner) names.push(inner.text);
        }
      }
      if (source) ctx.imports.push({ source, names });
      return;
    }

    case 'call': {
      const fn = node.childForFieldName('function');
      if (fn) {
        const name = simpleCallee(fn);
        if (name && ctx.callerStack.length > 0) {
          ctx.calls.push({ from: ctx.callerStack[ctx.callerStack.length - 1], toName: name });
        }
      }
      visitChildren(node, ctx);
      return;
    }
  }
  visitChildren(node, ctx);
}

function visitChildren(node: Parser.SyntaxNode, ctx: PyContext): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c) visit(c, ctx);
  }
}

function makeSym(
  ctx: PyContext,
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

function simpleCallee(fn: Parser.SyntaxNode): string | null {
  if (fn.type === 'identifier') return fn.text;
  if (fn.type === 'attribute') {
    const attr = fn.childForFieldName('attribute');
    if (attr) return attr.text;
  }
  return null;
}
