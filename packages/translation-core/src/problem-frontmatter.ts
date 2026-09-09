import {
  problemReviews,
  metadataReviewStatus,
  type ProblemReviews,
} from "./problem-review-status.ts";
import { isMap, isScalar, parseDocument, type Document } from "yaml";
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
  reviewer: "human" | "machine" = "human",
): string {
  const current = metadataReviewStatus(parseProblemMarkdown(source).metadata);
  if (typeof current === "string" && reviewer === "human")
    return replaceFrontmatterField(source, "reviewStatus", status);
  return setProblemMarkdownReviews(source, {
    ...problemReviews(current),
    [reviewer]: status,
  });
}

export function removeProblemMarkdownMachineLabel(source: string): string {
  return parseProblemMarkdown(source).metadata.reviewStatus === "machine"
    ? setProblemMarkdownReviewStatus(source, "unreviewed")
    : source;
}

export function setProblemMarkdownReviews(
  source: string,
  reviews: ProblemReviews,
): string {
  const frontmatter = source.match(FRONTMATTER_PATTERN);
  if (!frontmatter) throw new Error("Problem Markdown frontmatter is missing");
  const doc: Document = parseDocument(frontmatter[1], { uniqueKeys: true });
  if (doc.errors.length || !isMap(doc.contents))
    throw new Error("Invalid problem frontmatter");
  const legacy = doc.contents.items.find(
    (pair) => isScalar(pair.key) && pair.key.value === "reviewStatus",
  );
  if (legacy) {
    const comment =
      legacy.value &&
      typeof legacy.value === "object" &&
      "comment" in legacy.value
        ? legacy.value.comment
        : undefined;
    const commentBefore =
      legacy.value &&
      typeof legacy.value === "object" &&
      "commentBefore" in legacy.value
        ? legacy.value.commentBefore
        : undefined;
    legacy.key = doc.createNode("humanReview");
    const value = doc.createNode(reviews.human);
    if (typeof comment === "string") value.comment = comment;
    if (typeof commentBefore === "string") value.commentBefore = commentBefore;
    legacy.value = value;
  } else doc.set("humanReview", reviews.human);
  doc.set("machineReview", reviews.machine);
  const machineIndex = doc.contents.items.findIndex(
    (pair) => isScalar(pair.key) && pair.key.value === "machineReview",
  );
  const [machinePair] = doc.contents.items.splice(machineIndex, 1);
  const humanIndex = doc.contents.items.findIndex(
    (pair) => isScalar(pair.key) && pair.key.value === "humanReview",
  );
  doc.contents.items.splice(humanIndex + 1, 0, machinePair);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const yaml = doc.toString().trimEnd().replace(/\r?\n/g, newline);
  return `---${newline}${yaml}${newline}---${source.slice(frontmatter[0].length - (frontmatter[0].endsWith("\r\n") ? 2 : frontmatter[0].endsWith("\n") ? 1 : 0))}`;
}
