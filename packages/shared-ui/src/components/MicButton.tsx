import type { ReactElement } from 'react';

/** Mirrors the Voice_Capture Recording_State values (Req 4.2) without importing that package. */
export type MicRecordingState =
  'idle' | 'requesting_permission' | 'recording' | 'stopped' | 'error';

export type MicErrorKind = 'permission_denied' | 'no_device' | 'unknown';

export interface MicButtonProps {
  state: MicRecordingState;
  /** Elapsed recording time in milliseconds. */
  elapsedMs?: number;
  /** Reason for the error state; selects the message shown. */
  errorKind?: MicErrorKind;
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
  /** Called when the user chooses typed input after an error. */
  onUseTyping?: () => void;
  disabled?: boolean;
}

/** Formats milliseconds as m:ss. */
export function formatElapsed(ms: number | undefined): string {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const ERROR_MESSAGES: Record<MicErrorKind, string> = {
  permission_denied:
    'Microphone access was denied. Allow microphone access in your browser settings, or type the order instead.',
  no_device: 'No microphone was found on this device. You can type the order instead.',
  unknown: 'Recording failed. Try again, or type the order instead.',
};

interface Presentation {
  label: string;
  status: string;
  className: string;
}

function present(state: MicRecordingState, elapsed: string): Presentation {
  const base =
    'touch-target inline-flex items-center justify-center gap-2 rounded-[var(--radius)] px-6 py-3 text-lg font-semibold disabled:cursor-not-allowed disabled:opacity-60';
  switch (state) {
    case 'requesting_permission':
      return {
        label: 'Waiting for microphone',
        status: 'Waiting for microphone permission',
        className: `${base} bg-surface text-ink border-2 border-border`,
      };
    case 'recording':
      return {
        label: 'Stop',
        status: `Recording, ${elapsed} elapsed`,
        className: `${base} bg-danger text-white`,
      };
    case 'stopped':
      return {
        label: 'Retry',
        status: 'Recording stopped',
        className: `${base} bg-surface text-ink border-2 border-ink`,
      };
    case 'error':
      return {
        label: 'Retry',
        status: 'Recording error',
        className: `${base} bg-surface text-ink border-2 border-danger`,
      };
    default:
      return {
        label: 'Start',
        status: 'Ready to record',
        className: `${base} bg-accent text-accent-contrast`,
      };
  }
}

/**
 * The single primary microphone control with visible Start, Stop and Retry states
 * (Req 17.3), an accessible name, an `aria-live` status and an elapsed timer (Req 4.3).
 */
export function MicButton(props: MicButtonProps): ReactElement {
  const { state, elapsedMs, errorKind = 'unknown', onStart, onStop, onRetry, onUseTyping } = props;
  const elapsed = formatElapsed(elapsedMs);
  const view = present(state, elapsed);
  const busy = state === 'requesting_permission';

  const handleClick = (): void => {
    if (state === 'idle') onStart();
    else if (state === 'recording') onStop();
    else if (state === 'stopped' || state === 'error') onRetry();
  };

  return (
    <div className="flex flex-col items-center gap-3" data-state={state}>
      <button
        type="button"
        className={view.className}
        onClick={handleClick}
        disabled={props.disabled === true || busy}
        aria-label={`${view.label} recording`}
        aria-busy={busy}
      >
        <span aria-hidden="true">{state === 'recording' ? '■' : state === 'idle' ? '●' : '↻'}</span>
        <span aria-hidden="true">{view.label}</span>
      </button>
      <p role="status" aria-live="polite" className="text-base text-muted">
        {view.status}
      </p>
      {state === 'recording' || state === 'stopped' ? (
        <p
          className="text-2xl font-semibold tabular-nums"
          aria-hidden="true"
          data-testid="mic-elapsed"
        >
          {elapsed}
        </p>
      ) : null}
      {state === 'error' ? (
        <div role="alert" className="flex flex-col items-center gap-2 text-center text-danger">
          <p>{ERROR_MESSAGES[errorKind]}</p>
          {onUseTyping ? (
            <button
              type="button"
              className="touch-target rounded-[var(--radius)] border-2 border-ink px-4 py-2 font-semibold text-ink"
              onClick={onUseTyping}
            >
              Type instead
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
