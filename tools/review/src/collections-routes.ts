import { draftSchema, jsonBody } from "./request-schemas.ts";

import { Hono } from "hono";

import { ReviewError } from "./problem-review.ts";

import { CollectionReviewStore, SNAPSHOT_CSP } from "./collection-review.ts";

import { UiReviewStore } from "./ui-review.ts";

export function collectionsRoutes(
  collections: CollectionReviewStore,
  uiStore: UiReviewStore,
) {
  const observation = async (id: string, occurrenceId: string) => {
    const data = await collections.get(id);
    const occurrence = data.occurrences.find(
      (o) => o.occurrenceId === occurrenceId,
    );
    const capture = data.captures.find(
      (c) => c.captureId === occurrence?.captureId,
    );
    if (!occurrence || !capture)
      throw new ReviewError("관찰 항목을 찾을 수 없습니다.", 404);
    if (occurrence.category === "content")
      throw new ReviewError("문제 제목과 본문은 UI 문구로 추가하지 않습니다.");
    let url: URL;
    try {
      url = new URL(capture.url);
    } catch {
      throw new ReviewError("지원하지 않는 페이지 주소입니다.");
    }
    if (url.origin !== "https://yukicoder.me")
      throw new ReviewError("지원하지 않는 페이지입니다.");
    return { occurrence, url };
  };
  return new Hono()
    .get("/api/collections", async (c) => c.json(await collections.list()))
    .post("/api/collections", async (c) => {
      if (c.req.header("content-type")?.split(";")[0] !== "application/zip")
        throw new ReviewError(
          "Upload a ZIP with Content-Type application/zip",
          415,
        );
      const result = await collections.import(
        new Uint8Array(await c.req.arrayBuffer()),
      );
      return c.json(result, result.duplicate ? 200 : 201);
    })
    .get("/api/collections/:id", async (c) =>
      c.json(await collections.get(c.req.param("id"))),
    )
    .get("/api/collections/:id/snapshots/:hash", async (c) => {
      const html = await collections.snapshot(
        c.req.param("id"),
        c.req.param("hash"),
      );
      c.header("content-security-policy", SNAPSHOT_CSP);
      c.header("referrer-policy", "no-referrer");
      return c.html(html);
    })
    .delete("/api/collections/:id", async (c) => {
      await collections.delete(c.req.param("id"));
      return c.json({ deleted: true });
    })
    .get("/api/collections/:id/observations/:occurrence/draft", async (c) => {
      const { occurrence: o, url } = await observation(
        c.req.param("id"),
        c.req.param("occurrence"),
      );
      const selector =
        typeof o.liveCssSelectorHint === "string" &&
        !/data-collector/iu.test(o.liveCssSelectorHint)
          ? o.liveCssSelectorHint
          : "";
      return c.json({
        ...(await uiStore.draftOptions(o.exactText, url.pathname)),
        selector,
        attribute: ["title", "alt", "aria-label", "placeholder"].includes(
          o.kind,
        )
          ? o.kind
          : o.kind === "button-label" && /^input\b/iu.test(selector)
            ? "value"
            : "",
        url: url.href,
      });
    })
    .post(
      "/api/collections/:id/observations/:occurrence/draft",
      jsonBody(draftSchema, "적용할 페이지와 선택자를 확인하세요."),
      async (c) => {
        const { occurrence, url } = await observation(
          c.req.param("id"),
          c.req.param("occurrence"),
        );
        return c.json(
          await uiStore.createDraft(
            occurrence.exactText,
            url.pathname,
            c.req.valid("json"),
          ),
          201,
        );
      },
    );
}
