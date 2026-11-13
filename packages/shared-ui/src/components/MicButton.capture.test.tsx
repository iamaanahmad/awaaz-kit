import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MicButton } from './MicButton';
import type { MicErrorKind } from './MicButton';
import { TranscriptEditor } from './TranscriptEditor';
import { useCaptureSession } from '../hooks/useCaptureSession';
import type { RecordingPhase, UseCaptureSession } from '../hooks/useCaptureSession';

// Feature: awaaz-kit, component tests for microphone states
// **Validates: Requirements 4.2, 17.3, 17.4**

afterEach(cleanup);

let capture: UseCaptureSession<{ text: string }>;

/** Wires MicButton and the typed fallback to the CaptureSession hook, as the apps do. */
function Harness({ errorKind }: { errorKind?: MicErrorKind }) {
  const c = useCaptureSession<{ text: string }>({ parse: (t) => ({ text: t }) });
  capture = c;
  const [typingChosen, setTypingChosen] = useState(false);
  const phase = c.session.recording;
  return (
    <div>
      <MicButton
        state={phase}
        elapsedMs={3000}
        errorKind={errorKind}
        onStart={() => c.setRecordingPhase('requesting_permission')}
        onStop={() => c.setRecordingPhase('stopped')}
        onRetry={() => c.setRecordingPhase('requesting_permission')}
        onUseTyping={() => setTypingChosen(true)}
      />
      <TranscriptEditor
        value={c.session.transcript}
        onChange={c.editTranscript}
        onSubmit={c.submitTyped}
      />
      <p data-testid="typing-chosen">{String(typingChosen)}</p>
    </div>
  );
}

const setPhase = (phase: RecordingPhase) => act(() => capture.setRecordingPhase(phase));
const editor = () => screen.getByRole('textbox') as HTMLTextAreaElement;

describe('MicButton with CaptureSession', () => {
  it('idle: offers Start and announces readiness', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Ready to record');
    expect(editor().disabled).toBe(false);
  });

  it('requesting: Start moves the session to requesting_permission and disables the control', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(capture.session.recording).toBe('requesting_permission');
    const btn = screen.getByRole('button', { name: /recording/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toMatch(/permission/i);
    expect(editor().disabled).toBe(false);
  });

  it('recording: shows Stop with an elapsed-time announcement; Stop moves to stopped', () => {
    render(<Harness />);
    setPhase('recording');
    expect(screen.getByRole('status').textContent).toBe('Recording, 0:03 elapsed');
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(capture.session.recording).toBe('stopped');
    expect(screen.getByRole('status').textContent).toBe('Recording stopped');
  });

  it('stopped: Retry restarts the permission request', () => {
    render(<Harness />);
    setPhase('stopped');
    fireEvent.click(screen.getByRole('button', { name: 'Retry recording' }));
    expect(capture.session.recording).toBe('requesting_permission');
  });

  it('error: announces an alert, offers Retry and typed input', () => {
    render(<Harness errorKind="unknown" />);
    setPhase('error');
    expect(screen.getByRole('alert').textContent).toMatch(/Recording failed/);
    expect(screen.getByRole('status').textContent).toBe('Recording error');
    expect(screen.getByRole('button', { name: 'Retry recording' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Type instead' }));
    expect(screen.getByTestId('typing-chosen').textContent).toBe('true');
  });

  it('denied: explains the denial, keeps typed input usable and produces a draft', async () => {
    render(<Harness errorKind="permission_denied" />);
    setPhase('error');
    expect(screen.getByRole('alert').textContent).toMatch(/denied/i);
    expect(editor().disabled).toBe(false);
    fireEvent.change(editor(), { target: { value: '2 kg atta' } });
    await act(async () => {
      fireEvent.submit(editor().closest('form') as HTMLFormElement);
    });
    expect(capture.session.transcript).toBe('2 kg atta');
    expect(capture.session.source).toBe('typed');
    expect(capture.session.draft).toEqual({ text: '2 kg atta' });
    expect(capture.session.recording).toBe('error');
  });

  it.each<RecordingPhase>(['idle', 'requesting_permission', 'recording', 'stopped', 'error'])(
    'typed input stays enabled in the %s state',
    (phase) => {
      render(<Harness />);
      setPhase(phase);
      expect(editor().disabled).toBe(false);
      expect(editor().readOnly).toBe(false);
    },
  );

  it('every state exposes a button with an accessible name and a polite live status', () => {
    render(<Harness />);
    for (const phase of [
      'idle',
      'requesting_permission',
      'recording',
      'stopped',
      'error',
    ] as RecordingPhase[]) {
      setPhase(phase);
      expect(screen.getByRole('button', { name: /recording$/ })).toBeTruthy();
      expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
    }
  });
});
