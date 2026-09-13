import { z } from "./validation.ts";

export const problemReviewStatusSchema = z.strictObject({
  human: z.enum(["unreviewed", "approved"]).nullable(),
  machine: z.enum(["unreviewed", "approved"]),
});
export type ProblemReviews = z.infer<typeof problemReviewStatusSchema>;
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
    metadata.humanReview !== null ||
    metadata.machineReview !== "unreviewed"
  )
    throw new Error(
      "번역 전용 검사는 미승인 상태(humanReview: null, machineReview: unreviewed)가 필요합니다. 승인·검토 상태를 임의로 변경하지 마세요.",
    );
}

export function problemReviews(
  status: LegacyProblemStatus | ProblemReviews,
): ProblemReviews {
  return typeof status === "object"
    ? status
    : {
        human: status === "approved" ? "approved" : null,
        machine: "unreviewed",
      };
}
export function effectiveProblemStatus(
  status: LegacyProblemStatus | ProblemReviews,
): "unreviewed" | "approved" {
  const reviews = problemReviews(status);
  return reviews.human ?? reviews.machine;
}
export function legacyProblemStatus(
  status: LegacyProblemStatus | ProblemReviews,
): LegacyProblemStatus {
  return typeof status === "string" ? status : effectiveProblemStatus(status);
}

export function metadataReviewStatus(metadata: {
  reviewStatus?: LegacyProblemStatus | ProblemReviews;
  humanReview?: ProblemReviews["human"];
  machineReview?: ProblemReviews["machine"];
}): LegacyProblemStatus | ProblemReviews {
  if (metadata.reviewStatus !== undefined) return metadata.reviewStatus;
  return problemReviewStatusSchema.parse({
    human: metadata.humanReview,
    machine: metadata.machineReview,
  });
}
