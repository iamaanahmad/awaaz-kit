// Used by .kiro/hooks. Reads the hook JSON from stdin, finds the edited
// packages/<name>/src file, and runs Vitest for that package only.
// Usage: node scripts/kiro-targeted-test.mjs <group>   (engine | storage-sync | billing)
import { spawnSync } from 'node:child_process';

const GROUPS = {
  engine: [
    'language-normalizer',
    'intent-engine',
    'catalog-matcher',
    'confidence-engine',
    'confirmation-engine',
  ],
  'storage-sync': ['local-data', 'sync-engine'],
  billing: ['domain-billing'],
};

const group = process.argv[2];
const allowed = GROUPS[group];
if (!allowed) {
  console.error(`Unknown hook group: ${group}`);
  process.exit(1);
}

let input = '';
for await (const chunk of process.stdin) input += chunk;

const match = input.replace(/\\\\|\\/g, '/').match(/packages\/([a-z-]+)\/src\//);
const pkg = match?.[1];
if (!pkg || !allowed.includes(pkg)) process.exit(0);

function run(args) {
  const r = spawnSync('pnpm', ['exec', 'vitest', 'run', ...args], {
    stdio: 'inherit',
    shell: true,
  });
  return r.status ?? 1;
}

let status = run(['--dir', `packages/${pkg}`, '--passWithNoTests']);
if (group === 'storage-sync' && status === 0) {
  // Offline subset (see root `test:offline`).
  status = run([
    '--dir',
    'packages/sync-engine',
    '--dir',
    'packages/local-data',
    '--passWithNoTests',
  ]);
}
process.exit(status === 0 ? 0 : 1);
