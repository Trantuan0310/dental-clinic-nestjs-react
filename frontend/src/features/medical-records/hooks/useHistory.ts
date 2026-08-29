import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

const MAX_HISTORY = 50;

function shallowEqualMap<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export function createHistory<T>(initial: T): HistoryState<T> {
  return { past: [], present: initial, future: [] };
}

export interface UseHistoryResult<T> {
  state: T;
  push: (next: T) => void;
  replace: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (initial: T) => void;
}

export function useHistory<T extends Record<string, unknown>>(initial: T): UseHistoryResult<T> {
  const [history, setHistory] = useState<HistoryState<T>>(() => createHistory(initial));
  // Keep a stable ref to current state to allow batched updates.
  const historyRef = useRef(history);
  historyRef.current = history;

  const push = useCallback((next: T) => {
    setHistory((prev) => {
      if (shallowEqualMap(prev.present, next)) return prev;
      const past = [...prev.past, prev.present].slice(-MAX_HISTORY);
      return { past, present: next, future: [] };
    });
  }, []);

  const replace = useCallback((next: T) => {
    setHistory((prev) => ({ ...prev, present: next }));
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const past = prev.past.slice(0, -1);
      const previous = prev.past[prev.past.length - 1];
      return { past, present: previous, future: [prev.present, ...prev.future].slice(0, MAX_HISTORY) };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const [next, ...rest] = prev.future;
      return { past: [...prev.past, prev.present].slice(-MAX_HISTORY), present: next, future: rest };
    });
  }, []);

  const reset = useCallback((initial: T) => {
    setHistory(createHistory(initial));
  }, []);

  return {
    state: history.present,
    push,
    replace,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    reset,
  };
}

export function useDebouncedEffect(
  effect: () => void | (() => void),
  deps: ReadonlyArray<unknown>,
  delay: number,
): void {
  const cleanupRef = useRef<(() => void) | void>(undefined);
  useEffect(() => {
    const handle = window.setTimeout(() => {
      cleanupRef.current = effect();
    }, delay);
    return () => {
      window.clearTimeout(handle);
      if (typeof cleanupRef.current === 'function') {
        cleanupRef.current();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function areTeethEqual(
  a: Record<string, { status: string; notes?: string }>,
  b: Record<string, { status: string; notes?: string }>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (!x || !y) return false;
    if (x.status !== y.status) return false;
    if ((x.notes ?? '') !== (y.notes ?? '')) return false;
  }
  return true;
}

export function useIsMounted(): boolean {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted.current;
}

// Stable JSON hash for memo-friendly comparisons of record maps.
export function hashTeethMap(map: Record<string, { status: string; notes?: string }>): string {
  const keys = Object.keys(map).sort();
  return keys.map((k) => `${k}:${map[k].status}:${map[k].notes ?? ''}`).join('|');
}

export function useMemoizedTreatments(
  treatments: ReadonlyArray<{ toothNumber: number | string }> | undefined,
): Set<number> {
  return useMemo(() => {
    const s = new Set<number>();
    for (const t of treatments ?? []) {
      if (typeof t.toothNumber === 'number') s.add(t.toothNumber);
      else {
        const n = Number(t.toothNumber);
        if (!Number.isNaN(n)) s.add(n);
      }
    }
    return s;
  }, [treatments]);
}