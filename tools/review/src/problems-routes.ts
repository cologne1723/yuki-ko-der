import { jsonBody, problemSaveSchema } from "./request-schemas.ts";

import { Hono } from "hono";

import { ProblemReviewStore } from "./problem-review.ts";
import { collectReviewProblemProfile } from "./problem-profile-collection.ts";

export function problemsRoutes(store: ProblemReviewStore) {
  return new Hono()
    .get("/api/problems", async (c) => c.json({ problems: await store.list() }))
    .get("/api/problems/:number", async (c) =>
      c.json(await store.get(Number(c.req.param("number")))),
    )
    .post("/api/problems/:number/render-profile", async (c) =>
      c.json(
        await collectReviewProblemProfile(
          store,
          Number(c.req.param("number")),
          { signal: c.req.raw.signal },
        ),
      ),
    )
    .put(
      "/api/problems/:number",
      jsonBody(problemSaveSchema, "html and revision must be strings"),
      async (c) => {
        const body = c.req.valid("json");
        return c.json(
          await store.save(
            Number(c.req.param("number")),
            body.html,
            body.revision,
            "save",
          ),
        );
      },
    )
    .post(
      "/api/problems/:number/approve",
      jsonBody(problemSaveSchema, "html and revision must be strings"),
      async (c) => {
        const body = c.req.valid("json");
        return c.json(
          await store.save(
            Number(c.req.param("number")),
            body.html,
            body.revision,
            "approve",
          ),
        );
      },
    )
    .post(
      "/api/problems/:number/unapprove",
      jsonBody(problemSaveSchema, "html and revision must be strings"),
      async (c) => {
        const body = c.req.valid("json");
        return c.json(
          await store.save(
            Number(c.req.param("number")),
            body.html,
            body.revision,
            "unapprove",
          ),
        );
      },
    );
}
