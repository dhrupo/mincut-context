# Examples

Drop-in configurations for common ways to use `mincut-context`.

| File | What it shows |
|---|---|
| [`claude-code-mcp.json`](./claude-code-mcp.json) | Add mincut-context as an MCP server in Claude Code's settings. After this, your agent has `pack_context`, `expand_node`, `explain_selection`, `find_callers`, `find_callees`, `search_symbols`. |
| [`codex-agent.json`](./codex-agent.json) | Same idea for the Codex CLI / agent. Equivalent shape, slightly different host config block. |
| [`cursor-mcp.json`](./cursor-mcp.json) | Cursor IDE — drop into `.cursor/mcp.json` or the global equivalent. |
| [`generic-mcp.json`](./generic-mcp.json) | Plain MCP `mcpServers` block usable by any MCP-aware client. |
| [`github-actions-pr-context.yml`](./github-actions-pr-context.yml) | CI workflow that packs context for a PR's diff and posts it as a sticky comment for human reviewers. |
| [`library-quickstart.ts`](./library-quickstart.ts) | Programmatic usage — runs `pack()`, gets back files + ranges, dumps a budget report. |
| [`shell-pipe-to-llm.sh`](./shell-pipe-to-llm.sh) | Unix-style: `mcx pack` | jq | curl to a model. Useful for shell-only agent loops. |

All examples assume `mincut-context` is installed somewhere npx can find it:

```bash
npm install -g mincut-context
# or per-project:
npm install --save-dev mincut-context
```

For the LSP examples, also install:

```bash
npm install -g typescript-language-server
```

For semantic seeding, no extra install — `@xenova/transformers` ships in the package.
