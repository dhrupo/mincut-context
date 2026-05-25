import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const examplesDir = path.resolve(__dirname, '../../examples');

describe('examples/ — every file is well-formed', () => {
  it('contains a README.md', () => {
    const readme = path.join(examplesDir, 'README.md');
    expect(statSync(readme).isFile()).toBe(true);
    expect(readFileSync(readme, 'utf8')).toMatch(/mincut-context/);
  });

  it('all .json examples parse as valid JSON', () => {
    const jsonFiles = readdirSync(examplesDir).filter((f) => f.endsWith('.json'));
    expect(jsonFiles.length).toBeGreaterThan(0);
    for (const f of jsonFiles) {
      const raw = readFileSync(path.join(examplesDir, f), 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();
    }
  });

  it('every MCP config file exposes a mincut-context server entry', () => {
    const jsonFiles = readdirSync(examplesDir).filter((f) => f.endsWith('.json'));
    const mcpFiles = jsonFiles.filter((f) => f.includes('mcp') || f.includes('agent'));
    expect(mcpFiles.length).toBeGreaterThan(0);
    for (const f of mcpFiles) {
      const cfg = JSON.parse(readFileSync(path.join(examplesDir, f), 'utf8'));
      expect(cfg.mcpServers?.['mincut-context']?.command).toBe('npx');
      expect(cfg.mcpServers?.['mincut-context']?.args).toContain('mincut-context');
    }
  });

  it('github-actions yml file looks like a valid workflow', () => {
    const yml = path.join(examplesDir, 'github-actions-pr-context.yml');
    const raw = readFileSync(yml, 'utf8');
    expect(raw).toMatch(/^name:/m);
    expect(raw).toMatch(/^on:/m);
    expect(raw).toMatch(/^jobs:/m);
    expect(raw).toMatch(/mcx pack/);
  });

  it('library-quickstart.ts imports from the package', () => {
    const ts = readFileSync(path.join(examplesDir, 'library-quickstart.ts'), 'utf8');
    expect(ts).toMatch(/from 'mincut-context'/);
    expect(ts).toMatch(/await pack\(/);
  });

  it('shell-pipe-to-llm.sh is executable and uses mcx', () => {
    const sh = path.join(examplesDir, 'shell-pipe-to-llm.sh');
    const stat = statSync(sh);
    expect((stat.mode & 0o111) !== 0).toBe(true); // any executable bit
    expect(readFileSync(sh, 'utf8')).toMatch(/mcx pack/);
  });
});
