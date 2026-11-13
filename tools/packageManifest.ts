import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ManifestEntry {
  name: string;
  version: string;
}

/** Reads every workspace package under /packages and returns name+version, sorted by name. */
export function readWorkspacePackages(): ManifestEntry[] {
  const packagesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages');
  const entries: ManifestEntry[] = [];
  for (const dir of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = join(packagesDir, dir.name, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as { name?: string; version?: string };
    if (pkg.name && pkg.version) entries.push({ name: pkg.name, version: pkg.version });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** Vite `define` value injecting the manifest at build time as __AWAAZ_PACKAGES__. */
export function packageManifestDefine(): Record<string, string> {
  return { __AWAAZ_PACKAGES__: JSON.stringify(readWorkspacePackages()) };
}
