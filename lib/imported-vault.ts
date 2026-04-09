export interface ImportedVaultFile {
  path: string;
  content: string;
}

export type VaultSource = "demo" | "imported";

export interface StoredDirectoryHandle {
  name?: string;
}

export interface DirectoryFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<{
    text(): Promise<string>;
  }>;
}

export interface DirectoryHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterable<DirectoryHandle | DirectoryFileHandle>;
  queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
}

export function normalizeDirectoryMarkdownFiles(
  files: ImportedVaultFile[],
): ImportedVaultFile[] {
  return files
    .map((file) => ({
      path: file.path.replaceAll("\\", "/"),
      content: file.content,
    }))
    .filter((file) => file.path.toLowerCase().endsWith(".md"))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function chooseVaultSource(hasImportedVault: boolean): VaultSource {
  return hasImportedVault ? "imported" : "demo";
}

export function supportsDirectoryPicker(
  win: Window & {
    showDirectoryPicker?: () => Promise<DirectoryHandle>;
  },
): win is Window & { showDirectoryPicker: () => Promise<DirectoryHandle> } {
  return typeof win.showDirectoryPicker === "function";
}

export async function hasDirectoryReadPermission(
  handle: DirectoryHandle,
): Promise<boolean> {
  if (!handle.queryPermission) return true;
  return (await handle.queryPermission({ mode: "read" })) === "granted";
}

export async function requestDirectoryReadPermission(
  handle: DirectoryHandle,
): Promise<boolean> {
  if (!handle.requestPermission) return true;
  return (await handle.requestPermission({ mode: "read" })) === "granted";
}

export async function readMarkdownFilesFromDirectory(
  handle: DirectoryHandle,
  prefix: string = handle.name,
): Promise<ImportedVaultFile[]> {
  const files: ImportedVaultFile[] = [];

  for await (const entry of handle.values()) {
    if (entry.kind === "directory") {
      files.push(
        ...(await readMarkdownFilesFromDirectory(entry, `${prefix}/${entry.name}`)),
      );
      continue;
    }

    if (entry.kind !== "file" || !entry.name.toLowerCase().endsWith(".md")) {
      continue;
    }

    const file = await entry.getFile();
    files.push({
      path: `${prefix}/${entry.name}`,
      content: await file.text(),
    });
  }

  return normalizeDirectoryMarkdownFiles(files);
}
