import { constants, readFileSync } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { atomicFile } from "./atomic-file.ts";
import { z } from "./validation.ts";
const dataDirectorySchema = z
  .string()
  .refine((path) => !!path.trim() && !path.includes("\0"));
export const reviewSettingsSchema = z.looseObject({
  dataDirectory: dataDirectorySchema,
});

export function settingsPath(root: string): string {
  return resolve(root, ".review-settings.json");
}
export function preferredDataDirectory(root: string): string | undefined {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(settingsPath(root), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Cannot read review settings: ${String(error)}`);
  }
  const parsed = reviewSettingsSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid saved data directory");
  const path = parsed.data.dataDirectory;
  return resolve(root, path);
}
export async function saveDataDirectory(
  root: string,
  path: string,
): Promise<string> {
  if (!dataDirectorySchema.safeParse(path).success)
    throw new Error("Data directory requires a path");
  const destination = resolve(root, path);
  let parent = destination;
  for (;;) {
    try {
      const info = await stat(parent);
      if (!info.isDirectory())
        throw new Error("Data directory or its parent is not a folder");
      await access(parent, constants.W_OK | constants.R_OK);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const next = dirname(parent);
      if (next === parent) throw error;
      parent = next;
    }
  }
  await mkdir(root, { recursive: true });
  await atomicFile(
    settingsPath(root),
    JSON.stringify({ schemaVersion: 1, dataDirectory: destination }, null, 2) +
      "\n",
  );
  return destination;
}
