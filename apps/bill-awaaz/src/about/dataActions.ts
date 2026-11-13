import { clearAll, exportAll, resetDemoShop, type AwaazDb } from '@awaaz-kit/local-data';

/** Serializes the local export (secrets are already filtered by `exportAll`). */
export async function buildExportJson(db: AwaazDb): Promise<string> {
  return JSON.stringify(await exportAll(db), null, 2);
}

/** Triggers a browser download of the export file. */
export async function downloadExport(db: AwaazDb): Promise<void> {
  const json = await buildExportJson(db);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `awaaz-kit-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const resetDemo = (db: AwaazDb): Promise<void> => resetDemoShop(db);
export const clearLocalData = (db: AwaazDb): Promise<void> => clearAll(db);
