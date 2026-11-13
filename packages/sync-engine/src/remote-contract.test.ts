// Feature: awaaz-kit, Task 17.15: shared SyncRemote contract suite
// **Validates: Requirements 16.4, 19.11**
import { InMemoryRemote } from './in-memory-remote';
import { AppwriteRemote } from './appwrite/appwrite-remote';
import { createFakeAppwritePort } from './testing/appwrite-fake-port';
import { runRemoteContract } from './testing/remote-contract';

// Deterministic increasing clock so `$updatedAt` ordering is stable.
function counterClock(): () => string {
  let n = 0;
  return () => new Date(Date.UTC(2025, 0, 1) + n++).toISOString();
}

runRemoteContract({
  name: 'InMemoryRemote',
  setup: async () => {
    const remote = new InMemoryRemote({ now: counterClock() });
    return { remote, signOut: async () => remote.setUser(null) };
  },
});

runRemoteContract({
  name: 'AppwriteRemote (mocked SDK port)',
  setup: async () => {
    const fake = createFakeAppwritePort();
    const remote = new AppwriteRemote({ endpoint: 'https://example.test/v1', projectId: 'proj' }, fake.port);
    return { remote, signOut: async () => fake.setSignedIn(false) };
  },
});

// Real backend mode: needs a reachable test project (see docs/test-backend.md). Each test signs up
// a throwaway user with the public endpoint and project id only; no API key is used here.
const env = process.env;
const endpoint = env['APPWRITE_TEST_ENDPOINT']?.replace(/\/+$/, '');
const projectId = env['APPWRITE_TEST_PROJECT_ID'];
const missing = ['APPWRITE_TEST_ENDPOINT', 'APPWRITE_TEST_PROJECT_ID'].filter((k) => !env[k]);

runRemoteContract({
  name: 'AppwriteRemote (real test backend)',
  ...(missing.length > 0
    ? { skipReason: `set ${missing.join(', ')} to run against a real Appwrite project` }
    : {}),
  setup: async () => {
    const remote = new AppwriteRemote({ endpoint: endpoint ?? '', projectId: projectId ?? '' });
    const suffix = globalThis.crypto.randomUUID();
    await remote.signUp(`contract-${suffix}@example.test`, `Pw-${suffix}`, 'Contract User');
    return { remote, signOut: () => remote.signOut() };
  },
});
