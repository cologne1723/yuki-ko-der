import MarkdownIt from "markdown-it";

export interface ProblemMarkdownMetadata {
  schemaVersion: number;
  locale: "ko";
  problemNo: number;
  problemId: number;
  sourceTitle: string;
  sourceHtmlSha256: string;
  reviewStatus: "machine" | "unreviewed" | "approved";
  title: string;
}

export interface ParsedProblemMarkdown {
  metadata: ProblemMarkdownMetadata;
  body: string;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u;
const SECTION_PATTERN = /^##[ \t]+(.+?)[ \t]*$/gmu;
const TEX_PATTERN =
  /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$(?!\s)[^$\n]+?\$/gu;
const SAMPLE_HEADING_PATTERN =
  /^###[ \t]+(.+?)[ \t]+\{file=("(?:[^"\\]|\\.)*")\}[ \t]*$/gmu;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(`Invalid quoted frontmatter value: ${trimmed}`);
    }
  }
  if (/^\d+$/u.test(trimmed)) return Number(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

export function parseProblemMarkdown(source: string): ParsedProblemMarkdown {
  const frontmatter = source.match(FRONTMATTER_PATTERN);
  if (!frontmatter) {
    throw new Error("Problem Markdown must start with YAML-style frontmatter");
  }
  const fields = new Map<string, unknown>();
  for (const line of frontmatter[1].split(/\r?\n/u)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error(`Invalid frontmatter line: ${line}`);
    const key = line.slice(0, separator).trim();
    if (fields.has(key)) throw new Error(`Duplicate frontmatter field: ${key}`);
    fields.set(key, parseScalar(line.slice(separator + 1)));
  }

  const metadata = Object.fromEntries(
    fields,
  ) as unknown as ProblemMarkdownMetadata;
  const expected: Record<keyof ProblemMarkdownMetadata, string> = {
    schemaVersion: "number",
    locale: "string",
    problemNo: "number",
    problemId: "number",
    sourceTitle: "string",
    sourceHtmlSha256: "string",
    reviewStatus: "string",
    title: "string",
  };
  for (const [key, type] of Object.entries(expected)) {
    if (typeof metadata[key as keyof ProblemMarkdownMetadata] !== type) {
      throw new Error(`Problem Markdown frontmatter requires ${key}: ${type}`);
    }
  }
  if (
    metadata.schemaVersion !== 1 ||
    metadata.locale !== "ko" ||
    !Number.isSafeInteger(metadata.problemNo) ||
    !Number.isSafeInteger(metadata.problemId) ||
    !/^[a-f0-9]{64}$/u.test(metadata.sourceHtmlSha256) ||
    !["machine", "unreviewed", "approved"].includes(metadata.reviewStatus)
  ) {
    throw new Error("Problem Markdown frontmatter metadata is invalid");
  }

  return {
    metadata,
    body: source.slice(frontmatter[0].length).trim(),
  };
}

function protectTex(source: string): {
  markdown: string;
  restore(html: string): string;
} {
  const formulas: string[] = [];
  const markdown = source.replace(TEX_PATTERN, (formula) => {
    const index = formulas.push(formula) - 1;
    return `YUKICODERTEXPLACEHOLDER${index}END`;
  });
  return {
    markdown,
    restore: (html) =>
      html.replace(/YUKICODERTEXPLACEHOLDER(\d+)END/gu, (_, index: string) =>
        escapeHtml(formulas[Number(index)] ?? ""),
      ),
  };
}

const markdown = new MarkdownIt({
  breaks: true,
  html: true,
  linkify: false,
  typographer: false,
});
markdown.renderer.rules.fence = (tokens, index) =>
  `<pre>${escapeHtml(tokens[index].content)}</pre>\n`;

function hasSampleExplanation(source: string): boolean {
  const output = source.match(/^####[ \t]+출력[ \t]*$/mu);
  if (!output || output.index === undefined) return true;
  const afterHeading = source.slice(output.index + output[0].length).trim();
  const fence = afterHeading.match(/^(`{3,}|~{3,})[^\n]*\n/u);
  if (!fence) return true;
  const closingPattern = new RegExp(`\\n${fence[1]}[ \\t]*(?:\\n|$)`, "u");
  const closing = closingPattern.exec(afterHeading.slice(fence[0].length));
  if (!closing || closing.index === undefined) return true;
  return Boolean(
    afterHeading
      .slice(fence[0].length + closing.index + closing[0].length)
      .trim(),
  );
}

function withoutFencedCode(source: string): string {
  const retained: string[] = [];
  let closingFence: string | undefined;
  for (const line of source.split("\n")) {
    const fence = line.match(/^[ \t]*(`{3,}|~{3,})/u)?.[1];
    if (!closingFence && fence) {
      closingFence = fence;
      continue;
    }
    if (closingFence && line.trimStart().startsWith(closingFence)) {
      closingFence = undefined;
      continue;
    }
    if (!closingFence) retained.push(line);
  }
  return retained.join("\n");
}

function assertConstrainedMdx(source: string): void {
  if (/^\s*(?:import|export)\b/gmu.test(source)) {
    throw new Error("Problem MDX may not import, export, or execute code");
  }
  const nativeMarkdown = withoutFencedCode(source);
  const rawTag = nativeMarkdown.match(/<\/?([A-Za-z][A-Za-z0-9.]*)\b/u);
  if (rawTag) {
    throw new Error(
      `Problem MDX must use native Markdown instead of <${rawTag[1]}>`,
    );
  }
}

function expandMdx(source: string): string {
  assertConstrainedMdx(source);
  const matches = [...source.matchAll(SAMPLE_HEADING_PATTERN)];
  if (matches.length === 0) return source.trim();
  let expanded = "";
  let cursor = 0;
  for (const [index, match] of matches.entries()) {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? source.length;
    expanded += source.slice(cursor, start);
    const title = match[1].trim();
    const file = JSON.parse(match[2]) as string;
    const sampleBody = source.slice(start + match[0].length, end).trim();
    const content = sampleBody.replace(
      /^####[ \t]+(.+?)[ \t]*$/gmu,
      "###### $1",
    );
    const emptyExplanation = hasSampleExplanation(sampleBody)
      ? ""
      : "\n\n<p></p>";
    expanded += `<div class="sample" data-file="${escapeHtml(file)}">

<h5 class="underline">${escapeHtml(title)}</h5>

<div class="paragraph">

${content}${emptyExplanation}

</div>

</div>`;
    cursor = end;
  }
  return expanded.trim();
}

function renderSectionBody(source: string): string {
  const protectedSource = protectTex(expandMdx(source));
  return protectedSource.restore(markdown.render(protectedSource.markdown));
}

function sections(body: string): Array<{ title: string; body: string }> {
  const matches = [...body.matchAll(SECTION_PATTERN)];
  if (matches.length === 0 || body.slice(0, matches[0].index).trim()) {
    throw new Error("Problem Markdown body must contain only ## sections");
  }
  return matches.map((match, index) => ({
    title: match[1].trim(),
    body: body
      .slice(
        (match.index ?? 0) + match[0].length,
        matches[index + 1]?.index ?? body.length,
      )
      .trim(),
  }));
}

export function compileProblemMarkdown(source: string): string {
  const { metadata, body } = parseProblemMarkdown(source);
  assertConstrainedMdx(body);
  const machineTranslated = metadata.reviewStatus === "machine";
  const label = machineTranslated ? "[기계 번역] " : "";
  const htmlReviewStatus = machineTranslated
    ? "unreviewed"
    : metadata.reviewStatus;
  const statement = sections(body)
    .map(
      (section) => `      <div class="block">
        <h4 class="shadow">${escapeHtml(section.title)}</h4>
${renderSectionBody(section.body).trimEnd()}
      </div>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${label}${escapeHtml(`No.${metadata.problemNo} ${metadata.title}`)}</title>
</head>
<body>
  <main data-yukicoder-ko-problem data-schema-version="${metadata.schemaVersion}" data-locale="${metadata.locale}" data-problem-no="${metadata.problemNo}" data-problem-id="${metadata.problemId}" data-source-title="${escapeHtml(metadata.sourceTitle)}" data-source-html-sha256="${metadata.sourceHtmlSha256}" data-review-status="${htmlReviewStatus}">
    <h3>${label}${escapeHtml(`No.${metadata.problemNo} ${metadata.title}`)}</h3>
    <div class="problem-statement">
${statement}
    </div>
  </main>
</body>
</html>
`;
}

function replaceFrontmatterField(
  source: string,
  key: keyof ProblemMarkdownMetadata,
  value: string,
): string {
  const frontmatter = source.match(FRONTMATTER_PATTERN);
  if (!frontmatter) throw new Error("Problem Markdown frontmatter is missing");
  const pattern = new RegExp(`^(${key}:[ \\t]*).*$`, "mu");
  if (!pattern.test(frontmatter[1])) {
    throw new Error(`Problem Markdown frontmatter requires ${key}`);
  }
  const updated = frontmatter[1].replace(pattern, `$1${value}`);
  return source.replace(frontmatter[1], updated);
}

export function setProblemMarkdownReviewStatus(
  source: string,
  status: "unreviewed" | "approved",
): string {
  return replaceFrontmatterField(source, "reviewStatus", status);
}

export function removeProblemMarkdownMachineLabel(source: string): string {
  return parseProblemMarkdown(source).metadata.reviewStatus === "machine"
    ? setProblemMarkdownReviewStatus(source, "unreviewed")
    : source;
}
