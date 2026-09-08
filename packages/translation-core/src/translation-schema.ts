import { usageSchema } from "./catalog-schema.ts";
import { z } from "./validation.ts";

// Legacy inline dictionaries remain readable while authored catalogs use references.
export const translationVariableSchema = z.union([
  z.string(),
  z.object({
    pattern: z.string(),
    values: z.record(z.string(), z.string()).optional(),
  }),
]);
export const translationEntrySchema = z.object({
  reviewStatus: z.enum(["unreviewed", "approved"]).optional(),
  messageId: z.string().optional(),
  variant: z.number().int().nonnegative().optional(),
  selector: z.string(),
  source: z.string(),
  target: z.string(),
  attribute: z.string().optional(),
  preserveBoundaryWhitespace: z.boolean().optional(),
  variables: z.record(z.string(), translationVariableSchema).optional(),
});
export const translationDictionarySchema = z.object({
  translations: z.array(translationEntrySchema),
});
export const readableUsageSchema = usageSchema.extend({
  attribute: z.string().optional(),
});
export const readableDictionarySchema = z.object({
  translations: z.array(z.union([readableUsageSchema, translationEntrySchema])),
});
