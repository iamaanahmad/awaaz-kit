import { useEffect, useState, type ReactElement } from 'react';

const readOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine);

/** Tracks connectivity from `online`/`offline` events without a reload (Req 2.7). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(readOnline);
  useEffect(() => {
    const on = (): void => setOnline(true);
    const off = (): void => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setOnline(readOnline());
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export interface OnlineIndicatorProps {
  /** Optional override; when omitted the indicator follows browser events. */
  online?: boolean;
}

/** Text plus icon connectivity indicator (Req 2.7). */
export function OnlineIndicator({ online }: OnlineIndicatorProps): ReactElement {
  const detected = useOnlineStatus();
  const isOnline = online ?? detected;
  return (
    <span
      className="online-indicator"
      data-online={isOnline ? 'true' : 'false'}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true">{isOnline ? '●' : '○'}</span> {isOnline ? 'Online' : 'Offline'}
    </span>
  );
}
