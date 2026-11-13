import { useServices } from '../providers/AppProviders';

/** App-local data hooks; screens read repositories through here, never Dexie directly. */
export function useRepositories() {
  return useServices().repos;
}
