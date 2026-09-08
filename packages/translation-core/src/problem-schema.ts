import { z } from "./validation.ts";

export const metadataSchema = z.strictObject({
  schemaVersion: z.literal(1),
  locale: z.literal("ko"),
  problemNo: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  problemId: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  sourceTitle: z.string().min(1),
  title: z.string().min(1),
  sourceHtmlSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewStatus: z.enum(["machine", "unreviewed", "approved"]),
});
export type ProblemMarkdownMetadata = z.infer<typeof metadataSchema>;
