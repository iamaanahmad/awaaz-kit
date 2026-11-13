// Commit gate: lint, typecheck, test (non-watch) and build.
// Used by the husky pre-commit and by the Kiro PreToolUse hook.
// Usage:
//   node scripts/commit-gate.mjs          run the gate (husky)
//   node scripts/commit-gate.mjs --hook   read hook JSON from stdin; only gate `git commit`
//                                         commands; exit 2 blocks the tool call
import { spawnSync } from 'node:child_process';

const hookMode = process.argv.includes('--hook');

if (hookMode) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  if (!/\bgit\s+(?:-\S+\s+)*commit\b/.test(input)) process.exit(0);
}

const STEPS = ['lint', 'typecheck', 'test', 'build'];

for (const step of STEPS) {
  process.stderr.write(`commit-gate: pnpm ${step}\n`);
  const r = spawnSync('pnpm', [step], {
    stdio: hookMode ? ['ignore', 2, 2] : 'inherit',
    shell: true,
  });
  if (r.status !== 0) {
    process.stderr.write(`commit-gate: "pnpm ${step}" failed. Commit blocked.\n`);
    process.exit(hookMode ? 2 : 1);
  }
}
process.exit(0);
