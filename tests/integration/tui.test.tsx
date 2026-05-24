import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { ReviewApp } from '../../src/adapters/cli/tui.js';
import type { PackResult } from '../../src/select/pack.js';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 25));

function sample(): PackResult {
  return {
    files: [
      {
        path: 'src/auth/login.ts',
        ranges: [{ start: 1, end: 30 }],
        score: 0.55,
        tokens: 240,
        reasons: ['seed — matched directly by task'],
      },
      {
        path: 'src/auth/session.ts',
        ranges: [{ start: 1, end: 20 }],
        score: 0.34,
        tokens: 180,
        reasons: ['attached (60%)'],
      },
      {
        path: 'src/db/users.ts',
        ranges: [{ start: 5, end: 18 }],
        score: 0.12,
        tokens: 90,
        reasons: ['attached (33%)'],
      },
    ],
    tokens: 510,
    graph: { selected: 6, frontier: 4, cutCost: 2, totalSymbols: 60 },
    explain: 'task: "fix login"\nseeded 1 symbol',
  };
}

describe('ReviewApp (Ink TUI)', () => {
  it('renders the file list with scores and tokens', () => {
    const { lastFrame } = render(
      React.createElement(ReviewApp, { initial: sample(), budget: 1000, onSubmit: () => {} }),
    );
    const out = lastFrame() ?? '';
    expect(out).toContain('src/auth/login.ts');
    expect(out).toContain('src/auth/session.ts');
    expect(out).toContain('src/db/users.ts');
    expect(out).toContain('240');   // tokens shown
    expect(out).toContain('510 / 1000'); // budget summary
  });

  it('shows the cursor on the first row by default', () => {
    const { lastFrame } = render(
      React.createElement(ReviewApp, { initial: sample(), budget: 1000, onSubmit: () => {} }),
    );
    const out = lastFrame() ?? '';
    // Cursor marker '▶' must appear next to login.ts (the first file).
    const lines = out.split('\n');
    const loginLine = lines.find((l) => l.includes('login.ts'))!;
    expect(loginLine).toMatch(/▶/);
  });

  it('moves the cursor down on the j / arrow-down key', async () => {
    const { lastFrame, stdin } = render(
      React.createElement(ReviewApp, { initial: sample(), budget: 1000, onSubmit: () => {} }),
    );
    await flush();
    stdin.write('j');
    await flush();
    const out = lastFrame() ?? '';
    const lines = out.split('\n');
    const sessionLine = lines.find((l) => l.includes('session.ts'))!;
    expect(sessionLine).toMatch(/▶/);
  });

  it('toggles exclude with x and marks the row visually', async () => {
    const { lastFrame, stdin } = render(
      React.createElement(ReviewApp, { initial: sample(), budget: 1000, onSubmit: () => {} }),
    );
    await flush();
    stdin.write('x');
    await flush();
    const out = lastFrame() ?? '';
    const lines = out.split('\n');
    const loginLine = lines.find((l) => l.includes('login.ts'))!;
    expect(loginLine).toContain('✗');
  });

  it('toggles pin with p and marks the row visually', async () => {
    const { lastFrame, stdin } = render(
      React.createElement(ReviewApp, { initial: sample(), budget: 1000, onSubmit: () => {} }),
    );
    await flush();
    stdin.write('p');
    await flush();
    const out = lastFrame() ?? '';
    const lines = out.split('\n');
    const loginLine = lines.find((l) => l.includes('login.ts'))!;
    expect(loginLine).toContain('★');
  });

  it('calls onSubmit when Enter is pressed, omitting excluded files', async () => {
    let received: string[] | null = null;
    const { stdin } = render(
      React.createElement(ReviewApp, {
        initial: sample(),
        budget: 1000,
        onSubmit: (paths: string[]) => {
          received = paths;
        },
      }),
    );
    await flush();
    stdin.write('x'); // exclude login.ts (cursor at 0)
    await flush();
    stdin.write('\r'); // enter
    await flush();
    expect(received).not.toBeNull();
    expect(received!).not.toContain('src/auth/login.ts');
    expect(received!).toContain('src/auth/session.ts');
  });

  it('shows the help footer with key bindings', () => {
    const { lastFrame } = render(
      React.createElement(ReviewApp, { initial: sample(), budget: 1000, onSubmit: () => {} }),
    );
    const out = lastFrame() ?? '';
    expect(out).toMatch(/pin/i);
    expect(out).toMatch(/exclude/i);
    expect(out).toMatch(/enter/i);
  });

  it('G jumps to the last row', async () => {
    const { lastFrame, stdin } = render(
      React.createElement(ReviewApp, { initial: sample(), budget: 1000, onSubmit: () => {} }),
    );
    await flush();
    stdin.write('G');
    await flush();
    const out = lastFrame() ?? '';
    const lines = out.split('\n');
    const usersLine = lines.find((l) => l.includes('users.ts'))!;
    expect(usersLine).toMatch(/▶/);
  });

  it('gg jumps to the first row', async () => {
    const { lastFrame, stdin } = render(
      React.createElement(ReviewApp, { initial: sample(), budget: 1000, onSubmit: () => {} }),
    );
    await flush();
    stdin.write('G');
    await flush();
    stdin.write('gg');
    await flush();
    const out = lastFrame() ?? '';
    const lines = out.split('\n');
    const loginLine = lines.find((l) => l.includes('login.ts'))!;
    expect(loginLine).toMatch(/▶/);
  });

  it('/ filters the list by typed substring', async () => {
    const { lastFrame, stdin } = render(
      React.createElement(ReviewApp, { initial: sample(), budget: 1000, onSubmit: () => {} }),
    );
    await flush();
    stdin.write('/');
    await flush();
    stdin.write('sess');
    await flush();
    const out = lastFrame() ?? '';
    // session.ts must remain; login.ts and users.ts are filtered out.
    expect(out).toContain('session.ts');
    expect(out).not.toContain('login.ts');
    expect(out).not.toContain('users.ts');
  });

  it('Escape clears an active filter', async () => {
    const { lastFrame, stdin } = render(
      React.createElement(ReviewApp, { initial: sample(), budget: 1000, onSubmit: () => {} }),
    );
    await flush();
    stdin.write('/');
    stdin.write('sess');
    await flush();
    stdin.write(''); // Esc
    await flush();
    const out = lastFrame() ?? '';
    expect(out).toContain('login.ts');
    expect(out).toContain('session.ts');
    expect(out).toContain('users.ts');
  });
});
