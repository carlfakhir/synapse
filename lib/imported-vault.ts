export interface ImportedVaultFile {
  path: string;
  content: string;
}

export interface MarkdownUpload {
  name: string;
  content: string;
  webkitRelativePath?: string;
}

export type VaultSource = "demo" | "imported";

export function normalizeImportedMarkdownFiles(
  uploads: MarkdownUpload[],
): ImportedVaultFile[] {
  return uploads
    .map((upload) => ({
      path: (upload.webkitRelativePath?.trim() || upload.name).replaceAll("\\", "/"),
      content: upload.content,
    }))
    .filter((file) => file.path.toLowerCase().endsWith(".md"))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function chooseVaultSource(files: ImportedVaultFile[]): VaultSource {
  return files.length > 0 ? "imported" : "demo";
}
