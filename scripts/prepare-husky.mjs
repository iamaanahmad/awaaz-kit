// `prepare` script: install git hooks only when this is a git checkout
// and husky is available (skips in CI tarballs and non-git workspaces).
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('.git') || process.env.CI) process.exit(0);

const r = spawnSync('pnpm', ['exec', 'husky'], { stdio: 'inherit', shell: true });
if (r.status !== 0) console.warn('prepare-husky: husky install skipped');
process.exit(0);
