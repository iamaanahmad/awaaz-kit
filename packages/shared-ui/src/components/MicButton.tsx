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
  const base = 'touch-target ak-mic';
  switch (state) {
    case 'requesting_permission':
      return {
        label: 'Waiting for microphone',
        status: 'Waiting for microphone permission',
        className: `${base} ak-mic-neutral`,
      };
    case 'recording':
      return {
        label: 'Stop',
        status: `Recording, ${elapsed} elapsed`,
        className: `${base} ak-mic-recording`,
      };
    case 'stopped':
      return {
        label: 'Retry',
        status: 'Recording stopped',
        className: `${base} ak-mic-neutral`,
      };
    case 'error':
      return {
        label: 'Retry',
        status: 'Recording error',
        className: `${base} ak-mic-neutral`,
      };
    default:
      return {
        label: 'Start',
        status: 'Ready to record',
        className: base,
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
    <div className="ak-mic-wrap" data-state={state}>
      <button
        type="button"
        className={view.className}
        onClick={handleClick}
        disabled={props.disabled === true || busy}
        aria-label={`${view.label} recording`}
        aria-busy={busy}
      >
        <span aria-hidden="true">{state === 'recording' ? '■' : state === 'idle' ? '🎙' : '↻'}</span>
        <span aria-hidden="true">{view.label}</span>
      </button>
      <p role="status" aria-live="polite" className="ak-mic-status">
        {view.status}
      </p>
      {state === 'recording' || state === 'stopped' ? (
        <p className="ak-mic-timer" aria-hidden="true" data-testid="mic-elapsed">
          {elapsed}
        </p>
      ) : null}
      {state === 'error' ? (
        <div role="alert" className="ak-mic-error">
          <p>{ERROR_MESSAGES[errorKind]}</p>
          {onUseTyping ? (
            <button
              type="button"
              className="touch-target ak-btn ak-btn-secondary"
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
