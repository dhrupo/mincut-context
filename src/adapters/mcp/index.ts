import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { handleMcpCall, TOOLS } from './handler.js';

/**
 * Thin stdio JSON-RPC wrapper around the pure handler in ./handler.ts.
 * All business logic lives in the handler — this file only does transport.
 */
export async function runMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'mincut-context', version: '1.4.1' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await handleMcpCall({
      name: request.params.name,
      arguments: request.params.arguments ?? {},
    });
    // The MCP SDK's request handler return type includes a richer
    // task-tracking shape we don't need here; runtime payload is identical.
    return result as unknown as { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep the process alive — the transport handles graceful shutdown on EOF.
  process.stderr.write('mincut-context MCP server running on stdio\n');
}
