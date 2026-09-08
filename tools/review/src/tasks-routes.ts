import { operationInputSchema } from "translation-audit/operations/input";
import { jsonBody } from "./request-schemas.ts";

import { ReviewTasks } from "./tasks.ts";

import { Hono } from "hono";

import { ProblemReviewStore, ReviewError } from "./problem-review.ts";

export function tasksRoutes(
  tasks: () => ReviewTasks,
  store: ProblemReviewStore,
) {
  return new Hono()
    .get("/api/tasks", async (c) => c.json(await tasks().list()))
    .post("/api/tasks", jsonBody(operationInputSchema), async (c) => {
      try {
        return c.json(await tasks().start(c.req.valid("json")), 202);
      } catch (error) {
        if (error instanceof ReviewError) throw error;
        throw new ReviewError(String(error), 400);
      }
    })
    .get("/api/tasks/recovery", async (c) => c.json(await tasks().recovery()))
    .get("/api/tasks/:id", async (c) =>
      c.json(await tasks().get(c.req.param("id"))),
    )
    .post("/api/tasks/:id/cancel", async (c) =>
      c.json(await tasks().cancel(c.req.param("id"))),
    )
    .get("/api/tasks/:id/artifact", async (c) => {
      const task = await tasks().get(c.req.param("id"));
      const artifact = task.result?.artifact;
      if (task.status !== "completed" || !artifact)
        throw new ReviewError("No completed conversion artifact", 404);
      c.header("content-type", artifact.mime);
      c.header(
        "content-disposition",
        `attachment; filename="${artifact.name}"`,
      );
      return c.body(artifact.content);
    })
    .post("/api/tasks/:id/convert", async (c) => {
      const task = await tasks().get(c.req.param("id"));
      const artifact = task.result?.artifact;
      if (
        task.status !== "completed" ||
        task.input.operation !== "convert-problem" ||
        task.stale ||
        !artifact?.problemNo ||
        !artifact.revision
      )
        throw new ReviewError(
          "Preview the current legacy problem before saving conversion",
          409,
        );
      return c.json(await store.convert(artifact.problemNo, artifact.revision));
    });
}
