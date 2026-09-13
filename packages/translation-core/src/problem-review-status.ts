import { z } from "./validation.ts";

export const reviewerIdSchema = z.string().trim().min(1);
export const reviewerIdsSchema = z
  .array(reviewerIdSchema)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Reviewer IDs must be unique",
  );
// Legacy approvals predate attribution; the maintainer explicitly attributed
// those records to cologne. Never use this as a default for new approvals.
export const humanReviewSchema = z.union([
  reviewerIdsSchema,
  z
    .enum(["unreviewed", "approved"])
    .nullable()
    .transform((status): string[] =>
      status === "approved" ? ["cologne"] : [],
    ),
]);
export const problemReviewStatusSchema = z.strictObject({
  human: humanReviewSchema,
  machine: z.enum(["unreviewed", "approved"]),
});
export type ProblemReviews = z.infer<typeof problemReviewStatusSchema>;
export type ProblemReviewsInput = z.input<typeof problemReviewStatusSchema>;
export type LegacyProblemStatus = "machine" | "unreviewed" | "approved";
// Opt-in: translation completion is not review approval; the separate review
// workflow can still verify intentionally approved documents.
export function assertUnreviewedTranslation(metadata: {
  humanReview?: unknown;
  machineReview?: unknown;
  reviewStatus?: unknown;
}): void {
  if (
    metadata.reviewStatus !== undefined ||
    !Array.isArray(metadata.humanReview) ||
    metadata.humanReview.length !== 0 ||
    metadata.machineReview !== "unreviewed"
  )
    throw new Error(
      "번역 전용 검사는 미승인 상태(humanReview: [], machineReview: unreviewed)가 필요합니다. 승인·검토 상태를 임의로 변경하지 마세요.",
    );
}

export function problemReviews(
  status: LegacyProblemStatus | ProblemReviewsInput,
): ProblemReviews {
  return typeof status === "object"
    ? problemReviewStatusSchema.parse(status)
    : {
        human: status === "approved" ? ["cologne"] : [],
        machine: "unreviewed",
      };
}
export function effectiveProblemStatus(
  status: LegacyProblemStatus | ProblemReviewsInput,
): "unreviewed" | "approved" {
  const reviews = problemReviews(status);
  return reviews.human.length ? "approved" : "unreviewed";
}
export function legacyProblemStatus(
  status: LegacyProblemStatus | ProblemReviewsInput,
): LegacyProblemStatus {
  return typeof status === "string" ? status : effectiveProblemStatus(status);
}

export function metadataReviewStatus(metadata: {
  reviewStatus?: LegacyProblemStatus | ProblemReviewsInput;
  humanReview?: ProblemReviewsInput["human"];
  machineReview?: ProblemReviews["machine"];
}): LegacyProblemStatus | ProblemReviews {
  if (metadata.reviewStatus !== undefined)
    return typeof metadata.reviewStatus === "string"
      ? metadata.reviewStatus
      : problemReviews(metadata.reviewStatus);
  return problemReviewStatusSchema.parse({
    human: metadata.humanReview,
    machine: metadata.machineReview,
  });
}
