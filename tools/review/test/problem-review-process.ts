import { ProblemReviewStore, ReviewError } from "../src/problem-review.ts";

const [root, marker] = process.argv.slice(2);
const store = new ProblemReviewStore(root);
const initial = await store.get(1);
process.once("message", async () => {
  try {
    const saved = await store.save(
      1,
      initial.koreanSource + `\nReview ${marker}.\n`,
      initial.revision,
      "save",
    );
    process.send?.({ ok: true, revision: saved.revision });
  } catch (error) {
    process.send?.({
      ok: false,
      statusCode: error instanceof ReviewError ? error.statusCode : undefined,
      error: String(error),
    });
  }
});
process.send?.("ready");
