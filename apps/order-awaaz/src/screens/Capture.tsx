import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { DEMO_SHOP_ID } from '@awaaz-kit/local-data';
import { SAMPLE_UTTERANCES } from '@awaaz-kit/speech-provider';
import {
  MicButton,
  ModelStatusCard,
  SampleUtteranceChips,
  TranscriptEditor,
} from '@awaaz-kit/shared-ui';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useData, useOrderCapture, useSpeechProvider } from '../providers/AppProviders';
import { createOrderParser } from '../capture/orderParser';
import { useModelStatus } from '../capture/useModelStatus';
import { useVoiceRecorder } from '../capture/useVoiceRecorder';

const ORDER_SAMPLES = SAMPLE_UTTERANCES.filter((s) => s.app === 'order').map((s) => s.text);

export default function Capture(): ReactElement {
  const navigate = useNavigate();
  const { repos } = useData();
  const provider = useSpeechProvider();
  const capture = useOrderCapture();
  const { session, editTranscript, submitTyped, setParser } = capture;
  const customerSelectId = useId();
  const typedRef = useRef<HTMLDivElement>(null);

  const products = useLiveQuery(() => repos.products.watchActive(DEMO_SHOP_ID), [repos]);
  const customers = useLiveQuery(() => repos.customers.watch(DEMO_SHOP_ID), [repos]);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const recorder = useVoiceRecorder(provider, capture);
  const model = useModelStatus(null);

  const parser = useMemo(
    () =>
      products && customers
        ? createOrderParser({
            shopId: DEMO_SHOP_ID,
            products,
            customers,
            selectedCustomerId: customerId,
          })
        : null,
    [products, customers, customerId],
  );

  // Register the catalog and customer aware parser; re-parse the current text when it changes.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const editRef = useRef(editTranscript);
  editRef.current = editTranscript;
  useEffect(() => {
    setParser(parser);
    const current = sessionRef.current;
    if (parser && current.revision > 0 && !current.blank) editRef.current(current.transcript);
    return () => setParser(null);
  }, [parser, setParser]);

  const focusTyping = (): void => {
    typedRef.current?.querySelector('textarea')?.focus();
  };

  const lineCount = session.draft?.lines.length ?? 0;
  const canContinue = session.draft !== null && lineCount > 0;

  return (
    <section className="flex flex-col gap-6" aria-labelledby="capture-heading">
      <h2 id="capture-heading" className="text-lg font-semibold">
        Capture an order
      </h2>

      <div className="flex flex-col gap-1">
        <label htmlFor={customerSelectId} className="font-semibold">
          Customer
        </label>
        <select
          id={customerSelectId}
          value={customerId ?? ''}
          onChange={(e) => setCustomerId(e.target.value === '' ? null : e.target.value)}
          className="min-h-[44px] rounded-[var(--radius)] border border-border bg-field px-2"
        >
          <option value="">Walk-in</option>
          {(customers ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <MicButton
        state={recorder.snapshot.state}
        elapsedMs={recorder.snapshot.elapsedMs}
        errorKind={recorder.errorKind}
        onStart={recorder.start}
        onStop={recorder.stop}
        onRetry={recorder.retry}
        onUseTyping={focusTyping}
      />

      {session.processing ? (
        <p role="status" aria-live="polite">
          Transcribing…
        </p>
      ) : null}
      {session.transcription === 'failed' ? (
        <p role="alert" className="text-danger">
          Could not transcribe the recording
          {session.failureReason ? `: ${session.failureReason}` : ''}. You can record again or type
          the order below.
        </p>
      ) : null}
      {session.blank ? (
        <p role="status">We did not catch anything. Record again or type the order below.</p>
      ) : null}

      <ModelStatusCard
        status={model.status}
        approxSizeBytes={model.approxBytes}
        onDownload={model.download}
        onContinueTyping={focusTyping}
      />

      <div ref={typedRef} className="flex flex-col gap-4">
        <TranscriptEditor
          value={session.transcript}
          {...(session.rawTranscript !== null ? { rawTranscript: session.rawTranscript } : {})}
          label="Order text"
          submitLabel="Check order"
          onChange={editTranscript}
          onSubmit={submitTyped}
        />
        <SampleUtteranceChips samples={ORDER_SAMPLES} onSelect={submitTyped} />
      </div>

      {session.draft !== null ? (
        <p role="status" aria-live="polite" data-testid="parse-summary">
          {lineCount === 0
            ? 'No items found yet. Try adding quantity and item name.'
            : `${lineCount} ${lineCount === 1 ? 'item' : 'items'} found.`}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!canContinue}
        onClick={() => void navigate('/resolve')}
        className="touch-target rounded-[var(--radius)] bg-accent px-4 py-3 font-semibold text-accent-contrast disabled:opacity-60"
      >
        Continue to review items
      </button>
    </section>
  );
}
