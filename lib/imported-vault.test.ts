import { describe, expect, it } from "vitest";

import {
  chooseVaultSource,
  normalizeDirectoryMarkdownFiles,
} from "@/lib/imported-vault";

describe("normalizeDirectoryMarkdownFiles", () => {
  it("keeps markdown files and preserves relative folder paths", () => {
    const files = normalizeDirectoryMarkdownFiles([
      { path: "vault/root.md", content: "# Root" },
      { path: "vault/ignore.txt", content: "nope" },
      { path: "vault/nested/child.md", content: "# Child" },
    ]);

    expect(files).toEqual([
      { path: "vault/nested/child.md", content: "# Child" },
      { path: "vault/root.md", content: "# Root" },
    ]);
  });

  it("falls back to the file name when no relative path is available", () => {
    const files = normalizeDirectoryMarkdownFiles([
      { path: "scratch.md", content: "# Scratch" },
    ]);

    expect(files).toEqual([{ path: "scratch.md", content: "# Scratch" }]);
  });
});

describe("chooseVaultSource", () => {
  it("prefers an imported vault when one exists", () => {
    expect(chooseVaultSource(true)).toBe("imported");
  });

  it("falls back to demo data when no imported vault exists", () => {
    expect(chooseVaultSource(false)).toBe("demo");
  });
});
