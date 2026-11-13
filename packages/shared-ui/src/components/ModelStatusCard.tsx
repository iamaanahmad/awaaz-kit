import type { ReactElement } from 'react';

export type ModelStatusState =
  | { kind: 'checking' }
  | { kind: 'ready'; version?: string }
  | { kind: 'missing' }
  | { kind: 'evicted' }
  | { kind: 'downloading'; progress: number }
  | { kind: 'failed'; reason: string };

export interface ModelStatusCardProps {
  status: ModelStatusState;
  /** Approximate download size in bytes. */
  approxSizeBytes: number;
  onDownload: () => void;
  onContinueTyping: () => void;
}

const formatSize = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
};

const clampPercent = (progress: number): number =>
  Number.isFinite(progress) ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : 0;

/** Shows speech model status; typed input always stays available (Req 5.4, 5.5, 5.7, 5.8, 5.9). */
export function ModelStatusCard({
  status,
  approxSizeBytes,
  onDownload,
  onContinueTyping,
}: ModelStatusCardProps): ReactElement {
  const size = formatSize(approxSizeBytes);
  const buttonClass = 'min-h-[44px] min-w-[44px] px-4 rounded-md border';

  const typingButton = (
    <button type="button" className={buttonClass} onClick={onContinueTyping}>
      Continue with typing
    </button>
  );
  const downloadButton = (label: string): ReactElement => (
    <button type="button" className={buttonClass} onClick={onDownload}>
      {label}
    </button>
  );

  let body: ReactElement;
  switch (status.kind) {
    case 'checking':
      body = <p>Checking speech model…</p>;
      break;
    case 'ready':
      body = (
        <p>
          Speech model ready{status.version ? ` (version ${status.version})` : ''}. Works offline.
        </p>
      );
      break;
    case 'missing':
    case 'evicted':
      body = (
        <>
          <p>
            {status.kind === 'evicted'
              ? 'The speech model was removed from browser storage.'
              : 'Speech model not installed.'}{' '}
            Download size is about {size}.
          </p>
          <div className="flex gap-2">
            {downloadButton('Download model')}
            {typingButton}
          </div>
        </>
      );
      break;
    case 'downloading': {
      const percent = clampPercent(status.progress);
      body = (
        <>
          <p>Downloading speech model ({size})…</p>
          <progress value={percent} max={100} aria-label="Model download progress">
            {percent}%
          </progress>
          <span>{percent}%</span>
          <div>{typingButton}</div>
        </>
      );
      break;
    }
    case 'failed':
      body = (
        <>
          <p role="alert">Model download failed: {status.reason}</p>
          <div className="flex gap-2">
            {downloadButton('Retry')}
            {typingButton}
          </div>
        </>
      );
      break;
  }

  return (
    <section aria-label="Speech model status" aria-live="polite" className="model-status-card">
      {body}
    </section>
  );
}
