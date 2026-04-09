import { openDB } from "idb";

import type { StoredDirectoryHandle, VaultSource } from "@/lib/imported-vault";

const DB_NAME = "synapse-vault";
const STORE_NAME = "app";
const DIRECTORY_HANDLE_KEY = "directory-handle";
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

export async function loadStoredVaultHandle<T extends StoredDirectoryHandle>(): Promise<T | null> {
  try {
    const db = await getDb();
    return ((await db.get(STORE_NAME, DIRECTORY_HANDLE_KEY)) as T | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveStoredVaultHandle(
  handle: StoredDirectoryHandle,
): Promise<boolean> {
  try {
    const db = await getDb();
    await db.put(STORE_NAME, handle, DIRECTORY_HANDLE_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function clearStoredVaultHandle(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, DIRECTORY_HANDLE_KEY);
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
