import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  captureSessionReducer,
  initialCaptureSessionState,
  selectCaptureSessionView,
  useCaptureSession,
  type CaptureSessionAction,
  type CaptureSessionState,
} from './useCaptureSession';

type Draft = { text: string };
const run = (actions: CaptureSessionAction<Draft>[]): CaptureSessionState<Draft> =>
  actions.reduce(captureSessionReducer<Draft>, initialCaptureSessionState<Draft>());

describe('captureSessionReducer', () => {
  it('shows a processing state while transcribing (Req 5.10)', () => {
    const s = run([{ type: 'transcription_started' }]);
    expect(selectCaptureSessionView(s).processing).toBe(true);
  });

  it('keeps Raw_Transcript separate from the edited transcript (Req 5.12)', () => {
    const s = run([
      { type: 'transcription_succeeded', text: 'do kilo aata' },
      { type: 'transcript_edited', text: '2 kg atta' },
    ]);
    expect(s.rawTranscript).toBe('do kilo aata');
    expect(s.transcript).toBe('2 kg atta');
  });

  it('offers retry and typing, with no draft, for a blank transcript (Req 6.5)', () => {
    const s = run([{ type: 'transcription_succeeded', text: '   ' }]);
    const v = selectCaptureSessionView(s);
    expect(v.offerRetryAndTyping).toBe(true);
    expect(v.draft).toBeNull();
    expect(
      captureSessionReducer(s, { type: 'draft_parsed', revision: s.revision, draft: { text: 'x' } })
        .draft,
    ).toBeNull();
  });

  it('records failure reason and keeps typing available (Req 5.9)', () => {
    const s = run([{ type: 'transcription_failed', reason: 'boom' }]);
    expect(s.failureReason).toBe('boom');
    expect(selectCaptureSessionView(s).offerRetryAndTyping).toBe(true);
  });

  it('discards stale parse results after an edit (Req 6.4)', () => {
    const a = run([{ type: 'transcript_edited', text: 'a' }]);
    const b = captureSessionReducer(a, { type: 'transcript_edited', text: 'ab' });
    const stale = captureSessionReducer(b, {
      type: 'draft_parsed',
      revision: a.revision,
      draft: { text: 'a' },
    });
    expect(stale.draft).toBeNull();
  });
});

describe('useCaptureSession', () => {
  it('re-parses the edited transcript', async () => {
    const seen: string[] = [];
    const { result } = renderHook(() =>
      useCaptureSession<Draft>({
        parse: (t) => {
          seen.push(t);
          return { text: t };
        },
      }),
    );
    act(() => result.current.transcriptionSucceeded('do kilo aata'));
    await waitFor(() => expect(result.current.session.draft).toEqual({ text: 'do kilo aata' }));
    act(() => result.current.editTranscript('2 kg atta'));
    await waitFor(() => expect(result.current.session.draft).toEqual({ text: '2 kg atta' }));
    expect(seen).toEqual(['do kilo aata', '2 kg atta']);
    expect(result.current.session.rawTranscript).toBe('do kilo aata');
  });
});
