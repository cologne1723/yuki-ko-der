import {
  problemReviews,
  metadataReviewStatus,
} from "./problem-review-status.ts";
import MarkdownIt from "markdown-it";
import { parseProblemMarkdown } from "./problem-frontmatter.ts";
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
// HTML drops the first LF immediately after <pre>. A code child protects every
// initial blank line, and no trimming is performed on fenced data.
markdown.renderer.rules.paragraph_open = () => "<p>";
markdown.renderer.rules.paragraph_close = () => "</p>\n";
markdown.renderer.rules.fence = (tokens, index) =>
  `<pre><code>${escapeHtml(tokens[index].content)}</code></pre>\n`;
markdown.inline.ruler.before("escape", "problem_tex", (state, silent) => {
  const rest = state.src.slice(state.pos);
  const pair = [
    ["\\(", "\\)"],
    ["\\[", "\\]"],
    ["$$", "$$"],
    ["$", "$"],
  ].find(([open]) => rest.startsWith(open));
  if (!pair || (pair[0] === "$" && /\s/u.test(rest[1] ?? " "))) return false;
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
  <main data-yukicoder-ko-problem data-schema-version="${metadata.schemaVersion}" data-locale="${metadata.locale}" data-problem-no="${metadata.problemNo}" data-problem-id="${metadata.problemId}" data-source-title="${escapeHtml(metadata.sourceTitle)}" data-source-html-sha256="${metadata.sourceHtmlSha256}" data-review-status="${htmlReviewStatus}"${reviewAttributes}>
    <h3>${label}${escapeHtml(`No.${metadata.problemNo} ${metadata.title}`)}</h3>
    <div class="problem-statement">
${statement}
    </div>
  </main>
</body>
</html>
`;
}
