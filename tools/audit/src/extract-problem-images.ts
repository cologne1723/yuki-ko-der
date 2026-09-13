#!/usr/bin/env node
import { JSDOM } from "jsdom";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const DATA_IMAGE =
  /^data:image\/(png|gif|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/\t\n\f\r ]+={0,2}[\t\n\f\r ]*)$/u;

export async function extractProblemImages(
  repositoryRoot: string,
  problemNo: number,
) {
  if (!Number.isSafeInteger(problemNo) || problemNo < 1)
    throw new Error("Problem number must be a positive integer");
  const sourcePath = join(
    repositoryRoot,
    "data/problems-source",
    `${problemNo}.html`,
  );
  const mdxPath = join(
    repositoryRoot,
    "problem-translations/ko/problems",
    `${problemNo}.mdx`,
  );
  const imageDirectory = join(
    repositoryRoot,
    "problem-translations/ko/images",
    String(problemNo),
  );
  const [source, mdx] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(mdxPath, "utf8"),
  ]);
  const dom = new JSDOM(source);
  try {
    const replacements: {
      source: string;
      target: string;
      bytes: Buffer;
      extension: string;
    }[] = [];
    let sequence = 0;
    const seen = new Map<string, (typeof replacements)[number]>();
    for (const image of dom.window.document.querySelectorAll("img[src]")) {
      const value = image.getAttribute("src")?.trim() ?? "";
      const match = DATA_IMAGE.exec(value);
      if (!match) {
        if (value.startsWith("data:image/"))
          throw new Error(
            `Unsupported or malformed inline image MIME: ${value.slice(0, 80)}`,
          );
        continue;
      }
      if (seen.has(value)) continue;
      sequence++;
      const extension =
        match[1] === "jpeg" ? "jpg" : match[1] === "svg+xml" ? "svg" : match[1];
      const replacement = {
        source: value,
        target: `../images/${problemNo}/${sequence}.${extension}`,
        bytes: Buffer.from(match[2], "base64"),
        extension,
      };
      seen.set(value, replacement);
      replacements.push(replacement);
    }
    if (!replacements.length) return { problemNo, images: 0, changed: false };
    const destinations = replacements.map((replacement, index) =>
      join(imageDirectory, `${index + 1}.${replacement.extension}`),
    );
    const { access } = await import("node:fs/promises");
    for (const destination of destinations) {
      try {
        await access(destination);
        throw new Error(`Refusing to overwrite existing image: ${destination}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    let updated = mdx;
    for (const replacement of replacements) {
      if (!updated.includes(replacement.source))
        throw new Error(
          `Base64 image from source No.${problemNo} is absent from the MDX`,
        );
      updated = updated.replaceAll(replacement.source, replacement.target);
    }
    // Preflight every destination before creating anything: existing files are
    // never overwritten, and a partial extraction cannot silently continue.
    const imagesRoot = resolve(
      repositoryRoot,
      "problem-translations/ko/images",
    );
    await mkdir(imagesRoot, { recursive: true });
    if ((await lstat(imagesRoot)).isSymbolicLink())
      throw new Error(
        `Image root is a symlink; refusing to write outside it: ${imagesRoot}`,
      );
    const realImagesRoot = await realpath(imagesRoot);
    await mkdir(imageDirectory, { recursive: true });
    const realImageDirectory = await realpath(imageDirectory);
    const directoryRelative = relative(realImagesRoot, realImageDirectory);
    if (
      isAbsolute(directoryRelative) ||
      directoryRelative.startsWith(`..${sep}`)
    )
      throw new Error(
        `Image output directory escapes the image root: ${imageDirectory}`,
      );
    for (let index = 0; index < replacements.length; index++)
      await writeFile(destinations[index], replacements[index].bytes, {
        flag: "wx",
      });
    await writeFile(mdxPath, updated, "utf8");
    return { problemNo, images: replacements.length, changed: updated !== mdx };
  } finally {
    dom.window.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const no = Number(process.argv[2]);
  const repositoryRoot = resolve(
    process.argv[3] ?? new URL("../../..", import.meta.url).pathname,
  );
  console.log(await extractProblemImages(repositoryRoot, no));
}
