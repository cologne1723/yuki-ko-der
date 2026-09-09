import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { atomicFile } from "translation-core/atomic-file";
export { atomicFile } from "translation-core/atomic-file";
export interface SourceMetadata {
  No: number;
  ProblemId: number;
  Title: string;
}
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export async function optionalFile(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
export async function atomicNewFile(path: string, bytes: string) {
  const temp = `${path}.${randomUUID()}.partial`;
  try {
    await writeFile(temp, bytes, { flag: "wx" });
    await link(temp, path);
  } finally {
    await unlink(temp).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
async function withLock<T>(
  root: string,
  signal: AbortSignal | undefined,
  work: () => Promise<T>,
): Promise<T> {
  await mkdir(root, { recursive: true });
  // SQLite releases this cross-process lock on worker/process exit. A PID file
  // cannot safely reclaim a dead owner while another caller acquires the lock.
  const { DatabaseSync } = await import("node:sqlite");
  const lock = new DatabaseSync(join(root, ".source-lock.sqlite"));
  try {
    for (;;) {
      signal?.throwIfAborted();
      try {
        lock.exec("BEGIN IMMEDIATE");
        break;
      } catch (error) {
        if (![5, 6].includes((error as { errcode?: number }).errcode ?? -1))
          throw error;
        await setTimeout(50, undefined, { signal });
      }
    }
    return await work();
  } finally {
    lock.close();
  }
}
interface Journal {
  problemNo: number;
  source?: string;
  index?: string;
}
async function recover(root: string) {
  const path = join(root, ".replacement.json");
  const bytes = await optionalFile(path);
  if (!bytes) return;
  const journal = JSON.parse(bytes.toString()) as Journal;
  if (!Number.isSafeInteger(journal.problemNo) || journal.problemNo < 1)
    throw new Error("Invalid original replacement journal");
  for (const [file, original] of [
    [`${journal.problemNo}.html`, journal.source],
    ["index.json", journal.index],
  ] as const) {
    if (original === undefined)
      await unlink(join(root, file)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    else await atomicFile(join(root, file), Buffer.from(original, "base64"));
  }
  await unlink(path);
}
export async function preserveSource(
  root: string,
  metadata: SourceMetadata,
  html: Uint8Array,
) {
  const directory = join(root, "revisions", String(metadata.No));
  await mkdir(directory, { recursive: true });
  const hash = sha256(html);
  const revision = sha256(JSON.stringify(metadata) + hash);
  const path = join(directory, `${revision}.json`);
  await atomicFile(
    path,
    JSON.stringify({
      metadata,
      htmlSha256: hash,
      html: Buffer.from(html).toString("base64"),
    }) + "\n",
  );
  return path;
}
export async function readSourceIndex(
  root: string,
): Promise<{ problems: SourceMetadata[]; [key: string]: unknown }> {
  const value = await optionalFile(join(root, "index.json"));
  const index = value ? JSON.parse(value.toString()) : { problems: [] };
  if (
    !index ||
    !Array.isArray(index.problems) ||
    index.problems.some(
      (item: SourceMetadata) =>
        !item ||
        !Number.isSafeInteger(item.No) ||
        item.No < 1 ||
        !Number.isSafeInteger(item.ProblemId) ||
        item.ProblemId < 1 ||
        typeof item.Title !== "string",
    ) ||
    new Set(index.problems.map((item: SourceMetadata) => item.No)).size !==
      index.problems.length ||
    new Set(index.problems.map((item: SourceMetadata) => item.ProblemId))
      .size !== index.problems.length
  )
    throw new Error(
      "Invalid original source index; existing data was preserved",
    );
  return index;
}
export async function activateSource(
  root: string,
  metadata: SourceMetadata,
  html: Uint8Array,
  signal?: AbortSignal,
) {
  return withLock(root, signal, async () => {
    await recover(root);
    signal?.throwIfAborted();
    const sourcePath = join(root, `${metadata.No}.html`),
      indexPath = join(root, "index.json");
    const source = await optionalFile(sourcePath),
      indexBytes = await optionalFile(indexPath);
    const index = await readSourceIndex(root);
    if (
      !Number.isSafeInteger(metadata.No) ||
      metadata.No < 1 ||
      !Number.isSafeInteger(metadata.ProblemId) ||
      metadata.ProblemId < 1 ||
      typeof metadata.Title !== "string" ||
      index.problems.some(
        (p) => p.No !== metadata.No && p.ProblemId === metadata.ProblemId,
      )
    )
      throw new Error(
        "Invalid or duplicate original problem identity; existing data was preserved",
      );
    const old = index.problems.find((p) => p.No === metadata.No);
    if (source && old) await preserveSource(root, old, source);
    await preserveSource(root, metadata, html);
    const journal: Journal = {
      problemNo: metadata.No,
      source: source?.toString("base64"),
      index: indexBytes?.toString("base64"),
    };
    await atomicFile(join(root, ".replacement.json"), JSON.stringify(journal));
    try {
      await atomicFile(sourcePath, html);
      await atomicFile(
        indexPath,
        JSON.stringify(
          {
            ...index,
            problems: [
              ...index.problems.filter((p) => p.No !== metadata.No),
              metadata,
            ].sort((a, b) => a.No - b.No),
          },
          null,
          2,
        ) + "\n",
      );
      await unlink(join(root, ".replacement.json"));
    } catch (error) {
      await recover(root);
      throw error;
    }
  });
}
export async function recoverSourceStore(root: string, signal?: AbortSignal) {
  return withLock(root, signal, () => recover(root));
}
