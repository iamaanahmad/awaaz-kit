import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';
import { buildIndex } from '@awaaz-kit/catalog-matcher';
import { BillingWorkflowAdapter, setCustomer, type BillDraft } from '@awaaz-kit/domain-billing';
import { SAMPLE_UTTERANCES } from '@awaaz-kit/speech-provider';
import { createVoiceCapture, type VoiceCaptureSnapshot } from '@awaaz-kit/voice-capture';
import {
  MicButton,
  ModelStatusCard,
  SampleUtteranceChips,
  TranscriptEditor,
  useCaptureSession,
  type MicErrorKind,
  type ModelStatusState,
} from '@awaaz-kit/shared-ui';
import { setBillDraft } from '../capture/billDraftStore';
import { useLive, useShops } from '../data/homeHooks';
import { useServices } from '../providers/AppProviders';

const MODEL_APPROX_BYTES = 150 * 1024 * 1024;
const BILL_SAMPLES = SAMPLE_UTTERANCES.filter((s) => s.app === 'bill').map((s) => s.text);

function micErrorKind(snapshot: VoiceCaptureSnapshot): MicErrorKind {
  const kind = snapshot.error?.kind;
  return kind === 'permission_denied' || kind === 'no_device' ? kind : 'unknown';
}

export default function Capture(): ReactElement {
  const { repos, speech } = useServices();
  const navigate = useNavigate();
  const shops = useShops();
  const shop = shops ? (shops.find((s) => s.isDemo) ?? shops[0]) : undefined;
  const shopId = shop?.id;

  const products = useLive(() => repos.products.watchActive(shopId ?? ''), [repos, shopId]);
  const customers = useLive(() => repos.customers.watch(shopId ?? ''), [repos, shopId]);

  const adapter = useMemo(() => new BillingWorkflowAdapter(), []);
  const parseText = useCallback(
    (text: string): BillDraft | null => {
      if (!shopId || !products) return null;
      return adapter.parse(text, {
        shopId,
        customers: customers ?? [],
        catalog: buildIndex(shopId, products),
        makeId: () => crypto.randomUUID(),
        now: () => new Date(),
        config: { taxEnabled: false },
      });
    },
    [adapter, shopId, products, customers],
  );

  const capture = useCaptureSession<BillDraft>({ parse: parseText });
  const { session } = capture;

  // Re-parse when the catalog or customers load after the transcript was entered.
  const { editTranscript } = capture;
  const transcriptRef = useRef(session.transcript);
  transcriptRef.current = session.transcript;
  const loaded = products !== undefined && customers !== undefined;
  useEffect(() => {
    if (loaded && transcriptRef.current.trim() !== '') editTranscript(transcriptRef.current);
  }, [loaded, editTranscript]);

  // Voice capture: permission is requested only when the user taps Start (Req 4.1).
  const voice = useMemo(() => createVoiceCapture(), []);
  const [snapshot, setSnapshot] = useState<VoiceCaptureSnapshot>({
    state: voice.state,
    elapsedMs: voice.elapsedMs,
    error: voice.error,
  });
  const { setRecordingPhase } = capture;
  useEffect(
    () =>
      voice.subscribe((s) => {
        setSnapshot(s);
        setRecordingPhase(s.state);
      }),
    [voice, setRecordingPhase],
  );
  useEffect(() => () => voice.discard(), [voice]);

  const { startTranscription, transcriptionSucceeded, transcriptionFailed } = capture;
  const handleStop = useCallback(async () => {
    try {
      const audio = await voice.stop();
      startTranscription();
      try {
        const result = await speech.transcribe(audio, { language: 'auto' });
        transcriptionSucceeded(result.text);
      } catch (e) {
        transcriptionFailed(e instanceof Error ? e.message : 'Transcription failed.');
      } finally {
        voice.discard();
      }
    } catch (e) {
      transcriptionFailed(e instanceof Error ? e.message : 'Recording failed.');
    }
  }, [voice, speech, startTranscription, transcriptionSucceeded, transcriptionFailed]);

  // Speech model status; typed input stays available in every state (Req 5.4).
  const [modelStatus, setModelStatus] = useState<ModelStatusState>({ kind: 'checking' });
  const checkModel = useCallback(() => {
    setModelStatus({ kind: 'checking' });
    speech
      .initialize()
      .then((r) =>
        setModelStatus(
          r.ready
            ? r.modelVersion
              ? { kind: 'ready', version: r.modelVersion }
              : { kind: 'ready' }
            : { kind: 'missing' },
        ),
      )
      .catch((e: unknown) =>
        setModelStatus({
          kind: 'failed',
          reason: e instanceof Error ? e.message : 'Could not load the speech model.',
        }),
      );
  }, [speech]);
  useEffect(() => {
    checkModel();
  }, [checkModel]);

  const typedRef = useRef<HTMLDivElement>(null);
  const focusTyping = useCallback(() => {
    typedRef.current?.querySelector('textarea')?.focus();
  }, []);

  // undefined = follow the parsed draft; '' = walk-in / no customer.
  const [chosenCustomer, setChosenCustomer] = useState<string | undefined>(undefined);
  const customerValue = chosenCustomer ?? session.draft?.customerId ?? '';

  const submit = useCallback(
    (text: string) => {
      const draft = parseText(text);
      if (!draft) return;
      const id = chosenCustomer === undefined ? draft.customerId : chosenCustomer || null;
      setBillDraft(setCustomer(draft, id));
      void navigate('/lines');
    },
    [parseText, chosenCustomer, navigate],
  );

  if (shops === undefined) return <p role="status">Loading…</p>;
  if (!shop) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p>Set up a shop first.</p>
        <Link to="/" className="underline underline-offset-4">
          Go to Home
        </Link>
      </main>
    );
  }

  const draft = session.draft;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New bill</h1>
        <Link to="/" className="underline underline-offset-4">
          Home
        </Link>
      </header>

      <div className="flex flex-col gap-1">
        <label htmlFor="bill-customer" className="font-semibold">
          Customer (optional)
        </label>
        <select
          id="bill-customer"
          value={customerValue}
          onChange={(e) => setChosenCustomer(e.target.value)}
          className="touch-target ak-select"
        >
          <option value="">Walk-in / no customer</option>
          {(customers ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <ModelStatusCard
        status={modelStatus}
        approxSizeBytes={MODEL_APPROX_BYTES}
        onDownload={checkModel}
        onContinueTyping={focusTyping}
      />

      <MicButton
        state={snapshot.state}
        elapsedMs={snapshot.elapsedMs}
        errorKind={micErrorKind(snapshot)}
        onStart={() => void voice.start()}
        onStop={() => void handleStop()}
        onRetry={() => voice.retry()}
        onUseTyping={focusTyping}
      />

      {session.processing ? (
        <p role="status" aria-live="polite">
          Transcribing…
        </p>
      ) : null}
      {session.transcription === 'failed' ? (
        <p role="alert">
          Could not transcribe the recording
          {session.failureReason ? `: ${session.failureReason}` : ''}. Try again or type the bill
          below.
        </p>
      ) : null}
      {session.blank ? (
        <p role="status">Nothing was heard. Record again or type the bill below.</p>
      ) : null}

      <SampleUtteranceChips samples={BILL_SAMPLES} onSelect={capture.submitTyped} />

      <div ref={typedRef}>
        <TranscriptEditor
          value={session.transcript}
          {...(session.rawTranscript !== null ? { rawTranscript: session.rawTranscript } : {})}
          onChange={capture.editTranscript}
          onSubmit={submit}
          label="Bill text"
          submitLabel="Review lines"
        />
      </div>

      {draft ? (
        <p className="text-sm text-muted" data-testid="parse-summary">
          {draft.lines.length} {draft.lines.length === 1 ? 'line' : 'lines'} found.
        </p>
      ) : null}
    </main>
  );
}
