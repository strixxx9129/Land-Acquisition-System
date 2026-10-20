import { useSyncExternalStore } from 'react';

/**
 * Whether the API is answering. On the free Render tier the server sleeps when idle and takes
 * up to a minute to wake; the UI shows a friendly banner instead of looking broken.
 */
export type ServerState = 'ok' | 'waking' | 'unreachable';

let state: ServerState = 'ok';
const listeners = new Set<() => void>();

export function setServerState(next: ServerState): void {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

export function useServerState(): ServerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
