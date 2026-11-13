import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { PipelineInspector, SyncSettings, ThemeToggle } from '@awaaz-kit/shared-ui';
import { clearLocalData, downloadExport, resetDemo } from '../about/dataActions';
import { setInspectorEnabled, useInspectorEnabled } from '../about/inspectorPreference';
import { getPackageManifest } from '../about/packageManifest';
import { useServices } from '../providers/AppProviders';
import { useSync } from '../providers/SyncProvider';

type Notice = { kind: 'ok' | 'error'; text: string } | null;

const buttonClass = 'min-h-[44px] rounded-md border border-border px-4 font-medium';

export default function About(): ReactElement {
  const { db } = useServices();
  const sync = useSync();
  const inspectorOn = useInspectorEnabled();
  const manifest = getPackageManifest();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const run = async (action: () => Promise<void>, okText: string): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: 'ok', text: okText });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  const onExport = (): Promise<void> => run(() => downloadExport(db), 'Export downloaded.');
  const onClear = (): Promise<void> =>
    run(async () => {
      await clearLocalData(db);
      window.location.assign(import.meta.env.BASE_URL);
    }, 'Local data cleared.');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">About Bill Awaaz</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/" className="underline underline-offset-4">
            Home
          </Link>
        </div>
      </header>

      <section
        aria-labelledby="about-inspector"
        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
      >
        <h2 id="about-inspector" className="text-lg font-semibold">
          Show how it understood this
        </h2>
        <label className="flex min-h-[44px] items-center gap-3">
          <input
            type="checkbox"
            checked={inspectorOn}
            onChange={(e) => setInspectorEnabled(e.target.checked)}
            className="h-5 w-5"
          />
          <span>Enable the pipeline inspector</span>
        </label>
        {inspectorOn ? <PipelineInspector raw="" normalized={null} lines={[]} /> : null}
      </section>

      <section
        aria-labelledby="about-data"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      >
        <h2 id="about-data" className="text-lg font-semibold">
          Your data
        </h2>
        <p className="text-sm">
          Everything is stored on this device. Nothing leaves it unless you sign in and turn on
          cloud sync. If you do, only saved orders and bills, your catalog and customer names sync
          to your cloud account. Voice recordings never leave this device, and transcripts sync only
          if you switch that on separately.
        </p>
        <div className="flex flex-wrap gap-2">
          {sync.configured ? null : (
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => void onExport()}
            >
              Export local data
            </button>
          )}
          <button
            type="button"
            className={buttonClass}
            disabled={busy}
            onClick={() => void run(() => resetDemo(db), 'Demo shop restored.')}
          >
            Reset demo
          </button>
          {sync.configured ? null : (
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => setConfirmClear(true)}
            >
              Clear local data
            </button>
          )}
        </div>
        {confirmClear ? (
          <div
            role="alertdialog"
            aria-labelledby="clear-title"
            className="flex flex-col gap-2 rounded-md border border-border p-3"
          >
            <p id="clear-title" className="font-medium">
              Delete all bills, catalog and settings on this device? This cannot be undone. Export
              first if you want a copy.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await clearLocalData(db);
                    setConfirmClear(false);
                    window.location.assign(import.meta.env.BASE_URL);
                  }, 'Local data cleared.')
                }
              >
                Yes, delete everything
              </button>
              <button type="button" className={buttonClass} onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <p role="status" className={notice?.kind === 'error' ? 'text-red-700' : ''}>
          {notice?.text ?? ''}
        </p>
      </section>

      {sync.configured ? (
        <SyncSettings
          optedIn={sync.optedIn}
          signedIn={sync.signedIn}
          {...(sync.accountEmail ? { accountEmail: sync.accountEmail } : {})}
          syncTranscripts={sync.syncTranscripts}
          {...(sync.signInError ? { signInError: sync.signInError } : {})}
          signingIn={sync.signingIn}
          onOptInChange={(v) => void sync.setOptIn(v)}
          onSignIn={(c) => void sync.signIn(c.email, c.password)}
          onSignOut={() => void sync.signOut()}
          onSyncTranscriptsChange={(v) => void sync.setSyncTranscripts(v)}
          onExportData={() => void onExport()}
          onClearData={() => void onClear()}
        />
      ) : (
        <section
          aria-labelledby="about-sync-off"
          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
        >
          <h2 id="about-sync-off" className="text-lg font-semibold">
            Cloud sync
          </h2>
          <p role="status">
            Cloud sync is not configured in this build. Everything stays on this device.
          </p>
        </section>
      )}
      {sync.reportText ? <p role="status">{sync.reportText}</p> : null}

      <section
        aria-labelledby="about-powered"
        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
      >
        <h2 id="about-powered" className="text-lg font-semibold">
          Powered by Awaaz Kit
        </h2>
        {manifest.length === 0 ? (
          <p className="text-sm text-muted">Package list is added at build time.</p>
        ) : (
          <ul className="text-sm" aria-label="Shared packages">
            {manifest.map((p) => (
              <li key={p.name} className="flex justify-between gap-2">
                <span>{p.name}</span>
                <span className="tabular-nums">{p.version}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
