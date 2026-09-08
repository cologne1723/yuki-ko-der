import { isScalar, parseDocument } from "yaml";
import {
  metadataSchema,
  type ProblemMarkdownMetadata,
} from "./problem-schema.ts";

export interface ParsedProblemMarkdown {
  metadata: ProblemMarkdownMetadata;
  body: string;
}
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u;

export function parseProblemMarkdown(source: string): ParsedProblemMarkdown {
  const frontmatter = source.match(FRONTMATTER_PATTERN);
  if (!frontmatter)
    throw new Error("Problem Markdown must start with YAML-style frontmatter");
  const doc = parseDocument(frontmatter[1], { uniqueKeys: true });
  if (doc.errors.length)
    throw new Error(
      `Invalid frontmatter: ${doc.errors.map((e) => e.message).join("; ")}`,
    );
  const metadata: unknown = doc.toJS({ maxAliasCount: 0 });
  const parsed = metadataSchema.safeParse(metadata);
  if (!parsed.success)
    throw new Error(
      `Problem Markdown frontmatter metadata is invalid: ${JSON.stringify(parsed.error.issues)}`,
    );
  return { metadata: parsed.data, body: source.slice(frontmatter[0].length) };
}
function replaceFrontmatterField(
  source: string,
  key: keyof ProblemMarkdownMetadata,
  value: string,
): string {
  const frontmatter = source.match(FRONTMATTER_PATTERN);
  if (!frontmatter) throw new Error("Problem Markdown frontmatter is missing");
  const doc = parseDocument(frontmatter[1], { uniqueKeys: true });
  if (doc.errors.length)
    throw new Error(`Invalid frontmatter: ${doc.errors[0].message}`);
  const node = doc.get(key, true);
  if (!isScalar(node) || !node.range)
    throw new Error(`Problem Markdown frontmatter requires ${key}`);
  const offset = source.indexOf(frontmatter[1], 4);
  const original = source.slice(offset + node.range[0], offset + node.range[1]);
  let replacement = value;
  if (node.type === "BLOCK_LITERAL" || node.type === "BLOCK_FOLDED") {
    const newline = original.indexOf("\n");
    const indent = original.slice(newline + 1).match(/^[ \t]*/u)?.[0] ?? "  ";
    const ending = original.endsWith("\r\n")
      ? "\r\n"
      : original.endsWith("\n")
        ? "\n"
        : "";
    replacement = original.slice(0, newline + 1) + indent + value + ending;
  }
  return (
    source.slice(0, offset + node.range[0]) +
    replacement +
    source.slice(offset + node.range[1])
  );
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
