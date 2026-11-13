import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as barrel from './index';

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), 'utf8');
const tokens = read('./tokens.css');
const fonts = read('./fonts.css');

describe('shared-ui design tokens', () => {
  it('defines per-app accents and surfaces', () => {
    expect(tokens).toMatch(/\[data-app=["']order["']\][^}]*#e8710a/i);
    expect(tokens).toMatch(/\[data-app=["']bill["']\][^}]*#0f766e/i);
    expect(tokens).toContain('#fbf8f3');
    expect(tokens).toContain('#f6faf9');
  });

  it('enforces 44px touch targets and visible focus', () => {
    expect(tokens).toContain('--size-touch: 44px');
    expect(tokens).toContain(':focus-visible');
  });

  it('disables motion under prefers-reduced-motion', () => {
    expect(tokens).toContain('prefers-reduced-motion: reduce');
  });

  it('self-hosts Latin and Devanagari fonts', () => {
    expect(fonts).toContain('@fontsource/noto-sans/400.css');
    expect(fonts).toContain('@fontsource/noto-sans-devanagari/400.css');
  });

  it('barrel loads with all stub modules', () => {
    expect(barrel).toBeDefined();
  });
});
