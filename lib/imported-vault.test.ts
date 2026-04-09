import { describe, expect, it } from "vitest";

import {
  chooseVaultSource,
  normalizeImportedMarkdownFiles,
} from "@/lib/imported-vault";

describe("normalizeImportedMarkdownFiles", () => {
  it("keeps markdown files and preserves relative folder paths", () => {
    const files = normalizeImportedMarkdownFiles([
      {
        name: "root.md",
        webkitRelativePath: "vault/root.md",
        content: "# Root",
      },
      {
        name: "ignore.txt",
        webkitRelativePath: "vault/ignore.txt",
        content: "nope",
      },
      {
        name: "child.md",
        webkitRelativePath: "vault/nested/child.md",
        content: "# Child",
      },
    ]);

    expect(files).toEqual([
      { path: "vault/nested/child.md", content: "# Child" },
      { path: "vault/root.md", content: "# Root" },
    ]);
  });

  it("falls back to the file name when no relative path is available", () => {
    const files = normalizeImportedMarkdownFiles([
      {
        name: "scratch.md",
        content: "# Scratch",
      },
    ]);

    expect(files).toEqual([{ path: "scratch.md", content: "# Scratch" }]);
  });
});

describe("chooseVaultSource", () => {
  it("prefers an imported vault when one exists", () => {
    expect(
      chooseVaultSource([{ path: "vault/root.md", content: "# Root" }]),
    ).toBe("imported");
  });

  it("falls back to demo data when no imported vault exists", () => {
    expect(chooseVaultSource([])).toBe("demo");
  });
});
