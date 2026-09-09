import { z } from "./validation.ts";

export const problemReviewStatusSchema = z.strictObject({
  human: z.enum(["unreviewed", "approved"]).nullable(),
  machine: z.enum(["unreviewed", "approved"]),
});
export type ProblemReviews = z.infer<typeof problemReviewStatusSchema>;
export type LegacyProblemStatus = "machine" | "unreviewed" | "approved";
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
