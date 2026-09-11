import { JSDOM } from "jsdom";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { sourceStatementBlocks } from "translation-core/problem-document";
import { sampleDataValues } from "translation-core/problem-samples";
import { sha256Hex } from "translation-core/sha256";

export interface TranslationSourceRevision {
  problemNo: number;
  problemId: number;
  sourceTitle: string;
  sourceHtmlSha256: string;
}

/** Read only the original revision named by the translation, never latest-by-date. */
export async function matchingTranslationSource(
  dataRoot: string,
  expected: TranslationSourceRevision,
): Promise<string | undefined> {
  if (
    !Number.isSafeInteger(expected.problemNo) ||
    expected.problemNo < 1 ||
    !Number.isSafeInteger(expected.problemId) ||
    expected.problemId < 1 ||
    !/^[a-f0-9]{64}$/u.test(expected.sourceHtmlSha256)
  )
    throw new Error("Invalid translation source revision metadata");
  const root = join(dataRoot, "problems-source");
  try {
    const bytes = await readFile(join(root, `${expected.problemNo}.html`));
    if ((await sha256Hex(bytes)) === expected.sourceHtmlSha256)
      return bytes.toString("utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const revisions = join(root, "revisions", String(expected.problemNo));
  let files: string[];
  try {
    files = await readdir(revisions);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  for (const file of files.sort()) {
    if (!/^[a-f0-9]{64}\.json$/u.test(file)) continue;
    const revision = JSON.parse(await readFile(join(revisions, file), "utf8"));
    if (
      revision.htmlSha256 !== expected.sourceHtmlSha256 ||
      revision.metadata?.No !== expected.problemNo ||
      revision.metadata?.ProblemId !== expected.problemId ||
      revision.metadata?.Title !== expected.sourceTitle
    )
      continue;
    if (typeof revision.html !== "string")
      throw new Error(`Invalid saved source revision: ${file}`);
    const bytes = Buffer.from(revision.html, "base64");
    if ((await sha256Hex(bytes)) !== expected.sourceHtmlSha256)
      throw new Error(`Saved source revision hash mismatch: ${file}`);
    return bytes.toString("utf8");
  }
  return undefined;
}

export async function sourceSamplesFingerprint(
  dataRoot: string,
  expected: TranslationSourceRevision,
): Promise<string | undefined> {
  const html = await matchingTranslationSource(dataRoot, expected);
  if (html === undefined) return undefined;
  const dom = new JSDOM(html);
  try {
    const body = dom.window.document.body;
    let blocks = sourceStatementBlocks(body);
    // Some canonical API fragments wrap every section in anonymous DIVs.
    // This hash-verified fragment contains only statement content; collect its
    // sample wrappers once, without changing the recorded original bytes.
    if (!blocks.length && body.querySelector(".block")) blocks = [body];
    if (!blocks.length)
      throw new Error(
        `Original statement is missing for problem ${expected.problemNo}`,
      );
    return await sha256Hex(JSON.stringify(sampleDataValues(blocks)));
  } finally {
    dom.window.close();
  }
}
