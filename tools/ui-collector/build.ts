import {
  catalogSchema,
  dictionarySchema,
} from "translation-core/catalog-schema";
import type { DictionaryScope as Scope } from "./src/types.ts";
import { archiveDirectory, copyBuildTree } from "translation-core/build-files";
import { buildDirectory } from "translation-core/paths";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  cp,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = resolve(packageRoot, "../..");
const output = buildDirectory("collector", "chrome");
async function readDictionary(): Promise<{ hash: string; scopes: Scope[] }> {
  const catalogPath = join(repositoryRoot, "translations/ko.messages.json");
  const catalog: unknown = JSON.parse(await readFile(catalogPath, "utf8"));
  catalogSchema.parse(catalog);
  const directory = join(repositoryRoot, "translations/ko");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const scopes: Scope[] = [];
  const raw: Array<[string, unknown]> = [["ko.messages.json", catalog]];
  for (const file of files) {
    const value: unknown = JSON.parse(
      await readFile(join(directory, file), "utf8"),
    );
    const dictionary = dictionarySchema.parse(value);
    raw.push([file, value]);
    for (const usage of dictionary.translations)
      if (usage.ref && usage.selector)
        scopes.push({
          messageId: usage.ref,
          selector: usage.selector,
          attribute: usage.attribute,
          path: file,
        });
  }
  const normalized = JSON.stringify(raw);
  return {
    hash: createHash("sha256").update(normalized).digest("hex"),
    scopes: scopes.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
  };
}

const identity = await readDictionary();
const manifest = JSON.parse(
  await readFile(join(packageRoot, "manifest.chrome.json"), "utf8"),
);
const firefoxManifest = JSON.parse(
  await readFile(join(packageRoot, "manifest.firefox.json"), "utf8"),
);
if (manifest.version !== firefoxManifest.version)
  throw new Error("Collector browser manifest versions must match");
await rm(output, { recursive: true, force: true });
await mkdir(join(output, "src"), { recursive: true });
await Promise.all(
  ["content", "background", "popup", "report", "export-worker"].map((entry) =>
    build({
      entryPoints: [join(packageRoot, "src", `${entry}.ts`)],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      outfile: join(output, "src", `${entry}.js`),
      define: {
        "process.env.NODE_ENV": '"production"',
        __UI_COLLECTOR_DICTIONARY__: JSON.stringify(identity),
        __UI_COLLECTOR_VERSION__: JSON.stringify(manifest.version),
      },
    }),
  ),
);
await cp(join(packageRoot, "public"), output, { recursive: true });
await writeFile(join(output, "dictionary-hash.txt"), identity.hash + "\n");

const firefoxRoot = buildDirectory("collector", "firefox");
await copyBuildTree(output, firefoxRoot);
for (const browser of ["chrome", "firefox"]) {
  const target = buildDirectory("collector", browser);
  await copyFile(
    join(packageRoot, `manifest.${browser}.json`),
    join(target, "manifest.json"),
  );
  const artifacts = buildDirectory("archives", "collector");
  await mkdir(artifacts, { recursive: true });
  await archiveDirectory(
    target,
    join(artifacts, `ui-collector-${browser}.zip`),
  );
}
