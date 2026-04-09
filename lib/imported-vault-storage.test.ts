import { beforeEach, describe, expect, it, vi } from "vitest";

const { openDB } = vi.hoisted(() => ({
  openDB: vi.fn(),
}));

vi.mock("idb", () => ({
  openDB,
}));

import {
  clearImportedVaultFiles,
  loadImportedVaultFiles,
  loadStoredVaultSource,
  saveImportedVaultFiles,
  saveStoredVaultSource,
} from "@/lib/imported-vault-storage";

describe("imported vault storage", () => {
  beforeEach(() => {
    openDB.mockReset();
  });

  it("persists and clears imported vault state when IndexedDB works", async () => {
    let importedFiles: unknown;
    let activeSource: unknown;

    openDB.mockResolvedValue({
      get: vi.fn(async (_store: string, key: string) => {
        if (key === "imported-files") return importedFiles;
        if (key === "active-source") return activeSource;
        return null;
      }),
      put: vi.fn(async (_store: string, value: unknown, key: string) => {
        if (key === "imported-files") importedFiles = value;
        if (key === "active-source") activeSource = value;
      }),
      delete: vi.fn(async (_store: string, key: string) => {
        if (key === "imported-files") importedFiles = undefined;
      }),
    });

    await expect(
      saveImportedVaultFiles([{ path: "vault/root.md", content: "# Root" }]),
    ).resolves.toBe(true);
    await expect(saveStoredVaultSource("imported")).resolves.toBe(true);
    await expect(loadImportedVaultFiles()).resolves.toEqual([
      { path: "vault/root.md", content: "# Root" },
    ]);
    await expect(loadStoredVaultSource()).resolves.toBe("imported");
    await expect(clearImportedVaultFiles()).resolves.toBe(true);
    await expect(loadImportedVaultFiles()).resolves.toEqual([]);
  });

  it("falls back safely when IndexedDB is unavailable", async () => {
    openDB.mockRejectedValue(new Error("blocked"));

    await expect(loadImportedVaultFiles()).resolves.toEqual([]);
    await expect(loadStoredVaultSource()).resolves.toBeNull();
    await expect(
      saveImportedVaultFiles([{ path: "vault/root.md", content: "# Root" }]),
    ).resolves.toBe(false);
    await expect(saveStoredVaultSource("imported")).resolves.toBe(false);
    await expect(clearImportedVaultFiles()).resolves.toBe(false);
  });
});
