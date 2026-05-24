import Parser from 'tree-sitter';
// tree-sitter-typescript has no published .d.ts; require() at runtime avoids
// pulling in a broken type during tsc compile.
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const TypeScript = require_('tree-sitter-typescript') as {
  typescript: unknown;
  tsx: unknown;
};
import {
  approxTokens,
  type ParsedCall,
  type ParsedImport,
  type ParsedSymbol,
  type ParseResult,
} from './parser.js';

const tsParser = new Parser();
tsParser.setLanguage(TypeScript.typescript);
const tsxParser = new Parser();
tsxParser.setLanguage(TypeScript.tsx);

export function parseTypeScript(file: string, source: string): ParseResult {
  const parser = file.endsWith('.tsx') || file.endsWith('.jsx') ? tsxParser : tsParser;

  let tree: Parser.Tree;
  try {
    tree = parser.parse(source);
  } catch {
    return { symbols: [], imports: [], calls: [] };
  }

  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  const calls: ParsedCall[] = [];

  visit(tree.rootNode, {
    file,
    source,
    symbols,
    imports,
    calls,
    classStack: [],
    callerStack: [],
    inTypeContext: false,
  });

  return { symbols, imports, calls };
}

interface VisitorContext {
  file: string;
  source: string;
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  calls: ParsedCall[];
  classStack: string[];
  callerStack: string[];
  inTypeContext: boolean;
}

function visit(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  switch (node.type) {
    case 'function_declaration':
    case 'generator_function_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        const sym = makeSymbol(ctx, node, name, name, 'function');
        ctx.symbols.push(sym);
        ctx.callerStack.push(sym.id);
        visitChildren(node, ctx);
        ctx.callerStack.pop();
        return;
      }
      break;
    }

    case 'lexical_declaration':
    case 'variable_declaration': {
      // const foo = () => {} / const X = <div />
      for (let i = 0; i < node.namedChildCount; i++) {
        const decl = node.namedChild(i);
        if (!decl || decl.type !== 'variable_declarator') continue;
        const nameNode = decl.childForFieldName('name');
        const valueNode = decl.childForFieldName('value');
        if (!nameNode || !valueNode) continue;
        const isFunctionish =
          valueNode.type === 'arrow_function' ||
          valueNode.type === 'function_expression' ||
          valueNode.type === 'function' ||
          valueNode.type === 'jsx_element' ||
          valueNode.type === 'jsx_self_closing_element';
        if (isFunctionish) {
          const sym = makeSymbol(ctx, decl, nameNode.text, nameNode.text, 'function');
          ctx.symbols.push(sym);
          ctx.callerStack.push(sym.id);
          visit(valueNode, ctx);
          ctx.callerStack.pop();
        } else {
          visit(valueNode, ctx);
        }
      }
      return;
    }

    case 'class_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        const sym = makeSymbol(ctx, node, name, name, 'class');
        ctx.symbols.push(sym);
        ctx.classStack.push(name);
        visitChildren(node, ctx);
        ctx.classStack.pop();
        return;
      }
      break;
    }

    case 'method_definition': {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        const cls = ctx.classStack[ctx.classStack.length - 1];
        const qualified = cls ? `${cls}.${name}` : name;
        const sym = makeSymbol(ctx, node, name, qualified, 'method');
        ctx.symbols.push(sym);
        ctx.callerStack.push(sym.id);
        visitChildren(node, ctx);
        ctx.callerStack.pop();
        return;
      }
      break;
    }

    case 'interface_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (name) {
        ctx.symbols.push(makeSymbol(ctx, node, name, name, 'interface'));
      }
      return; // body is types — skip
    }

    case 'type_alias_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (name) ctx.symbols.push(makeSymbol(ctx, node, name, name, 'type'));
      return;
    }

    case 'import_statement': {
      const imp = extractImport(node);
      if (imp) ctx.imports.push(imp);
      return;
    }

    case 'call_expression': {
      if (!ctx.inTypeContext) {
        const fn = node.childForFieldName('function');
        if (fn) {
          const name = simpleCalleeName(fn);
          if (name && ctx.callerStack.length > 0) {
            ctx.calls.push({ from: ctx.callerStack[ctx.callerStack.length - 1], toName: name });
          }
        }
      }
      visitChildren(node, ctx);
      return;
    }

    // type contexts — calls inside these don't count
    case 'type_arguments':
    case 'type_annotation':
    case 'type_parameters':
    case 'generic_type':
    case 'predefined_type':
    case 'union_type':
    case 'intersection_type':
    case 'conditional_type':
    case 'mapped_type':
    case 'tuple_type':
    case 'object_type':
    case 'function_type':
    case 'constructor_type':
    case 'type_query': {
      const previous = ctx.inTypeContext;
      ctx.inTypeContext = true;
      visitChildren(node, ctx);
      ctx.inTypeContext = previous;
      return;
    }
  }

  visitChildren(node, ctx);
}

function visitChildren(node: Parser.SyntaxNode, ctx: VisitorContext): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) visit(child, ctx);
  }
}

function makeSymbol(
  ctx: VisitorContext,
  node: Parser.SyntaxNode,
  bareName: string,
  qualifiedName: string,
  kind: ParsedSymbol['kind'],
): ParsedSymbol {
  const text = ctx.source.slice(node.startIndex, node.endIndex);
  return {
    id: `${ctx.file}:${qualifiedName}`,
    name: bareName,
    file: ctx.file,
    kind,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    tokens: approxTokens(text),
  };
}

function extractImport(node: Parser.SyntaxNode): ParsedImport | null {
  const sourceNode = node.childForFieldName('source');
  if (!sourceNode) return null;
  const source = sourceNode.text.replace(/^['"`]|['"`]$/g, '');
  const names: string[] = [];
  let namespace: string | undefined;

  // `import_clause`
  const clause = firstChildOfType(node, 'import_clause');
  if (!clause) {
    return { source, names, namespace };
  }

  for (let i = 0; i < clause.namedChildCount; i++) {
    const c = clause.namedChild(i);
    if (!c) continue;
    if (c.type === 'identifier') {
      // default import:  import foo from '...'
      names.push(c.text);
    } else if (c.type === 'named_imports') {
      for (let j = 0; j < c.namedChildCount; j++) {
        const spec = c.namedChild(j);
        if (spec?.type === 'import_specifier') {
          const alias = spec.childForFieldName('alias');
          const orig = spec.childForFieldName('name');
          const picked = alias?.text ?? orig?.text;
          if (picked) names.push(picked);
        }
      }
    } else if (c.type === 'namespace_import') {
      // import * as utils from '...'
      const id = firstChildOfType(c, 'identifier');
      if (id) namespace = id.text;
    }
  }

  return { source, names, namespace };
}

function firstChildOfType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | null {
  for (let i = 0; i < node.namedChildCount; i++) {
    const c = node.namedChild(i);
    if (c?.type === type) return c;
  }
  return null;
}

function simpleCalleeName(fn: Parser.SyntaxNode): string | null {
  if (fn.type === 'identifier') return fn.text;
  if (fn.type === 'member_expression') {
    const prop = fn.childForFieldName('property');
    if (prop) return prop.text;
  }
  return null;
}
