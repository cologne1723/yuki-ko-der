import { dirname } from "node:path";
import { collectProblemRenderProfiles } from "translation-audit/operations/problem-render-profiles";
import { ProblemReviewStore, ReviewError } from "./problem-review.ts";

export async function collectReviewProblemProfile(
  store: ProblemReviewStore,
  problemNo: number,
  options: { signal?: AbortSignal; request?: typeof fetch } = {},
) {
  // Validate the selected saved problem before permitting any network request.
  await store.get(problemNo);
  const result = await collectProblemRenderProfiles({
    repositoryRoot: store.repositoryRoot,
    dataRoot: dirname(store.sourceDirectory),
    problems: [problemNo],
    refresh: true,
    ...options,
  });
  const item = result.items.find((item) => item.id === String(problemNo));
  if (!item || !["saved", "skipped"].includes(item.status))
    throw new ReviewError(
      item?.message ?? "Render profile collection returned no result",
      502,
    );
  const problem = await store.get(problemNo);
  if (!problem.renderProfile)
    throw new ReviewError(
      problem.renderProfileError ?? "Collected render profile is unavailable",
      502,
    );
  return problem;
}
