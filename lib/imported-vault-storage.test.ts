import { beforeEach, describe, expect, it, vi } from "vitest";

const { openDB } = vi.hoisted(() => ({
  openDB: vi.fn(),
}));

vi.mock("idb", () => ({
  openDB,
}));

import {
  clearStoredVaultHandle,
  loadStoredVaultHandle,
  loadStoredVaultSource,
  saveStoredVaultHandle,
  saveStoredVaultSource,
} from "@/lib/imported-vault-storage";

describe("imported vault storage", () => {
  beforeEach(() => {
    openDB.mockReset();
  });

  it("persists and clears imported vault state when IndexedDB works", async () => {
    const handle = { name: "vault" };
    let storedHandle: unknown;
    let activeSource: unknown;

    openDB.mockResolvedValue({
      get: vi.fn(async (_store: string, key: string) => {
        if (key === "directory-handle") return storedHandle;
        if (key === "active-source") return activeSource;
        return null;
      }),
      put: vi.fn(async (_store: string, value: unknown, key: string) => {
        if (key === "directory-handle") storedHandle = value;
        if (key === "active-source") activeSource = value;
      }),
      delete: vi.fn(async (_store: string, key: string) => {
        if (key === "directory-handle") storedHandle = undefined;
      }),
    });

    await expect(saveStoredVaultHandle(handle as never)).resolves.toBe(true);
    await expect(saveStoredVaultSource("imported")).resolves.toBe(true);
    await expect(loadStoredVaultHandle()).resolves.toBe(handle);
    await expect(loadStoredVaultSource()).resolves.toBe("imported");
    await expect(clearStoredVaultHandle()).resolves.toBe(true);
    await expect(loadStoredVaultHandle()).resolves.toBeNull();
  });

  it("falls back safely when IndexedDB is unavailable", async () => {
    openDB.mockRejectedValue(new Error("blocked"));

    await expect(loadStoredVaultHandle()).resolves.toBeNull();
    await expect(loadStoredVaultSource()).resolves.toBeNull();
    await expect(saveStoredVaultHandle({ name: "vault" } as never)).resolves.toBe(
      false,
    );
    await expect(saveStoredVaultSource("imported")).resolves.toBe(false);
    await expect(clearStoredVaultHandle()).resolves.toBe(false);
  });
});
