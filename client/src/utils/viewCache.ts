/**
 * Tiny in-memory cache for page data, so a page can show what it loaded last time instantly
 * and then refresh it in the background ("stale while revalidate").
 * Memory only: it is cleared on reload/logout and never written to disk.
 */
const store = new Map<string, { at: number; value: unknown }>();
const MAX_AGE_MS = 15 * 60 * 1000;

export function getCachedView<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > MAX_AGE_MS) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function setCachedView<T>(key: string, value: T): void {
  store.set(key, { at: Date.now(), value });
}

export function clearCachedViews(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
}

// Anything that changes a shift or cash drawer makes the cached shift/day-closing pages stale.
if (typeof window !== 'undefined') {
  const dropShiftViews = () => {
    clearCachedViews('shift-');
    clearCachedViews('day-closing-');
  };
  for (const evt of ['shift_status_changed', 'shift_opened', 'shift_closed', 'cash_movement_recorded', 'branch_scope_changed', 'day_closing_updated', 'day_closing_submitted']) {
    window.addEventListener(evt, dropShiftViews);
  }
}
