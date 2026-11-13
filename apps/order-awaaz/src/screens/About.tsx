import { useMemo, useState, type ReactElement } from 'react';
import { clearAll, exportAll } from '@awaaz-kit/local-data';
import { PipelineInspector, SyncSettings } from '@awaaz-kit/shared-ui';
import { downloadJson } from '../about/downloadJson';
import { toInspectorProps } from '../about/inspectorView';
import { getPackageManifest } from '../about/packageManifest';
import { useActiveShop } from '../hooks/useActiveShop';
import { useData, useOrderCapture } from '../providers/AppProviders';
import { useSync } from '../providers/SyncProvider';

const btn = 'min-h-11 min-w-11 rounded-md border px-4 py-2';

type Confirming = 'reset' | 'clear' | null;

/** About: pipeline inspector, Reset demo, local data export and clear, what syncs, package manifest (Req 3.9, 15.9, 1.3). */
export default function About(): ReactElement {
  const { db } = useData();
  const { session } = useOrderCapture();
  const { chooseDemoShop } = useActiveShop();
  const sync = useSync();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const manifest = getPackageManifest();
  const inspector = useMemo(() => toInspectorProps(session.draft), [session.draft]);

  const run = async (action: () => Promise<string>, failure: string): Promise<void> => {
    try {
      setMessage({ text: await action(), error: false });
    } catch {
      setMessage({ text: failure, error: true });
    }
  };

  const onExport = (): Promise<void> =>
    run(async () => {
      downloadJson('order-awaaz-export.json', await exportAll(db));
      return 'Exported. The file was saved from this device only.';
    }, 'Could not export local data.');

  const onReset = (): Promise<void> => {
    setConfirming(null);
    return run(async () => {
      await chooseDemoShop();
      return 'Demo shop restored with its seeded catalog and sample customers.';
    }, 'Could not reset the demo shop.');
  };

  const onClear = (): Promise<void> => {
    setConfirming(null);
    return run(async () => {
      await clearAll(db);
      window.location.reload();
      return 'Local data cleared.';
    }, 'Could not clear local data.');
  };

  return (
    <section className="space-y-6" aria-labelledby="about-heading">
      <h2 id="about-heading" className="text-lg font-semibold">
        About Order Awaaz
      </h2>

      {message ? (
        <p role={message.error ? 'alert' : 'status'} className="rounded-md border p-3">
          {message.error ? 'Error: ' : ''}
          {message.text}
        </p>
      ) : null}

      <section aria-labelledby="about-inspector" className="space-y-2">
        <h3 id="about-inspector" className="font-semibold">
          How it understood the last order
        </h3>
        <PipelineInspector {...inspector} />
      </section>

      <section aria-labelledby="about-demo" className="space-y-2">
        <h3 id="about-demo" className="font-semibold">
          Demo shop
        </h3>
        <p>
          The demo shop and its customers are fictional. Reset restores the seeded catalog and
          sample customers.
        </p>
        {confirming === 'reset' ? (
          <div role="alertdialog" aria-label="Confirm reset demo" className="space-y-2">
            <p>Reset the demo shop and make it the active shop?</p>
            <button type="button" className={btn} onClick={() => void onReset()}>
              Yes, reset demo
            </button>{' '}
            <button type="button" className={btn} onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className={btn} onClick={() => setConfirming('reset')}>
            Reset demo
          </button>
        )}
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
        <>
          <section aria-labelledby="about-sync-off" className="space-y-2">
            <h3 id="about-sync-off" className="font-semibold">
              Cloud sync
            </h3>
            <p role="status">
              Cloud sync is not configured in this build. Everything stays on this device.
            </p>
          </section>

          <section aria-labelledby="about-data" className="space-y-2">
            <h3 id="about-data" className="font-semibold">
              Data on this device
            </h3>
            <p>
              Orders, products and customers are saved in this browser. You can export or delete
              them here.
            </p>
            <button type="button" className={btn} onClick={() => void onExport()}>
              Export local data
            </button>{' '}
            {confirming === 'clear' ? (
              <div
                role="alertdialog"
                aria-label="Confirm clear local data"
                className="mt-2 space-y-2"
              >
                <p>
                  Delete all records on this device? This cannot be undone. Unsynced records will be
                  lost.
                </p>
                <button type="button" className={btn} onClick={() => void onClear()}>
                  Yes, delete local data
                </button>{' '}
                <button type="button" className={btn} onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className={btn} onClick={() => setConfirming('clear')}>
                Clear local data
              </button>
            )}
          </section>

          <section aria-labelledby="about-sync" className="space-y-2">
            <h3 id="about-sync" className="font-semibold">
              What syncs
            </h3>
            <p>
              Nothing leaves this device unless you turn on cloud sync and sign in. When on, your
              orders, products and customers (including customer phone numbers) are copied to your
              private Appwrite account over a secure connection. Audio is never uploaded.
              Transcripts stay on this device unless you turn on Sync transcripts.
            </p>
          </section>
        </>
      )}
      {sync.reportText ? <p role="status">{sync.reportText}</p> : null}

      <section aria-labelledby="about-kit" className="space-y-2">
        <h3 id="about-kit" className="font-semibold">
          Powered by Awaaz Kit
        </h3>
        {manifest.length === 0 ? (
          <p>Package list is not available in this build.</p>
        ) : (
          <ul className="space-y-1">
            {manifest.map((p) => (
              <li key={p.name}>
                <span className="font-medium">{p.name}</span> <span>{p.version}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
