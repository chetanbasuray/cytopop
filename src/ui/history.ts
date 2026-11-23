import { useCallback, useState } from "react";

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

const LIMIT = 100;

/** Records a new state; unchanged values are not recorded, and a new change clears the redo stack. */
export function record<T>(h: History<T>, next: T): History<T> {
  return next === h.present ? h : { past: [...h.past, h.present].slice(-LIMIT), present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past.at(-1);
  return h.past.length === 0 ? h : { past: h.past.slice(0, -1), present: prev as T, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  const [next, ...rest] = h.future;
  return h.future.length === 0 ? h : { past: [...h.past, h.present], present: next as T, future: rest };
}

/** useState with undo and redo. */
export function useHistory<T>(initial: T) {
  const [h, setH] = useState<History<T>>({ past: [], present: initial, future: [] });
  const set = useCallback((next: T | ((prev: T) => T)) =>
    setH((s) => record(s, typeof next === "function" ? (next as (prev: T) => T)(s.present) : next)), []);
  return {
    value: h.present,
    set,
    undo: useCallback(() => setH(undo), []),
    redo: useCallback(() => setH(redo), []),
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  };
}
