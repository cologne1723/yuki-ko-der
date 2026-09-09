import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { ProblemReviewStore } from "./problem-review.ts";

const { values } = parseArgs({
  options: {
    problem: { type: "string" },
    revision: { type: "string" },
    status: { type: "string" },
  },
});
if (
  !/^\d+$/.test(values.problem ?? "") ||
  !/^[a-f0-9]{64}$/.test(values.revision ?? "") ||
  !["approved", "unreviewed"].includes(values.status ?? "")
)
  throw new Error(
    "Usage: pnpm review:machine --problem NUMBER --revision SHA256 --status approved|unreviewed",
  );
const store = new ProblemReviewStore(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const current = await store.get(Number(values.problem));
const result = await store.save(
  current.problemNo,
  current.koreanSource,
  values.revision!,
  values.status === "approved" ? "approve" : "unapprove",
  "machine",
);
console.log(
  JSON.stringify({
    problemNo: result.problemNo,
    reviews: result.reviews,
    revision: result.revision,
  }),
);
