import { useState, type FormEvent, type ReactElement } from 'react';
import { ModelStatusCard, type ModelStatusState } from './ModelStatusCard';
import { GhostMascot } from '../theme/Spooky';

export interface OnboardingProps {
  /** Called when the user picks the fictional Demo_Shop. */
  onSelectDemoShop: () => void | Promise<void>;
  /** Called with a trimmed, non-empty local shop name. */
  onCreateLocalShop: (name: string) => void | Promise<void>;
  modelStatus: ModelStatusState;
  modelApproxSizeBytes: number;
  onDownloadModel: () => void;
  onContinueTyping: () => void;
}

/** First-run flow: Demo_Shop or local shop, local-storage note, model status (Req 3.1, 3.2, 3.4, 3.5). */
export function Onboarding({
  onSelectDemoShop,
  onCreateLocalShop,
  modelStatus,
  modelApproxSizeBytes,
  onDownloadModel,
  onContinueTyping,
}: OnboardingProps): ReactElement {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Enter a shop name.');
      return;
    }
    setError(null);
    void onCreateLocalShop(trimmed);
  };

  return (
    <section aria-label="Welcome" className="onboarding">
      <div className="ak-hero">
        <GhostMascot size={88} />
        <p className="ak-eyebrow">Speak to the spirits of your shop</p>
        <h1>Welcome</h1>
        <p className="ak-lede">
          Your data is stored locally on this device. No account or sign-in is needed to use the
          app.
        </p>
      </div>
      <div className="ak-card">
        <h2>Try the Demo Shop</h2>
        <p className="ak-help">
          A fictional shop with sample products and sample customers. All names are fictional.
        </p>
        <button
          type="button"
          className="touch-target ak-btn ak-btn-primary ak-btn-lg"
          onClick={() => void onSelectDemoShop()}
        >
          Use Demo Shop
        </button>
      </div>
      <form onSubmit={submit} noValidate className="ak-card">
        <h2>Or create your own shop</h2>
        <div>
          <label htmlFor="onboarding-shop-name" className="ak-label">
            Shop name
          </label>
          <input
            id="onboarding-shop-name"
            type="text"
            value={name}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'onboarding-shop-name-error' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            className="touch-target ak-input"
          />
          {error ? (
            <p id="onboarding-shop-name-error" role="alert" className="ak-field-error">
              {error}
            </p>
          ) : null}
        </div>
        <button type="submit" className="touch-target ak-btn ak-btn-secondary">
          Create shop
        </button>
      </form>
      <ModelStatusCard
        status={modelStatus}
        approxSizeBytes={modelApproxSizeBytes}
        onDownload={onDownloadModel}
        onContinueTyping={onContinueTyping}
      />
    </section>
  );
}
