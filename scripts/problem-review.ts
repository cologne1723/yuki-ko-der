import { createHash, randomUUID } from "node:crypto";
import {
  access,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { extname, join } from "node:path";
import { JSDOM } from "jsdom";
import {
  compileProblemMarkdown,
  removeProblemMarkdownMachineLabel,
  setProblemMarkdownReviewStatus,
} from "../src/problem-markdown.ts";

export type ReviewStatus = "unreviewed" | "approved";

export interface ProblemSummary {
  problemNo: number;
  japaneseTitle: string;
  koreanTitle: string;
  reviewStatus: ReviewStatus;
  machineTranslated: boolean;
}

export interface ProblemReview extends ProblemSummary {
  japaneseHtml: string;
  koreanSource: string;
  koreanHtml: string;
  sourceFormat: "html" | "mdx";
  revision: string;
  validationWarnings: string[];
}

export interface SaveResult extends ProblemReview {}

interface ProblemMetadata {
  No: number;
  ProblemId: number;
  Title: string;
}

interface ProblemIndex {
  problems: ProblemMetadata[];
}

interface TranslationEngine {
  parseHtml(html: string): Document;
  parseTranslationDocument(
    html: string,
    problemNo: number,
    problemId: string,
  ): { root: HTMLElement; title: HTMLElement; blocks: Element[] };
  structuralStatement(elements: Element[]): string;
}

const MACHINE_LABEL = "[기계 번역]";
const MAIN_OPENING = /<main\b(?=[^>]*\bdata-yukicoder-ko-problem\b)[^>]*>/u;

const engineDom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  document: engineDom.window.document,
  Node: engineDom.window.Node,
  NodeFilter: engineDom.window.NodeFilter,
  DOMParser: engineDom.window.DOMParser,
});
await import("../src/problem-translations.ts");
const engine = (
  globalThis as typeof globalThis & {
    yukicoderProblemTranslations: { testApi: TranslationEngine };
  }
).yukicoderProblemTranslations.testApi;

export class ReviewError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function occurrences(values: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function structuralValues(
  statement: string,
  kind: "formulas" | "pre",
): string[] {
  const result: string[] = [];
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (value[0] === kind) {
      if (kind === "formulas" && Array.isArray(value[1])) {
        result.push(
          ...value[1].filter(
            (item): item is string => typeof item === "string",
          ),
        );
      } else if (kind === "pre" && typeof value[1] === "string") {
        result.push(value[1]);
      }
      return;
    }
    for (const child of value) visit(child);
  };
  visit(JSON.parse(statement) as unknown);
  return result;
}

function displayedFormula(value: string): string {
  if (value.startsWith("\\(") && value.endsWith("\\)")) {
    return `$${value.slice(2, -2)}$`;
  }
  if (value.startsWith("\\[") && value.endsWith("\\]")) {
    return `$$${value.slice(2, -2)}$$`;
  }
  return value;
}

function shortened(value: string, maximum = 160): string {
  const normalized = value.replace(/\r\n?/gu, "\n");
  return normalized.length <= maximum
    ? JSON.stringify(normalized)
    : `${JSON.stringify(normalized.slice(0, maximum))}…`;
}

function differenceWarnings(
  source: readonly string[],
  translated: readonly string[],
  sourceMessage: (value: string, count: number) => string,
  translatedMessage: (value: string, count: number) => string,
): string[] {
  const warnings: string[] = [];
  const sourceCounts = occurrences(source);
  const translatedCounts = occurrences(translated);
  for (const [value, count] of sourceCounts) {
    const missing = count - (translatedCounts.get(value) ?? 0);
    if (missing > 0) warnings.push(sourceMessage(value, missing));
  }
  for (const [value, count] of translatedCounts) {
    const added = count - (sourceCounts.get(value) ?? 0);
    if (added > 0) warnings.push(translatedMessage(value, added));
  }
  return warnings;
}

function relevantChildren(element: Element): Element[] {
  return [...element.children].filter((child) => {
    if (child.matches("br, script, style, .copy-sample-input")) return false;
    const sample = child.closest<HTMLElement>(".sample[data-file]");
    return !(
      sample &&
      child.tagName === "SPAN" &&
      child.parentElement?.matches("h5") &&
      child.textContent?.trim() === `(${sample.dataset.file})`
    );
  });
}

function attributeMap(element: Element): Map<string, string> {
  return new Map(
    [...element.attributes].map(({ name, value }) => [name, value]),
  );
}

function elementDifferenceWarnings(
  sourceBlocks: Element[],
  translatedBlocks: Element[],
): string[] {
  const warnings: string[] = [];
  const compare = (
    source: Element | undefined,
    translated: Element | undefined,
    path: string,
  ): void => {
    if (!source && translated) {
      warnings.push(
        `번역문에만 ${path} 요소가 있습니다: ${shortened(translated.outerHTML)}`,
      );
      return;
    }
    if (source && !translated) {
      warnings.push(
        `원문에만 ${path} 요소가 있습니다: ${shortened(source.outerHTML)}`,
      );
      return;
    }
    if (!source || !translated) return;
    if (source.tagName !== translated.tagName) {
      warnings.push(
        `${path}의 요소가 다릅니다. 원문: <${source.tagName.toLowerCase()}> / 번역문: <${translated.tagName.toLowerCase()}>`,
      );
      return;
    }

    const sourceAttributes = attributeMap(source);
    const translatedAttributes = attributeMap(translated);
    const attributeNames = new Set([
      ...sourceAttributes.keys(),
      ...translatedAttributes.keys(),
    ]);
    for (const name of [...attributeNames].sort()) {
      const sourceValue = sourceAttributes.get(name);
      const translatedValue = translatedAttributes.get(name);
      if (sourceValue === translatedValue) continue;
      warnings.push(
        `${path}의 ${name} 속성이 다릅니다. 원문: ${JSON.stringify(sourceValue ?? "(없음)")} / 번역문: ${JSON.stringify(translatedValue ?? "(없음)")}`,
      );
    }

    const sourceChildren = relevantChildren(source);
    const translatedChildren = relevantChildren(translated);
    const count = Math.max(sourceChildren.length, translatedChildren.length);
    for (let index = 0; index < count; index += 1) {
      compare(
        sourceChildren[index],
        translatedChildren[index],
        `${path} > ${sourceChildren[index]?.tagName.toLowerCase() ?? translatedChildren[index]?.tagName.toLowerCase() ?? "요소"}[${index + 1}]`,
      );
    }
  };

  const count = Math.max(sourceBlocks.length, translatedBlocks.length);
  for (let index = 0; index < count; index += 1) {
    compare(sourceBlocks[index], translatedBlocks[index], `문단 ${index + 1}`);
  }
  return warnings;
}

export function structuralWarnings(
  sourceBlocks: Element[],
  translatedBlocks: Element[],
): string[] {
  const sourceStatement = engine.structuralStatement(sourceBlocks);
  const translatedStatement = engine.structuralStatement(translatedBlocks);
  if (sourceStatement === translatedStatement) return [];

  const countSuffix = (count: number): string =>
    count > 1 ? ` (${count}개 차이)` : "";
  const warnings = differenceWarnings(
    structuralValues(sourceStatement, "formulas"),
    structuralValues(translatedStatement, "formulas"),
    (formula, count) =>
      `원문에는 수식 ${JSON.stringify(displayedFormula(formula))}이 있지만 번역문에는 없습니다.${countSuffix(count)}`,
    (formula, count) =>
      `번역문에는 수식 ${JSON.stringify(displayedFormula(formula))}이 있지만 원문에는 없습니다.${countSuffix(count)}`,
  );

  const sourceCode = structuralValues(sourceStatement, "pre");
  const translatedCode = structuralValues(translatedStatement, "pre");
  const codeCount = Math.max(sourceCode.length, translatedCode.length);
  for (let index = 0; index < codeCount; index += 1) {
    if (sourceCode[index] === translatedCode[index]) continue;
    if (sourceCode[index] === undefined) {
      warnings.push(
        `번역문에만 코드 블록 ${index + 1}이 있습니다: ${shortened(translatedCode[index] ?? "")}`,
      );
    } else if (translatedCode[index] === undefined) {
      warnings.push(
        `원문에만 코드 블록 ${index + 1}이 있습니다: ${shortened(sourceCode[index])}`,
      );
    } else {
      warnings.push(
        `코드 블록 ${index + 1}이 다릅니다. 원문: ${shortened(sourceCode[index])} / 번역문: ${shortened(translatedCode[index])}`,
      );
    }
  }

  const sampleFiles = (blocks: Element[]): string[] =>
    blocks.flatMap((block) =>
      [...block.querySelectorAll<HTMLElement>(".sample[data-file]")].map(
        (sample) => sample.dataset.file ?? "(data-file 없음)",
      ),
    );
  warnings.push(
    ...differenceWarnings(
      sampleFiles(sourceBlocks),
      sampleFiles(translatedBlocks),
      (file, count) =>
        `원문에는 data-file=${JSON.stringify(file)}인 예제가 있지만 번역문에는 없습니다.${countSuffix(count)}`,
      (file, count) =>
        `번역문에는 data-file=${JSON.stringify(file)}인 예제가 있지만 원문에는 없습니다.${countSuffix(count)}`,
    ),
  );

  warnings.push(...elementDifferenceWarnings(sourceBlocks, translatedBlocks));

  if (warnings.length === 0) {
    warnings.push(
      `원문과 번역문의 구조 값이 다릅니다. 원문: ${shortened(sourceStatement, 400)} / 번역문: ${shortened(translatedStatement, 400)}`,
    );
  }
  return warnings;
}

export function parseReviewState(html: string): {
  koreanTitle: string;
  machineTranslated: boolean;
  reviewStatus: ReviewStatus;
} {
  const document = engine.parseHtml(html);
  const root = document.querySelector<HTMLElement>(
    "main[data-yukicoder-ko-problem]",
  );
  const pageTitle = document.querySelector("title")?.textContent?.trim() ?? "";
  const heading = root?.querySelector(":scope > h3")?.textContent?.trim() ?? "";
  const reviewStatus = root?.dataset.reviewStatus;
  if (!root || !heading || !pageTitle) {
    throw new ReviewError(
      "Korean translation title or main element is missing",
    );
  }
  if (reviewStatus !== "unreviewed" && reviewStatus !== "approved") {
    throw new ReviewError(
      "Problem review status must be unreviewed or approved",
    );
  }
  if (
    pageTitle.includes("(!)") ||
    heading.includes("(!)") ||
    pageTitle.includes("📝") ||
    heading.includes("📝")
  ) {
    throw new ReviewError("Problem HTML still uses a draft marker");
  }
  if ((html.match(/\(!\)|📝/gu) ?? []).length > 0) {
    throw new ReviewError("Problem HTML may not use the fixed-UI draft marker");
  }
  const pageIsMachine = pageTitle.startsWith(MACHINE_LABEL);
  const headingIsMachine = heading.startsWith(MACHINE_LABEL);
  if (pageIsMachine !== headingIsMachine) {
    throw new ReviewError(
      "Machine-translation labels must match in title and h3",
    );
  }
  if (reviewStatus === "approved" && pageIsMachine) {
    throw new ReviewError(
      "Approved translations cannot retain the machine label",
    );
  }
  const machineLabelCount = (html.match(/\[기계 번역\]/gu) ?? []).length;
  if (machineLabelCount !== (pageIsMachine ? 2 : 0)) {
    throw new ReviewError("Machine labels may appear only in title and h3");
  }
  if ((html.match(/\bdata-review-status=/gu) ?? []).length !== 1) {
    throw new ReviewError(
      "Problem HTML must contain exactly one review status",
    );
  }
  return {
    koreanTitle: heading
      .replace(/^\[기계 번역\]\s*/u, "")
      .replace(/^No\.\d+\s*/u, ""),
    machineTranslated: pageIsMachine,
    reviewStatus,
  };
}

export function setReviewStatus(
  html: string,
  reviewStatus: ReviewStatus,
): string {
  const opening = html.match(MAIN_OPENING)?.[0];
  if (!opening) {
    throw new ReviewError("Problem translation main element is missing");
  }
  const updated = /\sdata-review-status=(?:"[^"]*"|'[^']*')/u.test(opening)
    ? opening.replace(
        /\sdata-review-status=(?:"[^"]*"|'[^']*')/u,
        ` data-review-status="${reviewStatus}"`,
      )
    : opening.includes("\n")
      ? (() => {
          const closingMatch = opening.match(/\n([ \t]*)>$/u);
          if (closingMatch) {
            const closingIndent = closingMatch[1];
            return opening.replace(
              /\n([ \t]*)>$/u,
              `\n${closingIndent}  data-review-status="${reviewStatus}"\n${closingIndent}>`,
            );
          }
          const attributeIndent =
            opening
              .split("\n")
              .at(-1)
              ?.match(/^[ \t]*/u)?.[0] ?? "";
          const closingIndent = attributeIndent.slice(0, -2);
          return opening.replace(
            />$/u,
            `\n${attributeIndent}data-review-status="${reviewStatus}"\n${closingIndent}>`,
          );
        })()
      : opening.replace(/>$/u, ` data-review-status="${reviewStatus}">`);
  return html.replace(opening, updated);
}

export function removeMachineLabel(html: string): string {
  return html
    .replace(/(<title\b[^>]*>\s*)\[기계 번역\]\s*/u, "$1")
    .replace(/(<h3\b[^>]*>\s*)\[기계 번역\]\s*/u, "$1");
}

export function migrateProblemReviewHtml(html: string): string {
  const migrated = html
    .replace(/(<title\b[^>]*>\s*)\(!\)\s*/u, `$1${MACHINE_LABEL} `)
    .replace(/(<h3\b[^>]*>\s*)\(!\)\s*/u, `$1${MACHINE_LABEL} `);
  const opening = migrated.match(MAIN_OPENING)?.[0];
  if (!opening)
    throw new ReviewError("Problem translation main element is missing");
  const existingStatus = opening.match(
    /\s+data-review-status=(?:"(unreviewed|approved)"|'(unreviewed|approved)')/u,
  );
  const reviewStatus = (existingStatus?.[1] ??
    existingStatus?.[2] ??
    "unreviewed") as ReviewStatus;
  const withoutStatus = opening.replace(
    /\s+data-review-status=(?:"[^"]*"|'[^']*')/u,
    "",
  );
  return setReviewStatus(
    migrated.replace(opening, withoutStatus),
    reviewStatus,
  );
}

export class ProblemReviewStore {
  readonly sourceDirectory: string;
  readonly translationDirectory: string;
  readonly indexPath: string;

  constructor(readonly repositoryRoot: string) {
    this.sourceDirectory = join(repositoryRoot, "tmp", "problems-source");
    this.translationDirectory = join(
      repositoryRoot,
      "problem-translations",
      "ko",
      "problems",
    );
    this.indexPath = join(this.sourceDirectory, "index.json");
  }

  private async metadata(): Promise<Map<number, ProblemMetadata>> {
    const index = JSON.parse(
      await readFile(this.indexPath, "utf8"),
    ) as ProblemIndex;
    return new Map(index.problems.map((problem) => [problem.No, problem]));
  }

  private paths(problemNo: number): {
    japanese: string;
    koreanHtml: string;
    koreanMdx: string;
  } {
    if (!Number.isSafeInteger(problemNo) || problemNo < 0) {
      throw new ReviewError("Problem number must be a non-negative integer");
    }
    return {
      japanese: join(this.sourceDirectory, `${problemNo}.html`),
      koreanHtml: join(this.translationDirectory, `${problemNo}.html`),
      koreanMdx: join(this.translationDirectory, `${problemNo}.mdx`),
    };
  }

  private async translationPath(problemNo: number): Promise<string> {
    const paths = this.paths(problemNo);
    try {
      await access(paths.koreanMdx);
      return paths.koreanMdx;
    } catch {
      return paths.koreanHtml;
    }
  }

  private compile(path: string, source: string): string {
    return extname(path) === ".mdx" ? compileProblemMarkdown(source) : source;
  }

  async list(): Promise<ProblemSummary[]> {
    const metadata = await this.metadata();
    const available = new Map<number, string>();
    for (const filename of await readdir(this.translationDirectory)) {
      const match = filename.match(/^(\d+)\.(html|mdx)$/u);
      if (!match) continue;
      const problemNo = Number(match[1]);
      if (available.has(problemNo)) {
        throw new ReviewError(
          `Problem ${problemNo} has both HTML and MDX sources`,
        );
      }
      available.set(problemNo, filename);
    }
    const filenames = [...available.values()].sort(
      (left, right) => Number.parseInt(left) - Number.parseInt(right),
    );
    return Promise.all(
      filenames.map(async (filename) => {
        const problemNo = Number.parseInt(filename, 10);
        const problem = metadata.get(problemNo);
        if (!problem) {
          throw new ReviewError(
            `Problem ${problemNo} is absent from the saved index`,
          );
        }
        const path = join(this.translationDirectory, filename);
        const source = await readFile(path, "utf8");
        const html = this.compile(path, source);
        return {
          problemNo,
          japaneseTitle: problem.Title,
          ...parseReviewState(html),
        };
      }),
    );
  }

  async get(problemNo: number): Promise<ProblemReview> {
    const paths = this.paths(problemNo);
    const koreanPath = await this.translationPath(problemNo);
    let japaneseHtml: string;
    let koreanSource: string;
    let koreanHtml: string;
    try {
      [japaneseHtml, koreanSource] = await Promise.all([
        readFile(paths.japanese, "utf8"),
        readFile(koreanPath, "utf8"),
      ]);
      koreanHtml = this.compile(koreanPath, koreanSource);
    } catch {
      throw new ReviewError(
        `Problem ${problemNo} source or translation is missing`,
        404,
      );
    }
    const metadata = (await this.metadata()).get(problemNo);
    if (!metadata) {
      throw new ReviewError(
        `Problem ${problemNo} is absent from the saved index`,
        404,
      );
    }
    const validationWarnings = this.validate(
      problemNo,
      japaneseHtml,
      koreanHtml,
      metadata,
    );
    return {
      problemNo,
      japaneseTitle: metadata.Title,
      japaneseHtml,
      koreanSource,
      koreanHtml,
      sourceFormat: extname(koreanPath) === ".mdx" ? "mdx" : "html",
      revision: sha256(koreanSource),
      validationWarnings,
      ...parseReviewState(koreanHtml),
    };
  }

  private validate(
    problemNo: number,
    japaneseHtml: string,
    koreanHtml: string,
    metadata: ProblemMetadata,
  ): string[] {
    const parsed = engine.parseHtml(koreanHtml);
    const root = parsed.querySelector<HTMLElement>(
      "main[data-yukicoder-ko-problem]",
    );
    const problemId = root?.dataset.problemId;
    if (!problemId) throw new ReviewError("Problem ID metadata is missing");
    const translation = engine.parseTranslationDocument(
      koreanHtml,
      problemNo,
      problemId,
    );
    if (
      Number(problemId) !== metadata.ProblemId ||
      translation.root.dataset.sourceTitle !== metadata.Title
    ) {
      throw new ReviewError(
        "Problem number, ID, or Japanese title metadata changed",
      );
    }
    const sourceHash = sha256(japaneseHtml);
    if (translation.root.dataset.sourceHtmlSha256 !== sourceHash) {
      throw new ReviewError(
        `Saved Japanese source hash differs from translation metadata (${sourceHash})`,
      );
    }
    const source = engine.parseHtml(japaneseHtml);
    const sourceBlocks = [...source.body.querySelectorAll(":scope > .block")];
    const warnings = structuralWarnings(sourceBlocks, translation.blocks);
    parseReviewState(koreanHtml);
    return warnings;
  }

  async save(
    problemNo: number,
    submittedSource: string,
    expectedRevision: string,
    action: "save" | "approve" | "unapprove",
  ): Promise<ProblemReview> {
    const current = await this.get(problemNo);
    if (current.revision !== expectedRevision) {
      throw new ReviewError(
        "The translation changed on disk; reload before saving",
        409,
      );
    }
    const metadata = (await this.metadata()).get(problemNo)!;
    let nextSource = submittedSource;
    if (current.sourceFormat === "mdx") {
      if (action === "save") {
        nextSource = setProblemMarkdownReviewStatus(
          removeProblemMarkdownMachineLabel(nextSource),
          current.reviewStatus,
        );
      } else if (action === "approve") {
        nextSource = setProblemMarkdownReviewStatus(
          removeProblemMarkdownMachineLabel(nextSource),
          "approved",
        );
      } else {
        if (submittedSource !== current.koreanSource) {
          throw new ReviewError("Save editor changes before unapproving");
        }
        nextSource = setProblemMarkdownReviewStatus(
          current.koreanSource,
          "unreviewed",
        );
      }
    } else if (action === "save") {
      nextSource = setReviewStatus(
        removeMachineLabel(nextSource),
        current.reviewStatus,
      );
    } else if (action === "approve") {
      nextSource = setReviewStatus(removeMachineLabel(nextSource), "approved");
    } else {
      if (submittedSource !== current.koreanSource) {
        throw new ReviewError("Save editor changes before unapproving");
      }
      nextSource = setReviewStatus(current.koreanSource, "unreviewed");
    }
    const nextHtml =
      current.sourceFormat === "mdx"
        ? compileProblemMarkdown(nextSource)
        : nextSource;
    this.validate(problemNo, current.japaneseHtml, nextHtml, metadata);
    const path = await this.translationPath(problemNo);
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, nextSource, "utf8");
      await rename(temporaryPath, path);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
    return this.get(problemNo);
  }
}
