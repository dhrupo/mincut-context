import React, { useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PackResult } from '../../select/pack.js';

export interface ReviewAppProps {
  initial: PackResult;
  budget: number;
  onSubmit: (paths: string[]) => void;
  /** Repo root for resolving file previews. Optional — preview disabled if omitted. */
  repo?: string;
}

interface RowState {
  pinned: boolean;
  excluded: boolean;
}

interface FilterState {
  active: boolean;
  query: string;
}

export function ReviewApp(props: ReviewAppProps): React.ReactElement {
  const { initial, budget, onSubmit, repo } = props;
  const { exit } = useApp();
  const [cursor, setCursor] = useState(0);
  const [state, setState] = useState<RowState[]>(() =>
    initial.files.map(() => ({ pinned: false, excluded: false })),
  );
  const [filter, setFilter] = useState<FilterState>({ active: false, query: '' });
  // For the gg sequence — last input keypress timestamp + last char.
  const [lastKey, setLastKey] = useState<{ char: string; at: number }>({ char: '', at: 0 });

  // Compute the visible-index → original-index mapping after filter.
  const visibleIndices = useMemo(() => {
    if (!filter.query) return initial.files.map((_, i) => i);
    const q = filter.query.toLowerCase();
    return initial.files
      .map((f, i) => (f.path.toLowerCase().includes(q) ? i : -1))
      .filter((i) => i >= 0);
  }, [filter.query, initial.files]);

  // Clamp cursor if filter shrank the list.
  if (cursor >= visibleIndices.length && visibleIndices.length > 0) {
    setCursor(visibleIndices.length - 1);
  }

  const submit = (): void => {
    const paths = initial.files
      .map((f, i) => (state[i].excluded ? null : f.path))
      .filter((p): p is string => p !== null);
    onSubmit(paths);
    exit();
  };

  useInput((input, key) => {
    // Filter input mode — capture printable chars.
    if (filter.active) {
      if (key.escape) {
        setFilter({ active: false, query: '' });
        return;
      }
      if (key.return) {
        setFilter((f) => ({ ...f, active: false }));
        return;
      }
      if (key.backspace || key.delete) {
        setFilter((f) => ({ ...f, query: f.query.slice(0, -1) }));
        return;
      }
      if (input && /^[\x20-\x7e]+$/.test(input)) {
        setFilter((f) => ({ ...f, query: f.query + input }));
        return;
      }
      return;
    }

    if (input === '/') {
      setFilter({ active: true, query: '' });
      return;
    }
    if (key.escape) {
      setFilter({ active: false, query: '' });
      return;
    }
    if (key.downArrow || input === 'j') {
      setCursor((c) => Math.min(visibleIndices.length - 1, c + 1));
      return;
    }
    if (key.upArrow || input === 'k') {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (input === 'G') {
      setCursor(Math.max(0, visibleIndices.length - 1));
      return;
    }
    if (input === 'gg') {
      setCursor(0);
      setLastKey({ char: '', at: 0 });
      return;
    }
    if (input === 'g') {
      const now = Date.now();
      if (lastKey.char === 'g' && now - lastKey.at < 500) {
        setCursor(0);
        setLastKey({ char: '', at: 0 });
      } else {
        setLastKey({ char: 'g', at: now });
      }
      return;
    }
    const realIndex = visibleIndices[cursor];
    if (realIndex === undefined) return;
    if (input === 'x') {
      setState((s) => s.map((r, i) => (i === realIndex ? { ...r, excluded: !r.excluded } : r)));
      return;
    }
    if (input === 'p') {
      setState((s) => s.map((r, i) => (i === realIndex ? { ...r, pinned: !r.pinned } : r)));
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
  const realCursorIndex = visibleIndices[cursor];
  const focusedFile = realCursorIndex !== undefined ? initial.files[realCursorIndex] : undefined;
  const preview = useMemo(() => buildPreview(repo, focusedFile), [repo, focusedFile?.path, focusedFile?.ranges]);

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

      {filter.active || filter.query ? (
        <Box marginTop={1}>
          <Text color="cyan">{filter.active ? '/' : ' '}</Text>
          <Text>{filter.query}</Text>
          <Text dimColor> {filter.active ? '(enter to apply · esc to cancel)' : '(filter active — esc to clear)'}</Text>
        </Box>
      ) : null}

      <Box marginTop={1} flexDirection={repo ? 'row' : 'column'}>
        <Box flexDirection="column" flexBasis={repo ? '50%' : '100%'}>
          {visibleIndices.length === 0 ? (
            <Text dimColor>(no files match filter)</Text>
          ) : (
            visibleIndices.map((origIndex, visibleIndex) => {
              const f = initial.files[origIndex];
              const row = state[origIndex];
              const cursorMark = visibleIndex === cursor ? '▶' : ' ';
              const pinMark = row.pinned ? '★' : ' ';
              const excludeMark = row.excluded ? '✗' : ' ';
              const ranges = f.ranges.map((r) => `${r.start}-${r.end}`).join(',');
              const dim = row.excluded;
              return (
                <Box key={f.path}>
                  <Text color={visibleIndex === cursor ? 'cyan' : undefined}>{cursorMark} </Text>
                  <Text color="yellow">{pinMark}</Text>
                  <Text color="red">{excludeMark}</Text>
                  <Text dimColor={dim}> </Text>
                  <Text dimColor={dim}>{f.path.padEnd(32)}</Text>
                  <Text dimColor>{` ${ranges.padEnd(10)} `}</Text>
                  <Text bold>{f.score.toFixed(3)}</Text>
                  <Text dimColor>{` ${f.tokens}t`}</Text>
                </Box>
              );
            })
          )}
        </Box>
        {repo ? (
          <Box flexDirection="column" flexBasis="50%" paddingLeft={2} borderStyle="single" borderLeft borderTop={false} borderRight={false} borderBottom={false}>
            <Text bold dimColor>{focusedFile?.path ?? '(preview)'}</Text>
            {preview.map((line, i) => (
              <Text key={i} dimColor={line.dim}>
                {line.lineNo.toString().padStart(4)} │ {line.text}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {includedCount} / {initial.files.length} files · {includedTokens} / {budget} tokens
        </Text>
      </Box>

      <Box>
        <Text dimColor>
          ↑/↓ j/k nav · gg G top/bottom · p pin · x exclude · / filter · Enter copy · q quit
        </Text>
      </Box>
    </Box>
  );
}

interface PreviewLine {
  lineNo: number;
  text: string;
  dim: boolean;
}

function buildPreview(
  repo: string | undefined,
  file: { path: string; ranges: Array<{ start: number; end: number }> } | undefined,
): PreviewLine[] {
  if (!repo || !file) return [];
  let source: string;
  try {
    source = readFileSync(path.join(repo, file.path), 'utf8');
  } catch {
    return [{ lineNo: 0, text: '(unable to read file)', dim: true }];
  }
  const allLines = source.split('\n');
  const result: PreviewLine[] = [];
  const inRange = (n: number): boolean => file.ranges.some((r) => n >= r.start && n <= r.end);
  let printed = 0;
  for (let i = 0; i < allLines.length && printed < 30; i++) {
    const lineNo = i + 1;
    if (inRange(lineNo)) {
      result.push({ lineNo, text: truncate(allLines[i], 80), dim: false });
      printed += 1;
    }
  }
  if (result.length === 0 && file.ranges.length === 0) {
    result.push(...allLines.slice(0, 20).map((t, i) => ({ lineNo: i + 1, text: truncate(t, 80), dim: true })));
  }
  return result;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
