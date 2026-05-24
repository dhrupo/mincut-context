import { parentPort } from 'node:worker_threads';
import path from 'node:path';
import { parseTypeScript } from '../parsers/ts.js';
import { parsePython } from '../parsers/py.js';
import { parsePhp } from '../parsers/php.js';
import { parseVueSfc } from '../parsers/vue.js';
import type { ParseResult } from '../parsers/parser.js';

const TS_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PY_EXT = new Set(['.py', '.pyi']);
const PHP_EXT = new Set(['.php']);
const VUE_EXT = new Set(['.vue']);

interface WorkerRequest {
  id: number;
  file: string;
  source: string;
}

interface WorkerResponse {
  id: number;
  result: ParseResult | null;
}

function parseForExt(file: string, source: string): ParseResult | null {
  const ext = path.extname(file);
  if (TS_EXT.has(ext)) return parseTypeScript(file, source);
  if (PY_EXT.has(ext)) return parsePython(file, source);
  if (PHP_EXT.has(ext)) return parsePhp(file, source);
  if (VUE_EXT.has(ext)) return parseVueSfc(file, source);
  return null;
}

if (parentPort) {
  parentPort.on('message', (req: WorkerRequest) => {
    let result: ParseResult | null;
    try {
      result = parseForExt(req.file, req.source);
    } catch {
      result = null;
    }
    const resp: WorkerResponse = { id: req.id, result };
    parentPort!.postMessage(resp);
  });
}
