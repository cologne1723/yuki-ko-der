import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cliOptions } from "./cli-options.ts";
import { preferredDataDirectory } from "./review-settings.ts";
export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
export function dataDirectory(
  args = process.argv.slice(2),
  root = repositoryRoot,
): string {
  const override = cliOptions(args)["data-dir"];
  if (override !== undefined && (!override || override.startsWith("--")))
    throw new Error("--data-dir requires a path");
  return override === undefined
    ? defaultDataDirectory(root)
    : resolve(root, override);
}

export function buildDirectory(...segments: string[]): string {
  return resolve(repositoryRoot, "dist", ...segments);
}

export function defaultDataDirectory(root = repositoryRoot): string {
  return preferredDataDirectory(root) ?? resolve(root, "data");
}
