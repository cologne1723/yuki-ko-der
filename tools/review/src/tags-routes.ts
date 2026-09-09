import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "translation-core/node-hash";
import { ReviewError } from "translation-core/review-state";
import { tagTranslationsSchema } from "../../../src/tag-translations.ts";
import { CatalogTransactions } from "./catalog-transactions.ts";
import { z } from "translation-core/validation";
import { jsonBody, uiSaveSchema } from "./request-schemas.ts";

export function tagsRoutes(root: string) {
  const path = join(root, "translations/tags/ko.json");
  const transactions = new CatalogTransactions(root);
  const read = async () => {
    const raw = await readFile(path, "utf8");
    const data = tagTranslationsSchema.parse(JSON.parse(raw));
    return { raw, data, revision: sha256(raw) };
  };
  return new Hono()
    .get("/api/tags", async (c) => {
      const { data, revision } = await transactions.run(read);
      return c.json({ ...data, revision });
    })
    .delete(
      "/api/tags/:source",
      jsonBody(z.strictObject({ revision: z.string().min(1) })),
      async (c) => {
        const source = c.req.param("source");
        const input = c.req.valid("json");
        return c.json(
          await transactions.run(async () => {
            const { raw, data, revision } = await read();
            if (input.revision !== revision)
              throw new ReviewError(
                "태그 번역이 변경되었습니다. 편집 내용을 복사한 뒤 다시 불러오세요.",
                409,
              );
            const index = data.tags.findIndex((tag) => tag.source === source);
            if (index < 0)
              throw new ReviewError("태그를 찾을 수 없습니다.", 404);
            data.tags.splice(index, 1);
            const output = JSON.stringify(data, null, 2) + "\n";
            await transactions.commit([{ path, raw, output }]);
            return { ...data, revision: sha256(output) };
          }),
        );
      },
    )
    .put("/api/tags/:source", jsonBody(uiSaveSchema), async (c) => {
      const source = c.req.param("source");
      const input = c.req.valid("json");
      return c.json(
        await transactions.run(async () => {
          const { raw, data, revision } = await read();
          if (input.revision !== revision)
            throw new ReviewError(
              "태그 번역이 변경되었습니다. 편집 내용을 복사한 뒤 다시 불러오세요.",
              409,
            );
          const tag = data.tags.find((tag) => tag.source === source);
          if (!tag) throw new ReviewError("태그를 찾을 수 없습니다.", 404);
          const changed = tag.target !== input.target;
          tag.target = input.target;
          tag.reviewStatus =
            input.action === "approve"
              ? "approved"
              : input.action === "unapprove" || changed
                ? "unreviewed"
                : tag.reviewStatus;
          const output = JSON.stringify(data, null, 2) + "\n";
          await transactions.commit([{ path, raw, output }]);
          return { ...data, revision: sha256(output) };
        }),
      );
    });
}
