// Runtime loader for a vault served from /public/test-vault/.
// Fetches manifest.json, then each file in parallel.

import type { RawFile } from "./parser";

export interface VaultManifest {
  name: string;
  description: string;
  files: string[];
}

export async function loadVault(basePath: string = "/test-vault"): Promise<{
  manifest: VaultManifest;
  files: RawFile[];
}> {
  const manifestRes = await fetch(`${basePath}/manifest.json`);
  if (!manifestRes.ok) throw new Error(`Vault manifest not found at ${basePath}`);
  const manifest = (await manifestRes.json()) as VaultManifest;

  const files = await Promise.all(
    manifest.files.map(async (name) => {
      const res = await fetch(`${basePath}/${name}`);
      if (!res.ok) throw new Error(`Failed to load ${name}`);
      const content = await res.text();
      return { path: name, content };
    }),
  );

  return { manifest, files };
}
