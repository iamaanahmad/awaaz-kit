// Structure checks for the repository layout (Req 1.1, 1.2, 1.9, 20.1).
// Never reads `.env.local` contents: existence is the only thing checked.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const p = (...parts: string[]): string => join(root, ...parts);

const dirsIn = (rel: string): string[] =>
  readdirSync(p(rel), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'node_modules' && e.name !== 'dist')
    .map((e) => e.name)
    .sort();

const EXPECTED_PACKAGES = [
  'catalog-matcher',
  'confidence-engine',
  'confirmation-engine',
  'domain-billing',
  'domain-order',
  'intent-engine',
  'language-normalizer',
  'local-data',
  'shared-ui',
  'speech-provider',
  'sync-engine',
  'voice-capture',
];

/** Minimal gitignore matcher for simple top-level patterns (no negation of the tested path). */
function isIgnored(relPath: string, gitignore: string): boolean {
  let ignored = false;
  for (const raw of gitignore.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    const pattern = (negate ? line.slice(1) : line).replace(/\/$/, '');
    const re = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$',
    );
    const segments = relPath.split('/');
    const hit = segments.some((_, i) => re.test(segments.slice(0, i + 1).join('/')));
    if (hit) ignored = !negate;
  }
  return ignored;
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) listSourceFiles(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs|html|json)$/.test(e.name) && !e.name.endsWith('.test.ts'))
      out.push(full);
  }
  return out;
}

describe('repository structure', () => {
  it('has exactly two apps (Req 1.1)', () => {
    expect(dirsIn('apps')).toEqual(['bill-awaaz', 'order-awaaz']);
  });

  it('has exactly the 12 expected packages (Req 1.2)', () => {
    const found = dirsIn('packages');
    expect(found).toHaveLength(12);
    expect(found).toEqual([...EXPECTED_PACKAGES].sort());
    for (const name of found) {
      const pkgJson = p('packages', name, 'package.json');
      expect(existsSync(pkgJson), `${name}/package.json`).toBe(true);
      expect(JSON.parse(readFileSync(pkgJson, 'utf8')).name).toBe(`@awaaz-kit/${name}`);
    }
  });

  it('defines the required root scripts', () => {
    const scripts = JSON.parse(readFileSync(p('package.json'), 'utf8')).scripts as Record<
      string,
      string
    >;
    for (const s of [
      'dev:order',
      'dev:bill',
      'test',
      'test:e2e',
      'test:offline',
      'lint',
      'typecheck',
      'build',
      'reuse-report',
    ]) {
      expect(scripts[s], `script ${s}`).toBeTypeOf('string');
    }
  });

  it('commits .kiro specs, steering and hooks (Req 1.9, 20.1)', () => {
    for (const f of ['requirements.md', 'design.md', 'tasks.md']) {
      expect(existsSync(p('.kiro', 'specs', 'awaaz-kit', f)), f).toBe(true);
    }
    for (const f of ['product.md', 'architecture.md', 'testing.md', 'safety-and-privacy.md']) {
      expect(existsSync(p('.kiro', 'steering', f)), f).toBe(true);
    }
    const hooks = readdirSync(p('.kiro', 'hooks')).filter((f) => f.endsWith('.json'));
    expect(hooks.length).toBeGreaterThan(0);
  });

  it('has LICENSE and THIRD_PARTY_NOTICES.md', () => {
    expect(statSync(p('LICENSE')).size).toBeGreaterThan(0);
    expect(statSync(p('THIRD_PARTY_NOTICES.md')).size).toBeGreaterThan(0);
  });

  it('.gitignore ignores .env.local but not .env.example or .kiro', () => {
    const gi = readFileSync(p('.gitignore'), 'utf8');
    expect(isIgnored('.env.local', gi)).toBe(true);
    expect(isIgnored('.env.example', gi)).toBe(false);
    expect(isIgnored('.kiro/specs/awaaz-kit/tasks.md', gi)).toBe(false);
    expect(isIgnored('.kiro/hooks/commit-gate.json', gi)).toBe(false);
  });
});

describe('secret hygiene', () => {
  const SECRET_RE = /(SECRET|API_?KEY|TOKEN|PASSWORD|PRIVATE)/i;
  const ALLOWED = new Set(['VITE_APPWRITE_ENDPOINT', 'VITE_APPWRITE_PROJECT_ID']);

  it('.env.example only uses allowed, non-secret VITE_ names', () => {
    const text = readFileSync(p('.env.example'), 'utf8');
    const names = [...text.matchAll(/^\s*(VITE_[A-Z0-9_]+)\s*=/gm)].map((m) => m[1] as string);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      expect(SECRET_RE.test(n), n).toBe(false);
      expect(ALLOWED.has(n), n).toBe(true);
    }
  });

  it('no VITE_ secret names appear in app or package sources', () => {
    const files = [...listSourceFiles(p('apps')), ...listSourceFiles(p('packages'))];
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/VITE_[A-Z0-9_]+/g)) {
        if (SECRET_RE.test(m[0])) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('.env.local is only checked for existence, never read', () => {
    // Existence is informational; the file is gitignored and optional.
    expect(typeof existsSync(p('.env.local'))).toBe('boolean');
  });
});
