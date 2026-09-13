import assert from "node:assert/strict";
import test from "node:test";
import {
  parseProblemCatalog,
  publishedProblemSchema,
} from "../src/problem-catalog.ts";

test("the identified ideographic-space puzzle title survives catalog publication", () => {
  const entry = {
    problemNo: 8025,
    problemId: 888,
    source: "\u3000",
    target: "\u3000",
    htmlSha256: "a".repeat(64),
  };
  assert.equal(
    parseProblemCatalog({
      schemaVersion: 1,
      revision: "b".repeat(64),
      entries: [entry],
    }).entries[0].source,
    "\u3000",
  );
  for (const change of [
    { problemNo: 1 },
    { problemId: 1 },
    { source: " " },
    { target: " " },
    { source: "" },
    { target: "" },
  ])
    assert.equal(
      publishedProblemSchema.safeParse({ ...entry, ...change }).success,
      false,
    );
  assert.throws(
    () =>
      parseProblemCatalog({
        schemaVersion: 1,
        revision: "b".repeat(64),
        entries: [entry, entry],
      }),
    /duplicate/,
  );
});
