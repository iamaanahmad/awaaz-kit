// Built-bundle secret scan. Validates: Requirements 16.16, 18.4
// Scans the built dist output of both apps for Appwrite API key names/values,
// private keys, service tokens and any VITE_ config beyond endpoint and project ID.
// Values of server-side env vars are compared by value only and never printed.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..', '..');
const apps = ['order-awaaz', 'bill-awaaz'] as const;
const TEXT_EXT = /\.(js|mjs|cjs|css|html|json|webmanifest|map|txt|svg)$/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TEXT_EXT.test(name)) out.push(p);
  }
  return out;
}

const PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'Appwrite API key (standard_ + hex)', re: /standard_[a-f0-9]{32,}/i },
  { label: 'APPWRITE_API_KEY name', re: /APPWRITE_API_KEY/ },
  { label: 'private key block', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  {
    label: 'service token (github/slack/aws/google)',
    re: /\b(?:ghp_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})\b/,
  },
];
// Endpoint and project ID are the only Appwrite config allowed. VITE_SPEECH_PROVIDER is a
// non-secret provider id (e.g. "scripted") read by the apps' speech registry.
const ALLOWED_VITE = new Set([
  'VITE_APPWRITE_ENDPOINT',
  'VITE_APPWRITE_PROJECT_ID',
  'VITE_SPEECH_PROVIDER',
]);

function serverSecretValues(): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < 12 || name.startsWith('VITE_')) continue;
    if (name === 'APPWRITE_API_KEY' || /(API_KEY|SECRET|TOKEN|PRIVATE_KEY)/.test(name)) {
      out.push({ name, value });
    }
  }
  return out;
}

const missing = apps.filter((a) => !existsSync(join(root, 'apps', a, 'dist')));
if (missing.length > 0) {
  console.warn(
    `[bundle-secrets] SKIPPED: dist missing for ${missing.join(', ')}. Run \`pnpm build\` first.`,
  );
}

describe.skipIf(missing.length > 0)('built bundles contain no secrets (Req 16.16, 18.4)', () => {
  for (const app of apps) {
    const dist = join(root, 'apps', app, 'dist');
    const files = existsSync(dist) ? walk(dist) : [];

    it(`${app}: dist has files to scan`, () => {
      expect(files.length).toBeGreaterThan(0);
    });

    it(`${app}: no secret patterns, secret env values, or extra VITE_ config`, () => {
      const secrets = serverSecretValues();
      const findings: string[] = [];
      for (const f of files) {
        const text = readFileSync(f, 'utf8');
        const rel = relative(root, f);
        for (const { label, re } of PATTERNS) {
          if (re.test(text)) findings.push(`${rel}: ${label}`);
        }
        for (const { name, value } of secrets) {
          if (text.includes(value)) findings.push(`${rel}: value of env var ${name}`);
        }
        for (const m of text.matchAll(/VITE_[A-Z0-9_]+/g)) {
          if (!ALLOWED_VITE.has(m[0])) findings.push(`${rel}: unexpected config ${m[0]}`);
        }
      }
      expect([...new Set(findings)]).toEqual([]);
    });
  }
});
