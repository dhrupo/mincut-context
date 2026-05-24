/**
 * Minimal LSP types we use.  Faithful subset of the LSP spec
 * (https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/),
 * just the bits the resolver needs.
 */

export interface LspPosition {
  line: number;     // 0-based
  character: number; // 0-based
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspLocation {
  uri: string;      // file://… URI
  range: LspRange;
}

export interface LspDefinitionResult {
  /** Either a single Location or an array of Locations. */
  locations: LspLocation[];
}

export interface LspClient {
  /** Initialize the LSP server with the given root path. */
  initialize(rootPath: string): Promise<void>;
  /** Tell the server the file is open (some servers require this before definition queries). */
  didOpen(file: string, source: string, languageId: string): Promise<void>;
  /**
   * Ask the server "where is the symbol at this position defined?"
   * Returns 0+ locations.
   */
  definition(file: string, position: LspPosition): Promise<LspDefinitionResult>;
  /** Gracefully shut down. */
  shutdown(): Promise<void>;
}
