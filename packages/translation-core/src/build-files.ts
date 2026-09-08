import { zipSync } from "fflate";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export async function copyBuildTree(
  source: string,
  destination: string,
): Promise<void> {
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
}
export async function archiveDirectory(
  directory: string,
  destination: string,
): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[relative(directory, path).replaceAll("\\", "/")] =
      await readFile(path);
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, zipSync(files));
}
