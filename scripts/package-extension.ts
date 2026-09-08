import { mkdir, readFile } from "node:fs/promises";
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
  await archiveDirectory(directory, archive);
  console.log(archive);
}
