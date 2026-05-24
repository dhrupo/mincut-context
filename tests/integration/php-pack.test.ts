import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pack } from '../../src/select/pack.js';
import { indexRepo } from '../../src/index/builder.js';

describe('PHP — end-to-end', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mcx-php-'));
    await mkdir(path.join(root, 'src/Auth'), { recursive: true });
    await mkdir(path.join(root, 'src/Ui'), { recursive: true });

    await writeFile(
      path.join(root, 'src/Auth/Login.php'),
      `<?php
namespace App\\Auth;

class Login {
  public function login($u) {
    $session = new Session();
    return $session->create($u);
  }
}`,
    );
    await writeFile(
      path.join(root, 'src/Auth/Session.php'),
      `<?php
namespace App\\Auth;

class Session {
  public function create($u) { return ['user' => $u]; }
  public function destroy($t) { return $t; }
}`,
    );
    await writeFile(
      path.join(root, 'src/Auth/Validators.php'),
      `<?php
namespace App\\Auth;

function validateCreds($u) { return strlen($u) > 0; }`,
    );
    await writeFile(
      path.join(root, 'src/Ui/Dashboard.php'),
      `<?php
namespace App\\Ui;

class Dashboard {
  public function render() { return '<html>...</html>'; }
}`,
    );
  });

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('indexes PHP files', () => {
    const { graph, stats } = indexRepo(root);
    expect(stats.files).toBeGreaterThan(0);
    expect(graph.nodes().some((id) => id.endsWith(':Login'))).toBe(true);
    expect(graph.nodes().some((id) => id.endsWith(':Session.create'))).toBe(true);
    expect(graph.nodes().some((id) => id.endsWith(':validateCreds'))).toBe(true);
  });

  it('packs the auth cluster for an auth task', async () => {
    const result = await pack({ task: 'login session', repo: root, budget: 600 });
    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.includes('Auth/'))).toBe(true);
  });

  it('handles a mixed PHP + TS repo', async () => {
    await writeFile(
      path.join(root, 'src/Auth/login.ts'),
      `export function login(u: string) { return u; }`,
    );
    const { graph } = indexRepo(root);
    expect(graph.nodes().some((id) => id === 'src/Auth/login.ts:login')).toBe(true);
    expect(graph.nodes().some((id) => id === 'src/Auth/Login.php:Login')).toBe(true);
  });
});
