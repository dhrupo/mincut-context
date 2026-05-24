import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { PackResult } from '../../select/pack.js';

export interface ReviewAppProps {
  initial: PackResult;
  budget: number;
  onSubmit: (paths: string[]) => void;
}

interface RowState {
  pinned: boolean;
  excluded: boolean;
}

export function ReviewApp({ initial, budget, onSubmit }: ReviewAppProps): React.ReactElement {
  const { exit } = useApp();
  const [cursor, setCursor] = useState(0);
  const [state, setState] = useState<RowState[]>(() =>
    initial.files.map(() => ({ pinned: false, excluded: false })),
  );

  const submit = (): void => {
    const paths = initial.files
      .map((f, i) => (state[i].excluded ? null : f.path))
      .filter((p): p is string => p !== null);
    onSubmit(paths);
    exit();
  };

  useInput((input, key) => {
    if (key.downArrow || input === 'j') {
      setCursor((c) => Math.min(initial.files.length - 1, c + 1));
      return;
    }
    if (key.upArrow || input === 'k') {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (input === 'x') {
      setState((s) => s.map((r, i) => (i === cursor ? { ...r, excluded: !r.excluded } : r)));
      return;
    }
    if (input === 'p') {
      setState((s) => s.map((r, i) => (i === cursor ? { ...r, pinned: !r.pinned } : r)));
      return;
    }
    if (key.return) {
      submit();
      return;
    }
    if (input === 'q' || (key.ctrl && input === 'c')) {
      onSubmit([]);
      exit();
    }
  });

  const includedTokens = initial.files.reduce(
    (sum, f, i) => sum + (state[i]?.excluded ? 0 : f.tokens),
    0,
  );
  const includedCount = state.filter((s) => !s.excluded).length;

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>mincut-context</Text>
        <Text> · </Text>
        <Text dimColor>
          {initial.graph.selected} symbols · cut {initial.graph.cutCost.toFixed(1)} · frontier{' '}
          {initial.graph.frontier}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {initial.files.map((f, i) => {
          const row = state[i];
          const cursorMark = i === cursor ? '▶' : ' ';
          const pinMark = row.pinned ? '★' : ' ';
          const excludeMark = row.excluded ? '✗' : ' ';
          const ranges = f.ranges.map((r) => `${r.start}-${r.end}`).join(',');
          const dim = row.excluded;
          return (
            <Box key={f.path}>
              <Text color={i === cursor ? 'cyan' : undefined}>{cursorMark} </Text>
              <Text color="yellow">{pinMark}</Text>
              <Text color="red">{excludeMark}</Text>
              <Text dimColor={dim}> </Text>
              <Text dimColor={dim}>{f.path.padEnd(36)}</Text>
              <Text dimColor>{` lines ${ranges.padEnd(12)} `}</Text>
              <Text color="cyan">{bar20(f.score / Math.max(initial.files[0]?.score ?? 1, 1e-9))}</Text>
              <Text> </Text>
              <Text bold>{f.score.toFixed(3)}</Text>
              <Text dimColor>{` ${f.tokens} tok`}</Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {includedCount} / {initial.files.length} files · {includedTokens} / {budget} tokens
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          ↑/↓ or j/k navigate · p pin · x exclude · Enter copy · q quit
        </Text>
      </Box>
    </Box>
  );
}

function bar20(fraction: number): string {
  const n = Math.max(0, Math.min(20, Math.round(fraction * 20)));
  return '█'.repeat(n).padEnd(20, '·');
}
