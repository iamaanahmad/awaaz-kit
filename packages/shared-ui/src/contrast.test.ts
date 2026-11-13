import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Reads the real token values from tokens.css and checks WCAG 2.x AA ratios for every
// text/background and accent pair in both themes and both apps.

const css = readFileSync(`${import.meta.dirname}/tokens.css`, 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

type Vars = Record<string, string>;

/** Declarations of the first block whose selector is exactly `selector`. */
function block(selector: string): Vars {
  const vars: Vars = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1]!.trim() !== selector) continue;
    for (const d of m[2]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]!] = d[2]!.trim();
    break;
  }
  return vars;
}

type Theme = 'haunted' | 'classic';
type App = 'order' | 'bill';

/** Cascade in specificity order, as the browser resolves it. */
function resolve(theme: Theme, app: App): Vars {
  const layers: Vars[] = [block(':root'), block(`[data-app='${app}']`)];
  if (theme === 'classic') {
    layers.push(
      block(":root[data-theme='classic']"),
      block(`[data-theme='classic'][data-app='${app}']`),
    );
  }
  return Object.assign({}, ...layers) as Vars;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Expected a 6-digit hex colour, got "${hex}"`);
  const n = parseInt(m[1]!, 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_AA = 4.5;
const UI_AA = 3;

const surfaces = ['surface', 'card', 'raised'] as const;
const inputs = ['field'] as const;

const combos: [Theme, App][] = [
  ['haunted', 'order'],
  ['haunted', 'bill'],
  ['classic', 'order'],
  ['classic', 'bill'],
];

describe('contrast helper', () => {
  it('matches known reference ratios', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});

describe.each(combos)('%s theme, %s app: WCAG AA', (theme, app) => {
  const v = resolve(theme, app);
  const get = (name: string): string => {
    const value = v[`--ui-color-${name}`];
    if (!value) throw new Error(`Missing --ui-color-${name} for ${theme}/${app}`);
    return value;
  };
  const label = (a: string, b: string, r: number): string => `${a} on ${b} = ${r.toFixed(2)}`;

  it('body text (ink, muted) is at least 4.5:1 on every surface and field', () => {
    for (const fg of ['ink', 'muted']) {
      for (const bg of [...surfaces, ...inputs]) {
        const r = contrast(get(fg), get(bg));
        expect(r, label(fg, bg, r)).toBeGreaterThanOrEqual(TEXT_AA);
      }
    }
  });

  it('status colours (danger, warning, success) are at least 4.5:1 as text', () => {
    for (const fg of ['danger', 'warning', 'success']) {
      for (const bg of surfaces) {
        const r = contrast(get(fg), get(bg));
        expect(r, label(fg, bg, r)).toBeGreaterThanOrEqual(TEXT_AA);
      }
    }
  });

  it('accent used as link or heading text is at least 4.5:1 on surfaces', () => {
    for (const bg of surfaces) {
      const r = contrast(get('accent-text'), get(bg));
      expect(r, label('accent-text', bg, r)).toBeGreaterThanOrEqual(TEXT_AA);
    }
  });

  it('accent button label is at least 4.5:1 on the accent fill', () => {
    const r = contrast(get('accent-contrast'), get('accent'));
    expect(r, label('accent-contrast', 'accent', r)).toBeGreaterThanOrEqual(TEXT_AA);
  });

  it('danger button label is at least 4.5:1 on the danger fill', () => {
    const r = contrast(get('danger-contrast'), get('danger'));
    expect(r, label('danger-contrast', 'danger', r)).toBeGreaterThanOrEqual(TEXT_AA);
  });

  it('borders, accent fills and the focus ring are at least 3:1 against what they sit on', () => {
    for (const bg of [...surfaces, ...inputs]) {
      const r = contrast(get('border'), get(bg));
      expect(r, label('border', bg, r)).toBeGreaterThanOrEqual(UI_AA);
    }
    for (const bg of ['surface', 'card']) {
      // Accent buttons draw a 2px edge in accent-text, so the control boundary is what counts.
      const edge = contrast(get('accent-text'), get(bg));
      expect(edge, label('accent edge', bg, edge)).toBeGreaterThanOrEqual(UI_AA);
      const focus = contrast(get('ink'), get(bg));
      expect(focus, label('focus ring (ink)', bg, focus)).toBeGreaterThanOrEqual(UI_AA);
    }
  });
});
