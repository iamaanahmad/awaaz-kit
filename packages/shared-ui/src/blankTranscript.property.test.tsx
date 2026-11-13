import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertProperty, fc } from '../../../tests/setup/fast-check';
import { TranscriptEditor } from './components/TranscriptEditor';
import {
  captureSessionReducer,
  initialCaptureSessionState,
  selectCaptureSessionView,
  useCaptureSession,
  type CaptureSessionAction,
  type CaptureSessionState,
} from './hooks/useCaptureSession';

afterEach(cleanup);

type Draft = { lines: string[] };

// Whitespace characters (all stripped by String.prototype.trim), including Unicode spaces.
const WS_CHARS = [' ', '\t', '\n', '\r', '\v', '\f', '\u00a0', '\u2003', '\u3000', '\ufeff'];
const blankArb = fc
  .array(fc.constantFrom(...WS_CHARS), { minLength: 0, maxLength: 24 })
  .map((chars) => chars.join(''));
const nonBlankArb = fc
  .tuple(blankArb, fc.constantFrom('2 kg atta', 'do kilo chawal', 'one packet milk'), blankArb)
  .map(([a, b, c]) => a + b + c);

const prefixActionArb: fc.Arbitrary<CaptureSessionAction<Draft>> = fc.oneof(
  nonBlankArb.map((text) => ({ type: 'transcription_succeeded' as const, text })),
  nonBlankArb.map((text) => ({ type: 'typed_submitted' as const, text })),
  fc.constant({ type: 'transcription_started' as const }),
  fc.string({ minLength: 1, maxLength: 8 }).map((reason) => ({
    type: 'transcription_failed' as const,
    reason,
  })),
);

const blankActionArb: fc.Arbitrary<CaptureSessionAction<Draft>> = fc.oneof(
  blankArb.map((text) => ({ type: 'transcription_succeeded' as const, text })),
  blankArb.map((text) => ({ type: 'transcript_edited' as const, text })),
  blankArb.map((text) => ({ type: 'typed_submitted' as const, text })),
);

describe('blank transcripts', () => {
  // Feature: awaaz-kit, Property 31: Blank transcripts create nothing
  // **Validates: Requirements 6.5**
  it('Property 31: blank text never yields a draft, parse call or enabled submit', () =>
    assertProperty(
      fc.property(
        fc.array(prefixActionArb, { maxLength: 5 }),
        fc.option(fc.constant({ lines: ['atta'] } as Draft), { nil: null }),
        blankActionArb,
        (prefix, lateDraft, blankAction) => {
          // Reducer: a draft that existed before a blank edit is cleared and stale parses are ignored.
          let state: CaptureSessionState<Draft> = initialCaptureSessionState<Draft>();
          for (const action of prefix) {
            state = captureSessionReducer(state, action);
            state = captureSessionReducer(state, {
              type: 'draft_parsed',
              revision: state.revision,
              draft: { lines: ['atta'] },
            });
          }
          const staleRevision = state.revision;
          state = captureSessionReducer(state, blankAction);
          expect(state.blank).toBe(true);
          expect(state.draft).toBeNull();
          expect(selectCaptureSessionView(state).offerRetryAndTyping).toBe(true);
          for (const revision of [staleRevision, state.revision]) {
            const after = captureSessionReducer(state, {
              type: 'draft_parsed',
              revision,
              draft: lateDraft,
            });
            expect(after.draft).toBeNull();
          }

          // TranscriptEditor: submit is disabled and never fires.
          const text = (blankAction as { text: string }).text;
          const onSubmit = vi.fn();
          const editor = render(
            <TranscriptEditor value={text} onChange={() => {}} onSubmit={onSubmit} />,
          );
          const button = screen.getByRole('button', { name: 'Parse' }) as HTMLButtonElement;
          expect(button.disabled).toBe(true);
          fireEvent.click(button);
          fireEvent.submit(screen.getByRole('form', { name: 'Transcript editor' }));
          expect(onSubmit).not.toHaveBeenCalled();
          editor.unmount();

          // Hook: parse is never called and no draft appears.
          const parse = vi.fn(async () => ({ lines: ['atta'] }) as Draft);
          const { result, unmount } = renderHook(() => useCaptureSession<Draft>({ parse }));
          act(() => {
            if (blankAction.type === 'transcription_succeeded')
              result.current.transcriptionSucceeded(text);
            else if (blankAction.type === 'transcript_edited') result.current.editTranscript(text);
            else result.current.submitTyped(text);
          });
          expect(parse).not.toHaveBeenCalled();
          expect(result.current.session.draft).toBeNull();
          expect(result.current.session.offerRetryAndTyping).toBe(true);
          unmount();
        },
      ),
    ));
});