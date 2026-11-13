import { useState, type FormEvent, type ReactElement } from 'react';

export interface SyncCredentials {
  email: string;
  password: string;
}

export interface SyncSettingsProps {
  /** Whether the user has explicitly opted in to cloud sync. */
  optedIn: boolean;
  signedIn: boolean;
  /** Signed-in account label, shown when available. */
  accountEmail?: string;
  /** "Sync transcripts" setting; must default to false after opt-in. */
  syncTranscripts: boolean;
  /** Sign-in error message from the last attempt. */
  signInError?: string;
  signingIn?: boolean;
  onOptInChange: (optedIn: boolean) => void;
  onSignIn: (credentials: SyncCredentials) => void;
  onSignOut: () => void;
  onSyncTranscriptsChange: (enabled: boolean) => void;
  onExportData: () => void;
  onClearData: () => void;
}

const buttonClass = 'touch-target ak-btn ak-btn-secondary';

/**
 * Cloud sync settings: explicit opt-in, sign-in, plain-language data description,
 * transcript toggle (off by default), local export and clear (Req 15.9, 16.20, 18.3).
 * Pure presentation: all actions are callbacks.
 */
export function SyncSettings({
  optedIn,
  signedIn,
  accountEmail,
  syncTranscripts,
  signInError,
  signingIn = false,
  onOptInChange,
  onSignIn,
  onSignOut,
  onSyncTranscriptsChange,
  onExportData,
  onClearData,
}: SyncSettingsProps): ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSignIn({ email: email.trim(), password });
  };

  return (
    <section aria-label="Cloud sync settings" className="sync-settings">
      <h2>Cloud sync</h2>
      <p>
        Cloud sync is off unless you turn it on. Until you opt in and sign in, nothing leaves this
        device.
      </p>

      <section aria-label="What syncs">
        <h3>What syncs</h3>
        <p>
          When on, your orders, bills, products and customers (including customer phone numbers) are
          copied to your private Appwrite account over a secure connection. Audio is never uploaded.
          Transcripts stay on this device unless you turn on Sync transcripts below.
        </p>
      </section>

      <label className="ak-check">
        <input
          type="checkbox"
          checked={optedIn}
          onChange={(e) => onOptInChange(e.target.checked)}
        />
        <span>Turn on cloud sync</span>
      </label>
      <p>{optedIn ? 'Cloud sync: opted in' : 'Cloud sync: off'}</p>

      {optedIn && !signedIn && (
        <form onSubmit={submit} aria-label="Sign in to sync" className="flex flex-col gap-3">
          <label className="ak-field">
            <span className="ak-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="touch-target ak-input"
            />
          </label>
          <label className="ak-field">
            <span className="ak-label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="touch-target ak-input"
            />
          </label>
          {signInError && (
            <p role="alert" className="ak-field-error">
              Sign-in failed: {signInError}
            </p>
          )}
          <button
            type="submit"
            className="touch-target ak-btn ak-btn-primary"
            disabled={signingIn}
            aria-busy={signingIn}
          >
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}

      {optedIn && signedIn && (
        <div>
          <p>Signed in{accountEmail ? ` as ${accountEmail}` : ''}.</p>
          <button type="button" className={buttonClass} onClick={onSignOut}>
            Sign out
          </button>
          <label className="ak-check">
            <input
              type="checkbox"
              checked={syncTranscripts}
              onChange={(e) => onSyncTranscriptsChange(e.target.checked)}
            />
            <span>Sync transcripts</span>
          </label>
          <p>
            {syncTranscripts
              ? 'Sync transcripts: on. What you said, as text, is uploaded with each order.'
              : 'Sync transcripts: off. What you said stays on this device.'}
          </p>
        </div>
      )}

      <section aria-label="Local data">
        <h3>Data on this device</h3>
        <button type="button" className={buttonClass} onClick={onExportData}>
          Export local data
        </button>
        {confirmingClear ? (
          <div role="alertdialog" aria-label="Confirm clear local data">
            <p>
              Delete all records on this device? This cannot be undone. Unsynced records will be
              lost.
            </p>
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                setConfirmingClear(false);
                onClearData();
              }}
            >
              Yes, delete local data
            </button>
            <button type="button" className={buttonClass} onClick={() => setConfirmingClear(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className={buttonClass} onClick={() => setConfirmingClear(true)}>
            Clear local data
          </button>
        )}
      </section>
    </section>
  );
}
