import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { parseLocalProblemImageReference } from "./problem-assets.ts";
const MIME: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const DATA_IMAGE =
  /^data:(image\/(?:gif|jpeg|png|svg\+xml|webp));base64,([A-Za-z0-9+/\t\n\f\r ]+={0,2}[\t\n\f\r ]*)$/u;
export interface LocalProblemImage {
  problemNo: number;
  reference: string;
  filename: string;
  path: string;
  mime: string;
  bytes: Uint8Array;
  sha256: string;
}
export interface ProblemImageResolverOptions {
  imageRoot?: string;
}
export function canonicalizeImageDataUris(document: Document) {
  for (const image of document.querySelectorAll("img[src]")) {
    const src = (image.getAttribute("src") ?? "").trim();
    const match = DATA_IMAGE.exec(src);
    if (!match) continue;
    image.setAttribute(
      "src",
      `data:${match[1]};base64,${Buffer.from(match[2], "base64").toString("base64")}`,
    );
  }
}
export async function readLocalProblemImage(
  repositoryRoot: string,
  reference: string,
  expectedProblemNo?: number,
  options: ProblemImageResolverOptions = {},
): Promise<LocalProblemImage> {
  const parsed = parseLocalProblemImageReference(reference);
  if (
    !parsed ||
    (expectedProblemNo !== undefined && parsed.problemNo !== expectedProblemNo)
  )
    throw new Error(
      `Invalid local problem image reference: ${JSON.stringify(reference)}`,
    );
  const root = resolve(
      options.imageRoot ??
        resolve(repositoryRoot, "problem-translations/ko/images"),
    ),
    path = resolve(root, String(parsed.problemNo), parsed.filename);
  const rootRelative = relative(root, path);
  if (isAbsolute(rootRelative) || rootRelative.startsWith(`..${sep}`))
    throw new Error(`Problem image escapes the image root: ${reference}`);
  const [realRoot, realPath] = await Promise.all([
    realpath(root),
    realpath(path),
  ]);
  const realRelative = relative(realRoot, realPath);
  if (isAbsolute(realRelative) || realRelative.startsWith(`..${sep}`))
    throw new Error(
      `Problem image resolves outside the image root: ${reference}`,
    );
  if (!(await lstat(realPath)).isFile())
    throw new Error(`Problem image is not a regular file: ${reference}`);
  const bytes = await readFile(realPath),
    extension = parsed.filename
      .slice(parsed.filename.lastIndexOf("."))
      .toLowerCase();
  return {
    problemNo: parsed.problemNo,
    reference,
    filename: parsed.filename,
    path: realPath,
    mime: MIME[extension],
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
export async function findLocalProblemImages(
  document: Document,
  repositoryRoot: string,
  expectedProblemNo: number,
  options: ProblemImageResolverOptions = {},
) {
  const references = new Set<string>();
  for (const image of document.querySelectorAll("img[src]")) {
    const src = image.getAttribute("src")?.trim();
    if (src?.startsWith("../images/")) references.add(src);
  }
  return Promise.all(
    [...references].map((reference) =>
      readLocalProblemImage(
        repositoryRoot,
        reference,
        expectedProblemNo,
        options,
      ),
    ),
  );
}
export async function inlineLocalProblemImages(
  document: Document,
  repositoryRoot: string,
  expectedProblemNo: number,
  options: ProblemImageResolverOptions = {},
) {
  const assets = await findLocalProblemImages(
      document,
      repositoryRoot,
      expectedProblemNo,
      options,
    ),
    byReference = new Map(assets.map((asset) => [asset.reference, asset]));
  for (const image of document.querySelectorAll("img[src]")) {
    const asset = byReference.get(image.getAttribute("src")?.trim() ?? "");
    if (asset)
      image.setAttribute(
        "src",
        `data:${asset.mime};base64,${Buffer.from(asset.bytes).toString("base64")}`,
      );
  }
  return assets;
}
