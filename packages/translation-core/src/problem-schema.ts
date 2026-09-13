import { z } from "./validation.ts";

import {
  humanReviewSchema,
  problemReviewStatusSchema,
} from "./problem-review-status.ts";

export const metadataSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    locale: z.literal("ko"),
    problemNo: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    problemId: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    sourceTitle: z.string().min(1),
    title: z.string().min(1),
    visibility: z.boolean().optional(),
    sourceHtmlSha256: z.string().regex(/^[a-f0-9]{64}$/),
    reviewStatus: z
      .union([
        z.enum(["machine", "unreviewed", "approved"]),
        problemReviewStatusSchema,
      ])
      .optional(),
    humanReview: humanReviewSchema.optional(),
    machineReview: z.enum(["unreviewed", "approved"]).optional(),
  })
  .superRefine((metadata, ctx) => {
    const legacy = metadata.reviewStatus !== undefined;
    const human = metadata.humanReview !== undefined;
    const machine = metadata.machineReview !== undefined;
    if ((legacy && (human || machine)) || (!legacy && (!human || !machine)))
      ctx.addIssue({
        code: "custom",
        message:
          "Use humanReview and machineReview together, or a legacy reviewStatus, never both",
      });
  });
export type ProblemMarkdownMetadata = z.infer<typeof metadataSchema>;
