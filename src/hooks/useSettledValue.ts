import { useRef } from "react";

/**
 * Returns `value` only while `ready` is true; while not ready it keeps returning
 * the last value seen when ready (or the first value on the initial render).
 *
 * Used by heavy pages to avoid recomputing every derived figure after each
 * partial data batch: memos that depend on the settled values run once, when
 * all their inputs have finished loading.
 */
export function useSettledValue<T>(value: T, ready: boolean): T {
  const settledRef = useRef(value);
  if (ready) settledRef.current = value;
  return settledRef.current;
}
