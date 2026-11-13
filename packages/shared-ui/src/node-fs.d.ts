declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}

interface ImportMeta {
  /** Directory of the current module (provided by Vitest/Node). */
  readonly dirname: string;
}

