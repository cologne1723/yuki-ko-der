import { copyBuildTree } from "translation-core/build-files";
import { checkCatalog, readCatalog } from "translation-core/catalog-files";
import { buildDirectory } from "translation-core/paths";

import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readProblemTitleCatalog } from "translation-core/problem-title-catalog";
import { extensionMessageIds } from "../src/extension-message-ids";
import { buildToolbarIcons } from "./build-toolbar-icons.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = buildDirectory("extension", "chrome");

await checkCatalog();
const catalog = await readCatalog(repositoryRoot);
const extensionMessages = Object.fromEntries(
  Object.entries(extensionMessageIds).map(([key, id]) => {
    const target = catalog.messages.find(
      (message) => message.id === id,
    )?.target;
    if (!target) throw new Error(`Extension message is missing: ${id}`);
    return [key, target];
  }),
);
await rm(outputRoot, { recursive: true, force: true });
await mkdir(join(outputRoot, "src"), { recursive: true });

const problemTitles = await readProblemTitleCatalog(
  join(repositoryRoot, "problem-translations", "ko", "problems"),
);

await build({
  entryPoints: [
    join(repositoryRoot, "src", "background.ts"),
    join(repositoryRoot, "src", "config.ts"),
    join(repositoryRoot, "src", "problem-translations.ts"),
    join(repositoryRoot, "src", "content.ts"),
  ],
  bundle: true,
  define: {
    __YUKICODER_PROBLEM_TITLES__: JSON.stringify(problemTitles),
    __YUKICODER_EXTENSION_MESSAGES__: JSON.stringify(extensionMessages),
  },
  entryNames: "[name]",
  format: "iife",
  outdir: join(outputRoot, "src"),
  platform: "browser",
  target: "es2022",
});

await Promise.all([
  cp(
    join(repositoryRoot, "node_modules/katex/dist/katex.min.css"),
    join(outputRoot, "katex/katex.min.css"),
  ),
  cp(
    join(repositoryRoot, "node_modules/katex/dist/fonts"),
    join(outputRoot, "katex/fonts"),
    { recursive: true },
  ),
  cp(join(repositoryRoot, "manifest.json"), join(outputRoot, "manifest.json")),
  cp(join(repositoryRoot, "README.md"), join(outputRoot, "README.md")),
  cp(join(repositoryRoot, "LICENSE"), join(outputRoot, "LICENSE")),
  cp(join(repositoryRoot, "icons"), join(outputRoot, "icons"), {
    recursive: true,
    filter: (source) => !/toolbar-\d+\.png$/u.test(source),
  }),
  cp(join(repositoryRoot, "translations"), join(outputRoot, "translations"), {
    recursive: true,
  }),
]);

await buildToolbarIcons(join(outputRoot, "icons"));
const firefoxRoot = buildDirectory("extension", "firefox");
await copyBuildTree(outputRoot, firefoxRoot);
for (const browser of ["chrome", "firefox"] as const) {
  const target = buildDirectory("extension", browser);
  const manifest = JSON.parse(
    await readFile(join(target, "manifest.json"), "utf8"),
  );
  if (browser === "chrome") {
    delete manifest.background.scripts;
    delete manifest.browser_specific_settings;
  } else {
    delete manifest.background.service_worker;
    delete manifest.minimum_chrome_version;
  }
  await writeFile(
    join(target, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
