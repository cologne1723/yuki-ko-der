import { mkdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "translation-core/validation";
import { JSDOM } from "jsdom";
import { sourceStatementNodes } from "translation-core/problem-document";
import {
  atomicFile,
  optionalFile,
  preserveSource,
  sha256,
  type SourceMetadata,
} from "./source-store.ts";

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const receiptSchema = z.object({
  version: z.literal(1),
  origin: z.literal("canonical-api"),
  state: z.enum(["downloaded", "applied", "review-required"]),
  downloadedAt: z.number().int().nonnegative(),
  problemNo: z.number().int().positive(),
  problemId: z.number().int().positive(),
  revision: hash,
  htmlSha256: hash,
});
const receiptPath = (root: string, no: number) =>
  join(root, "downloads", `${no}.json`);

function validStatement(bytes: Uint8Array, knownHashes: readonly string[]) {
  const dom = new JSDOM(new TextDecoder().decode(bytes));
  try {
    const body = dom.window.document.body;
    return (
      sourceStatementNodes(body).length > 0 &&
      (Boolean(body.querySelector(".block")) ||
        knownHashes.includes(sha256(bytes)))
    );
  } finally {
    dom.window.close();
  }
}

// Call under the collector lock, after validating the complete API response.
// Backups and activateSource never update this independent download receipt.
export async function recordSourceDownload(
  root: string,
  metadata: SourceMetadata,
  bytes: Uint8Array,
  knownHashes: readonly string[] = [],
) {
  if (!validStatement(bytes, knownHashes))
    throw new Error("Empty or unexpected canonical statement HTML");
  const path = await preserveSource(root, metadata, bytes);
  const receipt = receiptSchema.parse({
    version: 1,
    origin: "canonical-api",
    state: "downloaded",
    downloadedAt: Date.now(),
    problemNo: metadata.No,
    problemId: metadata.ProblemId,
    revision: basename(path, ".json"),
    htmlSha256: sha256(bytes),
  });
  await mkdir(join(root, "downloads"), { recursive: true });
  await atomicFile(
    receiptPath(root, metadata.No),
    JSON.stringify(receipt) + "\n",
  );
  return path;
}

export async function readSourceDownload(
  root: string,
  metadata: SourceMetadata,
  since: number,
  knownHashes: readonly string[] = [],
) {
  const raw = await optionalFile(receiptPath(root, metadata.No));
  if (!raw) return undefined;
  const receipt = receiptSchema.parse(JSON.parse(raw.toString()));
  if (
    receipt.problemNo !== metadata.No ||
    receipt.problemId !== metadata.ProblemId
  )
    throw new Error("Downloaded original identity mismatch");
  if (receipt.downloadedAt < since) return undefined;
  const path = join(
    root,
    "revisions",
    String(metadata.No),
    `${receipt.revision}.json`,
  );
  const revision = JSON.parse(await readFile(path, "utf8"));
  if (
    revision.metadata?.No !== metadata.No ||
    revision.metadata?.ProblemId !== metadata.ProblemId ||
    typeof revision.metadata?.Title !== "string" ||
    typeof revision.html !== "string"
  )
    throw new Error(`Invalid downloaded original evidence: ${path}`);
  const bytes = Buffer.from(revision.html, "base64");
  if (
    sha256(bytes) !== receipt.htmlSha256 ||
    revision.htmlSha256 !== receipt.htmlSha256
  )
    throw new Error(`Downloaded original evidence hash mismatch: ${path}`);
  // Older versions could record HTTP 200 error bodies. Re-fetch these instead
  // of treating them as completed downloads for the rest of the refresh.
  if (!validStatement(bytes, knownHashes)) return undefined;
  return {
    path,
    hash: receipt.htmlSha256,
    title: revision.metadata.Title as string,
    metadata: revision.metadata as SourceMetadata,
    bytes,
  };
}

export async function finishSourceDownload(
  root: string,
  no: number,
  expectedHash: string,
  state: "applied" | "review-required",
) {
  const path = receiptPath(root, no);
  const receipt = receiptSchema.parse(JSON.parse(await readFile(path, "utf8")));
  if (receipt.problemNo !== no || receipt.htmlSha256 !== expectedHash)
    throw new Error("Downloaded original changed before completion");
  await atomicFile(path, JSON.stringify({ ...receipt, state }) + "\n");
}
