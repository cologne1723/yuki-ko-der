import { JSDOM } from "jsdom";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicFile } from "./atomic-file.ts";
import {
  detectProblemRenderProfile,
  type ProblemRenderProfile,
} from "./problem-render-profile.ts";
import { sha256Hex } from "./sha256.ts";
import { z } from "./validation.ts";

const recordSchema = z.object({
  schemaVersion: z.literal(1),
  problemNo: z.number().int().positive(),
  sourceUrl: z.string().url(),
  fetchedAt: z.string().datetime(),
  pageHtmlSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  scriptSrcs: z.array(z.string()),
  profile: z.object({
    engine: z.enum(["mathjax", "katex"]),
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  }),
});

export type ProblemRenderProfileRecord = z.infer<typeof recordSchema>;

export function problemPublicSourceUrl(problemNo: number): string {
  if (!Number.isSafeInteger(problemNo) || problemNo < 1)
    throw new Error("Invalid public problem number");
  return `https://yukicoder.me/problems/no/${problemNo}`;
}

export function problemRenderProfileDirectory(dataRoot: string): string {
  return join(dataRoot, "problem-render-profiles");
}

function pageEvidence(html: string, sourceUrl: string, problemNo: number) {
  const dom = new JSDOM(html, { url: sourceUrl });
  try {
    const document = dom.window.document;
    // API statement fragments are deliberately insufficient evidence.
    const content = document.querySelector<HTMLElement>("#content");
    const problemId = content?.dataset.problemId ?? "";
    // Unsectioned puzzle statements still have the site's problem identity,
    // HTML-copy control and matching submission form. Do not accept a bare
    // fragment or a login page just because it includes renderer scripts.
    const unsectionedProblem =
      /^[1-9]\d*$/u.test(problemId) &&
      content
        ?.querySelector(":scope > h3")
        ?.textContent?.trim()
        .match(/^No\.(\d+)(?:\s|$)/u)?.[1] === String(problemNo) &&
      content?.querySelector("#copy-problem-html-btn") &&
      content?.querySelector(
        `:scope > form[action="/problems/${problemId}/submit"]`,
      );
    if (!document.querySelector("#content .block") && !unsectionedProblem)
      throw new Error(`Public problem page statement is missing: ${sourceUrl}`);
    // The public document title identifies No; data-problem-id is an internal ID.
    // Never use editable/translated statement headings to establish this identity.
    const titleNo = document.title.trim().match(/^No\.(\d+)(?:\s|$)/u)?.[1];
    if (!titleNo || Number(titleNo) !== problemNo)
      throw new Error(
        `Public problem page identity mismatch: expected No.${problemNo}, title ${JSON.stringify(document.title)}`,
      );
    for (const marker of document.querySelectorAll(
      'head link[rel~="canonical"], head meta[property="og:url"]',
    )) {
      const value = marker.getAttribute(
        marker.tagName === "LINK" ? "href" : "content",
      );
      if (!value || new URL(value, sourceUrl).href !== sourceUrl)
        throw new Error(
          `Public problem page identity URL mismatch for No.${problemNo}: ${JSON.stringify(value)}`,
        );
    }
    for (const marker of document.querySelectorAll(
      "#contest-problem-selector-wrapper[data-current-problem-no]",
    )) {
      const value = marker.getAttribute("data-current-problem-no") ?? "";
      if (!/^\d+$/u.test(value) || Number(value) !== problemNo)
        throw new Error(
          `Public problem page selector identity mismatch for No.${problemNo}`,
        );
    }
    // Standalone publications use meta tags; collection accepts script evidence only.
    document
      .querySelectorAll(
        'meta[name="yukicoder-ko-math-engine"], meta[name="yukicoder-ko-math-version"]',
      )
      .forEach((meta) => meta.remove());
    const profile = detectProblemRenderProfile(document);
    if (!profile)
      throw new Error(
        `Render profile is absent or ambiguous in public page scripts: ${sourceUrl}`,
      );
    const scriptSrcs = [...document.querySelectorAll("script[src]")].map(
      (script) => script.getAttribute("src")!,
    );
    return { profile, scriptSrcs };
  } finally {
    dom.window.close();
  }
}

/** Save the full fetched page as evidence; never update canonical API sources. */
export async function writeProblemRenderProfile(
  dataRoot: string,
  problemNo: number,
  pageHtml: string,
  fetchedAt = new Date().toISOString(),
): Promise<ProblemRenderProfileRecord> {
  const sourceUrl = problemPublicSourceUrl(problemNo);
  const evidence = pageEvidence(pageHtml, sourceUrl, problemNo);
  const record = recordSchema.parse({
    schemaVersion: 1,
    problemNo,
    sourceUrl,
    fetchedAt,
    pageHtmlSha256: await sha256Hex(pageHtml),
    ...evidence,
  });
  const directory = problemRenderProfileDirectory(dataRoot);
  await mkdir(join(directory, "pages"), { recursive: true });
  await atomicFile(
    join(directory, "pages", `${record.pageHtmlSha256}.html`),
    pageHtml,
  );
  await atomicFile(
    join(directory, `${problemNo}.json`),
    JSON.stringify(record, null, 2) + "\n",
  );
  return record;
}

/** Undefined means uncollected; corrupt/mismatched evidence is an explicit error. */
export async function readProblemRenderProfileRecord(
  dataRoot: string,
  problemNo: number,
): Promise<ProblemRenderProfileRecord | undefined> {
  const sourceUrl = problemPublicSourceUrl(problemNo);
  const directory = problemRenderProfileDirectory(dataRoot);
  let raw: string;
  try {
    raw = await readFile(join(directory, `${problemNo}.json`), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const record = recordSchema.parse(JSON.parse(raw));
  if (record.problemNo !== problemNo || record.sourceUrl !== sourceUrl)
    throw new Error(
      `Render profile identity mismatch for problem ${problemNo}`,
    );
  const html = await readFile(
    join(directory, "pages", `${record.pageHtmlSha256}.html`),
    "utf8",
  );
  if ((await sha256Hex(html)) !== record.pageHtmlSha256)
    throw new Error(
      `Render profile page hash mismatch for problem ${problemNo}`,
    );
  const evidence = pageEvidence(html, sourceUrl, problemNo);
  if (
    evidence.profile.engine !== record.profile.engine ||
    evidence.profile.version !== record.profile.version ||
    JSON.stringify(evidence.scriptSrcs) !== JSON.stringify(record.scriptSrcs)
  )
    throw new Error(
      `Render profile script evidence mismatch for problem ${problemNo}`,
    );
  return record;
}

/** Shared build/review reader. Callers must surface an uncollected profile. */
export async function readProblemRenderProfile(
  dataRoot: string,
  problemNo: number,
): Promise<ProblemRenderProfile | undefined> {
  return (await readProblemRenderProfileRecord(dataRoot, problemNo))?.profile;
}
