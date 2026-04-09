import { openDB } from "idb";

import type { ImportedVaultFile, VaultSource } from "@/lib/imported-vault";

const DB_NAME = "synapse-vault";
const STORE_NAME = "app";
const IMPORTED_FILES_KEY = "imported-files";
const ACTIVE_SOURCE_KEY = "active-source";

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function loadImportedVaultFiles(): Promise<ImportedVaultFile[]> {
  try {
    const db = await getDb();
    return ((await db.get(STORE_NAME, IMPORTED_FILES_KEY)) as ImportedVaultFile[] | undefined) ?? [];
  } catch {
    return [];
  }
}

export async function saveImportedVaultFiles(
  files: ImportedVaultFile[],
): Promise<boolean> {
  try {
    const db = await getDb();
    await db.put(STORE_NAME, files, IMPORTED_FILES_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function clearImportedVaultFiles(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, IMPORTED_FILES_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function loadStoredVaultSource(): Promise<VaultSource | null> {
  try {
    const db = await getDb();
    return ((await db.get(STORE_NAME, ACTIVE_SOURCE_KEY)) as VaultSource | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveStoredVaultSource(source: VaultSource): Promise<boolean> {
  try {
    const db = await getDb();
    await db.put(STORE_NAME, source, ACTIVE_SOURCE_KEY);
    return true;
  } catch {
    return false;
  }
}
