// Shared Vitest setup: fake IndexedDB for Dexie and Testing Library matchers/cleanup.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Full-suite runs load the machine heavily; the 1s default async timeout is flaky.
configure({ asyncUtilTimeout: 10000 });

afterEach(() => {
  cleanup();
});
