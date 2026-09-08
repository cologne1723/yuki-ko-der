import { validateCatalogData } from "./catalog-rules.ts";
import { z } from "./validation.ts";

const text = z.string().min(1);
const reviewStatus = z.enum(["unreviewed", "approved"]);
export const variableSchema = z.union([
  text,
  z.strictObject({
    pattern: text,
    values: z.record(z.string(), z.string()).optional(),
  }),
]);
export const messageSchema = z.strictObject({
  id: text,
  source: text,
  target: text,
  reviewStatus: reviewStatus.optional(),
  meaning: text.optional(),
  variables: z.record(z.string(), variableSchema).optional(),
  alternatives: z
    .array(
      z.strictObject({ target: text, reviewStatus: reviewStatus.optional() }),
    )
    .optional(),
});
export const catalogSchema = z.strictObject({
  $schema: z.string().optional(),
  messages: z.array(messageSchema),
});
export const usageSchema = z.strictObject({
  ref: text,
  selector: text,
  variant: z.number().int().min(0).optional(),
  attribute: z
    .enum(["alt", "aria-label", "placeholder", "title", "value"])
    .optional(),
  preserveBoundaryWhitespace: z.boolean().optional(),
});
export const dictionarySchema = z.strictObject({
  $schema: z.string().optional(),
  locale: text.optional(),
  sourceLocale: text.optional(),
  translations: z.array(usageSchema),
});
export type Catalog = z.infer<typeof catalogSchema>;
export type UsageDictionary = z.infer<typeof dictionarySchema>;

export function assertCatalogShapes(
  catalog: unknown,
  dictionaries: Record<string, unknown>,
): void {
  const parsed = catalogSchema.safeParse(catalog);
  if (!parsed.success)
    throw new Error(
      `Invalid catalog shape: ${JSON.stringify(parsed.error.issues)}`,
    );
  for (const [file, dictionary] of Object.entries(dictionaries)) {
    const parsed = dictionarySchema.safeParse(dictionary);
    if (!parsed.success)
      throw new Error(
        `Invalid usage dictionary (inline translations forbidden): ${file}: ${JSON.stringify(parsed.error.issues)}`,
      );
  }
}

// Cross-record semantics are runtime refinements; editor JSON Schema is a structural projection.
export const catalogDataSchema = z
  .object({
    catalog: catalogSchema,
    dictionaries: z.record(z.string(), dictionarySchema),
  })
  .superRefine((data, ctx) => {
    try {
      validateCatalogData(data.catalog, data.dictionaries);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
