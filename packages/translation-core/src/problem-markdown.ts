import {
  problemReviews,
  metadataReviewStatus,
} from "./problem-review-status.ts";
import MarkdownIt from "markdown-it";
import container from "markdown-it-container";
import { parseProblemMarkdown } from "./problem-frontmatter.ts";
import { PROBLEM_RENDER_MARKUP_VERSION } from "./problem-render-markup.ts";
type Token = ReturnType<ReturnType<typeof MarkdownIt>["parse"]>[number];
export {
  parseProblemMarkdown,
  removeProblemMarkdownMachineLabel,
  setProblemMarkdownReviewStatus,
  type ParsedProblemMarkdown,
} from "./problem-frontmatter.ts";
export type { ProblemMarkdownMetadata } from "./problem-schema.ts";

const markdown = new MarkdownIt({
  breaks: true,
  html: true,
  linkify: false,
  typographer: false,
});
const escapeHtml = markdown.utils.escapeHtml;
export const problemTexClasses = ["tex2jax_ignore", "tex2jax_process"] as const;

// This is deliberately a small structural vocabulary, not arbitrary HTML attrs.
// Language labels never decide whether MathJax should process a PRE.
export function parseProblemFenceInfo(info: string): {
  language: string;
  code: boolean;
  className: string;
  codeClassName: string;
  noFinalNewline: boolean;
} {
  const match = info.trim().match(/^(?:([^\s=]+)(?=\s|$))?(.*)$/u);
  if (!match) throw new Error("Unsupported problem fence metadata");
  const attributes = new Map<string, string>();
  let rest = match[2].trim();
  while (rest) {
    const attribute = rest.match(
      /^(html|class|code-class|eol)="([^"]*)"(?:\s+|$)/u,
    );
    if (!attribute || attributes.has(attribute[1]))
      throw new Error(`Unsupported problem fence metadata: ${info}`);
    attributes.set(attribute[1], attribute[2]);
    rest = rest.slice(attribute[0].length);
  }
  const classValue = (key: string) => {
    const value = attributes.get(key) ?? "";
    if (
      attributes.has(key) &&
      (!value ||
        value
          .split(" ")
          .some(
            (name) => !problemTexClasses.some((allowed) => allowed === name),
          ))
    )
      throw new Error(`Unsupported problem fence class: ${value}`);
    return value;
  };
  if (attributes.has("html") && attributes.get("html") !== "code")
    throw new Error("Problem fence html must be code");
  if (attributes.has("eol") && attributes.get("eol") !== "none")
    throw new Error("Problem fence eol must be none");
  if (attributes.has("code-class") && attributes.get("html") !== "code")
    throw new Error('Problem fence code-class requires html="code"');
  return {
    language: match[1] ?? "",
    code: attributes.get("html") === "code",
    className: classValue("class"),
    codeClassName: classValue("code-class"),
    noFinalNewline: attributes.get("eol") === "none",
  };
}

// @types/markdown-it-container still imports markdown-it 14's types. Its
// runtime plugin API is unchanged; adapt only this registration boundary.
const texContainerPlugin = container as unknown as (
  md: typeof markdown,
  name: string,
  options: {
    validate: (info: string) => boolean;
    render: (tokens: Token[], index: number) => string;
  },
) => void;
markdown.use(texContainerPlugin, "problem_tex_scope", {
  validate: (info: string) =>
    !!info.trim() &&
    info
      .trim()
      .split(/\s+/u)
      .every((name) => problemTexClasses.some((allowed) => allowed === name)),
  render: (tokens: Token[], index: number) =>
    tokens[index].nesting === 1
      ? `<div class="${escapeHtml(tokens[index].info.trim())}">\n`
      : "</div>\n",
});

// A synthetic first LF is consumed by HTML's PRE parsing rule. The content's
// own leading/trailing blank lines survive without introducing a CODE child.
markdown.renderer.rules.paragraph_open = () => "<p>";
markdown.renderer.rules.paragraph_close = () => "</p>\n";
markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  const info = parseProblemFenceInfo(token.info);
  const content = escapeHtml(
    info.noFinalNewline ? token.content.replace(/\n$/u, "") : token.content,
  );
  const attribute = (value: string) =>
    value ? ` class="${escapeHtml(value)}"` : "";
  return `<pre${attribute(info.className)}>\n${
    info.code
      ? `<code${attribute(info.codeClassName)}>${content}</code>`
      : content
  }</pre>\n`;
};
markdown.inline.ruler.before("escape", "problem_tex", (state, silent) => {
  const rest = state.src.slice(state.pos);
  const pair = [
    ["\\(", "\\)"],
    ["\\[", "\\]"],
    ["$$", "$$"],
    ["$", "$"],
  ].find(([open]) => rest.startsWith(open));
  // Preserve the site's delimiters verbatim, including leading whitespace and
  // multiline TeX. Deciding what renders as math belongs to the math renderer.
  if (!pair) return false;
  const end = rest.indexOf(pair[1], pair[0].length);
  if (end < 0) return false;
  const content = rest.slice(0, end + pair[1].length);
  if (!silent) {
    const token = state.push("problem_tex", "", 0);
    token.content = content;
  }
  state.pos += content.length;
  return true;
});
markdown.renderer.rules.problem_tex = (tokens, index) =>
  escapeHtml(tokens[index].content);
function validateTokens(tokens: Token[]): void {
  for (const token of tokens) {
    if (token.type === "html_block" || token.type === "html_inline")
      throw new Error("Problem MDX must use native Markdown instead of HTML");
    if (
      token.type === "inline" &&
      /^\s*(?:import|export)\b/u.test(token.content)
    )
      throw new Error("Problem MDX may not import, export, or execute code");
    if (token.children) validateTokens(token.children);
  }
}
function renderStatement(body: string): string {
  const environment = {};
  const tokens = markdown.parse(body, environment);
  validateTokens(tokens);
  let result = "";
  let section = false;
  let sample = false;
  let lastType = "";
  const closeSample = () => {
    if (sample)
      result += (lastType === "fence" ? "<p></p>" : "") + "</div></div>\n";
    sample = false;
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (
      token.type === "heading_open" &&
      token.level === 0 &&
      token.tag === "h2"
    ) {
      closeSample();
      if (section) result += "</div>\n";
      const title = tokens[i + 1];
      if (!title?.content.trim())
        throw new Error("Problem Markdown section heading is empty");
      result += `<div class="block"><h4 class="shadow">${markdown.renderer.renderInline(title.children ?? [], markdown.options, environment)}</h4>\n`;
      section = true;
      i += 2;
      continue;
    }
    if (!section) {
      if (token.type !== "paragraph_open" || token.level !== 0)
        throw new Error(
          "Problem Markdown may contain only paragraphs before ## sections",
        );
      result += markdown.renderer.render(
        tokens.slice(i, i + 3),
        markdown.options,
        environment,
      );
      i += 2;
      continue;
    }
    if (
      token.type === "heading_open" &&
      token.level === 0 &&
      token.tag === "h3"
    ) {
      const match = tokens[i + 1].content.match(
        /^(.+?)\s+\{file=("(?:[^"\\]|\\.)*")\}\s*$/u,
      );
      closeSample();
      if (match) {
        result += `<div class="sample" data-file="${escapeHtml(JSON.parse(match[2]) as string)}"><h5 class="underline">${escapeHtml(match[1])}</h5><div class="paragraph">\n`;
        sample = true;
        i += 2;
        continue;
      }
    }
    if (
      sample &&
      (token.type === "heading_open" || token.type === "heading_close") &&
      token.tag === "h4"
    )
      token.tag = "h6";
    result +=
      token.type === "inline"
        ? markdown.renderer.renderInline(
            token.children ?? [],
            markdown.options,
            environment,
          )
        : (markdown.renderer.rules[token.type]?.(
            tokens,
            i,
            markdown.options,
            environment,
            markdown.renderer,
          ) ?? markdown.renderer.renderToken(tokens, i, markdown.options));
    lastType = token.type;
  }
  closeSample();
  if (!section)
    throw new Error("Problem Markdown body must contain only ## sections");
  return result + "</div>\n";
}
export function compileProblemMarkdown(source: string): string {
  const { metadata, body } = parseProblemMarkdown(source);
  const machineTranslated = metadata.reviewStatus === "machine";
  const label = machineTranslated ? "[기계 번역] " : "";
  const reviews = problemReviews(metadataReviewStatus(metadata));
  const htmlReviewStatus =
    reviews.human === "approved" ? "approved" : "unreviewed";
  const reviewAttributes =
    typeof metadataReviewStatus(metadata) === "object"
      ? ` data-human-review="${reviews.human ?? "pending"}" data-machine-review="${reviews.machine}"`
      : "";
  const statement = renderStatement(body);
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${label}${escapeHtml(`No.${metadata.problemNo} ${metadata.title}`)}</title>
</head>
<body>
  <main data-yukicoder-ko-problem data-render-markup-version="${PROBLEM_RENDER_MARKUP_VERSION}" data-schema-version="${metadata.schemaVersion}" data-locale="${metadata.locale}" data-problem-no="${metadata.problemNo}" data-problem-id="${metadata.problemId}" data-source-title="${escapeHtml(metadata.sourceTitle)}" data-source-html-sha256="${metadata.sourceHtmlSha256}" data-review-status="${htmlReviewStatus}"${reviewAttributes}>
    <h3>${label}${escapeHtml(`No.${metadata.problemNo} ${metadata.title}`)}</h3>
    <div class="problem-statement">
${statement}
    </div>
  </main>
</body>
</html>
`;
}
