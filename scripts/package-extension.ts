import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { archiveDirectory } from "translation-core/build-files";
import { buildDirectory } from "translation-core/paths";

const artifacts = buildDirectory("archives", "extension");
await mkdir(artifacts, { recursive: true });
for (const browser of ["chrome", "firefox"]) {
  const directory = buildDirectory("extension", browser);
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  );
  const archive = join(
    artifacts,
    `yukicoder-ko-${browser}-${manifest.version}.zip`,
  );
  const buildInfo = JSON.parse(
    await readFile(join(directory, "build-info.json"), "utf8"),
  );
  if (buildInfo.version !== manifest.version)
    throw new Error(
      "Packaged manifest and build information versions differ; rebuild first",
    );
  await archiveDirectory(directory, archive);
  await writeFile(
    archive.replace(/\.zip$/, ".build.json"),
    JSON.stringify(
      {
        ...buildInfo,
        browser,
        archiveSha256: createHash("sha256")
          .update(await readFile(archive))
          .digest("hex"),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Build: ${buildInfo.commit}${buildInfo.dirty ? " + uncommitted changes" : ""}`,
  );
  console.log(archive);
  if (browser === "chrome" && process.argv.includes("--pages")) {
    const downloads = buildDirectory("problems", "downloads");
    await mkdir(downloads, { recursive: true });
    const download = join(downloads, "yukicoder-ko-chrome.zip");
    await copyFile(archive, download);
    console.log(download);
  }
}
