import {
  importSaveSchema,
  importSelectionSchema,
  jsonBody,
} from "./request-schemas.ts";

import { Hono } from "hono";

import { UiImportStore } from "./ui-imports.ts";

export function importsRoutes(imports: UiImportStore) {
  return new Hono()
    .get("/api/ui/imports", async (c) => c.json(await imports.list()))
    .get("/api/ui/imports/:id", async (c) =>
      c.json(await imports.get(c.req.param("id"))),
    )
    .put(
      "/api/ui/imports/selection",
      jsonBody(importSelectionSchema, "항목을 선택하세요."),
      async (c) => {
        const body = c.req.valid("json");
        return c.json(await imports.select(body.id, body.collection));
      },
    )
    .get("/api/ui/imports/:id/snapshot/:collection/:occurrence", async (c) =>
      c.json(
        await imports.snapshot(
          c.req.param("id"),
          c.req.param("collection"),
          c.req.param("occurrence"),
        ),
      ),
    )
    .put(
      "/api/ui/imports/:id",
      jsonBody(importSaveSchema, "작업과 개정 값을 확인하세요."),
      async (c) =>
        c.json(await imports.save(c.req.param("id"), c.req.valid("json"))),
    );
}
