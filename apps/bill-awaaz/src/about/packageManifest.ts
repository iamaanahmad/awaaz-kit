export interface PackageManifestEntry {
  name: string;
  version: string;
}

/** Injected at build time by Vite `define` (tools/packageManifest.ts). Undefined under plain vitest. */
declare const __AWAAZ_PACKAGES__: readonly PackageManifestEntry[] | undefined;

/** Build-time "Powered by Awaaz Kit" manifest: shared workspace packages and versions. */
export function getPackageManifest(): readonly PackageManifestEntry[] {
  return typeof __AWAAZ_PACKAGES__ === 'undefined' ? [] : __AWAAZ_PACKAGES__;
}
