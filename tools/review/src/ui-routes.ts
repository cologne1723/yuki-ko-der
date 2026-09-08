import { jsonBody, sharedSaveSchema, uiSaveSchema } from "./request-schemas.ts";

import { Hono } from "hono";

import { UiReviewStore } from "./ui-review.ts";

export function uiRoutes(uiStore: UiReviewStore) {
  return new Hono()
    .get("/api/ui", async (c) => c.json(await uiStore.list()))
    .get("/api/ui-pages/:name", async (c) =>
      c.json({ html: await uiStore.page(c.req.param("name")) }),
    )
    .put(
      "/api/ui/:file/:index",
      jsonBody(uiSaveSchema, "번역 내용과 저장 작업을 확인하세요."),
      async (c) =>
        c.json(
          await uiStore.save(
            c.req.param("file"),
            Number(c.req.param("index")),
            c.req.valid("json"),
          ),
        ),
    )
    .put(
      "/api/ui-shared/:file/:index",
      jsonBody(sharedSaveSchema, "공통 승인 요청이 올바르지 않습니다."),
      async (c) =>
        c.json(
          await uiStore.saveShared(
            c.req.param("file"),
            Number(c.req.param("index")),
            c.req.valid("json"),
          ),
        ),
    );
}
