import { useSyncExternalStore } from 'react';

const KEY = 'awaaz.bill.pipelineInspector';
const listeners = new Set<() => void>();

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Whether the "Show how it understood this" inspector is enabled. Off by default. */
export function getInspectorEnabled(): boolean {
  return safeStorage()?.getItem(KEY) === '1';
}

export function setInspectorEnabled(enabled: boolean): void {
  safeStorage()?.setItem(KEY, enabled ? '1' : '0');
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useInspectorEnabled(): boolean {
  return useSyncExternalStore(subscribe, getInspectorEnabled, () => false);
}
