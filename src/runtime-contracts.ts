import { problemCatalogSchema } from "translation-core/problem-catalog";
import { z } from "translation-core/validation";

export const runtimeEnvelopeSchema = z.looseObject({ type: z.string() });
export const cacheRequestSchema = z.discriminatedUnion("type", [
  z.looseObject({
    type: z.literal("problem-cache:get"),
    problemNo: z.number().int().positive(),
  }),
  z.looseObject({
    type: z.literal("problem-cache:remove"),
    problemNo: z.number().int().positive(),
  }),
  z.looseObject({
    type: z.literal("problem-cache:set"),
    problemNo: z.number().int().positive(),
    html: z.string(),
  }),
]);
export const runtimeFailureSchema = z.looseObject({ error: z.string() });
export const cacheReplySchema = z.looseObject({
  ok: z.literal(true),
  value: z.unknown().optional(),
});
export const catalogReplySchema = z.looseObject({
  ok: z.literal(true),
  source: z.enum(["remote", "cache", "bundled"]),
  catalog: problemCatalogSchema.optional(),
  warning: z.string().optional(),
});
