// Automated accessibility checks for shared-ui (Req 17.1, 17.4, 17.5, 17.8, 17.9).
//
// IMPORTANT: automated checks, including axe-core, cover only a subset of WCAG success criteria
// and do NOT prove WCAG compliance. jsdom has no layout engine, so colour contrast, real focus
// rendering and 360px reflow are not evaluated here (the `color-contrast` rule is disabled).
// Full validation needs manual testing with assistive technologies and expert review.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import axe from 'axe-core';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ClarificationPrompt,
  ConfirmButton,
  LineEditor,
  MicButton,
  ModelStatusCard,
  Onboarding,
  OnlineIndicator,
  PipelineInspector,
  ReviewCard,
  SampleUtteranceChips,
  StorageBanner,
  SyncBadge,
  SyncSettings,
  TranscriptEditor,
  UncertaintyBadge,
} from './index';

afterEach(cleanup);

const noop = (): void => {};
const tokensCss = readFileSync(resolve(process.cwd(), 'packages/shared-ui/src/tokens.css'), 'utf8');

async function violationsFor(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    // jsdom cannot compute layout or colours.
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

const mic = { onStart: noop, onStop: noop, onRetry: noop };
const syncSettings = {
  optedIn: true,
  signedIn: false,
  syncTranscripts: false,
  onOptInChange: noop,
  onSignIn: noop,
  onSignOut: noop,
  onSyncTranscriptsChange: noop,
  onExportData: noop,
  onClearData: noop,
};

const cases: Array<[string, () => ReactElement]> = [
  ['MicButton idle', () => <MicButton state="idle" {...mic} />],
  ['MicButton recording', () => <MicButton state="recording" elapsedMs={5000} {...mic} />],
  ['MicButton stopped', () => <MicButton state="stopped" {...mic} />],
  [
    'MicButton error',
    () => <MicButton state="error" errorKind="permission_denied" onUseTyping={noop} {...mic} />,
  ],
  [
    'TranscriptEditor',
    () => (
      <TranscriptEditor
        value="do kilo atta"
        rawTranscript="do kilo aata"
        onChange={noop}
        onSubmit={noop}
      />
    ),
  ],
  ['TranscriptEditor blank', () => <TranscriptEditor value="" onChange={noop} />],
  [
    'SampleUtteranceChips',
    () => <SampleUtteranceChips samples={['2 kilo atta', 'ek litre doodh']} onSelect={noop} />,
  ],
  ...(['checking', 'missing', 'evicted'] as const).map((kind): [string, () => ReactElement] => [
    `ModelStatusCard ${kind}`,
    () => (
      <ModelStatusCard
        status={{ kind }}
        approxSizeBytes={1e8}
        onDownload={noop}
        onContinueTyping={noop}
      />
    ),
  ]),
  [
    'ModelStatusCard downloading',
    () => (
      <ModelStatusCard
        status={{ kind: 'downloading', progress: 0.4 }}
        approxSizeBytes={1e8}
        onDownload={noop}
        onContinueTyping={noop}
      />
    ),
  ],
  [
    'ModelStatusCard failed',
    () => (
      <ModelStatusCard
        status={{ kind: 'failed', reason: 'hash mismatch' }}
        approxSizeBytes={1e8}
        onDownload={noop}
        onContinueTyping={noop}
      />
    ),
  ],
  ...(['confirmed', 'needs_review', 'missing', 'unmatched'] as const).map(
    (status): [string, () => ReactElement] => [
      `UncertaintyBadge ${status}`,
      () => <UncertaintyBadge status={status} confidence={0.6} />,
    ],
  ),
  [
    'ClarificationPrompt',
    () => (
      <ClarificationPrompt
        clarification={{
          lineId: 'l1',
          field: 'product',
          prompt: 'Which atta?',
          candidates: [
            { id: 'a', name: 'Atta 1kg' },
            { id: 'b', name: 'Atta 5kg' },
          ],
        }}
        onSelectCandidate={noop}
      />
    ),
  ],
  [
    'LineEditor',
    () => (
      <LineEditor
        value={{ productName: 'Atta', quantity: 2, unit: 'kg', unitPricePaise: 4550 }}
        index={1}
        units={['kg', 'l']}
        onChange={noop}
        onRemove={noop}
      />
    ),
  ],
  [
    'ReviewCard',
    () => (
      <ReviewCard revision={1} issues={[]} canConfirm={true} onConfirm={noop} onDiscard={noop}>
        <p>Draft lines</p>
      </ReviewCard>
    ),
  ],
  [
    'ReviewCard blocked',
    () => (
      <ReviewCard
        revision={1}
        issues={[{ code: 'missing_price', message: 'Price missing', severity: 'error' } as never]}
        canConfirm={false}
        onConfirm={noop}
      >
        <p>Draft lines</p>
      </ReviewCard>
    ),
  ],
  [
    'ConfirmButton pending',
    () => <ConfirmButton canConfirm revision={1} pending onConfirm={noop} />,
  ],
  ['OnlineIndicator online', () => <OnlineIndicator online />],
  ['OnlineIndicator offline', () => <OnlineIndicator online={false} />],
  ['SyncBadge pending', () => <SyncBadge state={{ kind: 'pending', count: 2 }} onSyncNow={noop} />],
  [
    'SyncBadge failed',
    () => <SyncBadge state={{ kind: 'failed', reason: 'network' }} onRetry={noop} />,
  ],
  ['SyncBadge auth', () => <SyncBadge state={{ kind: 'auth' }} />],
  [
    'StorageBanner quota',
    () => <StorageBanner issue={{ kind: 'quota-exceeded' }} onRetry={noop} />,
  ],
  [
    'StorageBanner reload',
    () => <StorageBanner issue={{ kind: 'reload-required' }} onReload={noop} />,
  ],
  ['StorageBanner persist denied', () => <StorageBanner issue={{ kind: 'persist-denied' }} />],
  [
    'PipelineInspector',
    () => (
      <PipelineInspector
        raw="2 kilo atta"
        normalized={null}
        defaultOpen
        lines={[
          {
            lineId: 'l1',
            spokenName: 'atta',
            candidates: [],
            fields: [{ label: 'Quantity', value: '2', status: 'confirmed' }],
          },
        ]}
      />
    ),
  ],
  [
    'Onboarding',
    () => (
      <Onboarding
        onSelectDemoShop={noop}
        onCreateLocalShop={noop}
        modelStatus={{ kind: 'missing' }}
        modelApproxSizeBytes={1e8}
        onDownloadModel={noop}
        onContinueTyping={noop}
      />
    ),
  ],
  ['SyncSettings opted out', () => <SyncSettings {...syncSettings} optedIn={false} />],
  ['SyncSettings signed out', () => <SyncSettings {...syncSettings} />],
  [
    'SyncSettings signed in',
    () => <SyncSettings {...syncSettings} signedIn accountEmail="a@b.co" />,
  ],
];

describe('shared-ui accessibility (automated, not a WCAG compliance proof)', () => {
  it.each(cases)('axe-core finds no violations: %s', async (_name, make) => {
    const { container } = render(make());
    expect(await violationsFor(container)).toEqual([]);
  });

  // Req 17.2: primary controls are at least 44px. jsdom has no CSS, so assert the class hook.
  it.each(cases)('interactive controls carry a 44px target class: %s', (_name, make) => {
    const { container } = render(make());
    const controls = container.querySelectorAll<HTMLElement>(
      'button, select, textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
    );
    for (const el of controls) {
      const cls = el.className;
      const ok =
        /\btouch-target\b/.test(cls) || cls.includes('min-h-[44px]') || /\bmin-h-11\b/.test(cls);
      expect(
        ok,
        `<${el.tagName.toLowerCase()}> "${el.textContent?.trim()}" lacks a 44px class`,
      ).toBe(true);
    }
  });

  // Req 17.4: every form field has an accessible name from a label or aria attribute.
  it.each(cases)('form fields have accessible names: %s', (_name, make) => {
    const { container } = render(make());
    for (const el of container.querySelectorAll<HTMLInputElement>('input, select, textarea')) {
      if (el.type === 'hidden') continue;
      const named =
        (el.labels?.length ?? 0) > 0 ||
        el.hasAttribute('aria-label') ||
        el.hasAttribute('aria-labelledby');
      expect(named, `${el.tagName} #${el.id} has no accessible name`).toBe(true);
    }
  });

  it('the microphone control and recording status are named and announced (Req 17.4)', () => {
    const { getByRole } = render(<MicButton state="recording" elapsedMs={1000} {...mic} />);
    expect(getByRole('button', { name: 'Stop recording' })).toBeTruthy();
    const status = getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toMatch(/Recording/);
  });

  // Req 17.5: global focus-visible and 44px rules exist in the shared tokens.
  it('defines a visible :focus-visible indicator and 44px control sizing (Req 17.2, 17.5)', () => {
    expect(tokensCss).toMatch(/:focus-visible\s*{[^}]*outline:\s*var\(--focus-ring\)/);
    expect(tokensCss).toMatch(/--size-touch:\s*44px/);
    expect(tokensCss).toMatch(
      /button,[\s\S]*?textarea,[\s\S]*?{[^}]*min-height:\s*var\(--size-touch\)/,
    );
    expect(tokensCss).not.toMatch(/:focus(-visible)?\s*{[^}]*outline:\s*(none|0)/);
  });

  it('disables non-essential animation under prefers-reduced-motion (Req 17.8)', () => {
    expect(tokensCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration:\s*0\.01ms/,
    );
  });

  // Req 17.9: state is conveyed by text, not colour alone.
  it('UncertaintyBadge shows a text label per status', () => {
    const labels = {
      confirmed: 'Confirmed',
      needs_review: 'Needs review',
      missing: 'Missing',
      unmatched: 'Not in catalog',
    };
    for (const [status, label] of Object.entries(labels)) {
      const { container, unmount } = render(
        <UncertaintyBadge status={status as keyof typeof labels} />,
      );
      expect(container.textContent).toContain(label);
      expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      unmount();
    }
  });

  it('SyncBadge and OnlineIndicator state is text, with decorative icons hidden', () => {
    const { container } = render(<SyncBadge state={{ kind: 'failed' }} />);
    expect(container.textContent).toMatch(/Failed/);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    cleanup();
    const off = render(<OnlineIndicator online={false} />);
    expect(off.container.textContent).toMatch(/Offline/);
    off.unmount();
    expect(render(<OnlineIndicator online />).container.textContent).toMatch(/Online/);
  });

  it('destructive and blocked actions are described in text (Req 17.9)', () => {
    const { getByText } = render(
      <ConfirmButton canConfirm={false} revision={1} onConfirm={vi.fn()} />,
    );
    expect(getByText(/Resolve the highlighted items/)).toBeTruthy();
  });
});
