import { z } from "./validation.ts";

const text = z.string().refine((value) => !!value.trim());
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const publishedProblemSchema = z.object({
  problemNo: z.number().int().min(1),
  problemId: z.number().int().min(1),
  source: text,
  target: text,
  htmlSha256: hash,
});
export const problemCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: hash,
    entries: z.array(publishedProblemSchema),
  })
  .superRefine((catalog, ctx) => {
    const numbers = new Set<number>(),
      ids = new Set<number>();
    for (const [index, entry] of catalog.entries.entries()) {
      if (numbers.has(entry.problemNo) || ids.has(entry.problemId))
        ctx.addIssue({
          code: "custom",
          path: ["entries", index],
          message: "Invalid or duplicate problem catalog entry",
        });
      numbers.add(entry.problemNo);
      ids.add(entry.problemId);
    }
  });
export type PublishedProblem = z.infer<typeof publishedProblemSchema>;
export type ProblemTitleTranslation = Omit<PublishedProblem, "htmlSha256">;
export type ProblemCatalog = z.infer<typeof problemCatalogSchema>;
export function parseProblemCatalog(value: unknown): ProblemCatalog {
  const parsed = problemCatalogSchema.safeParse(value);
  if (!parsed.success) {
    const entryError = parsed.error.issues.some(
      (issue) => issue.path[0] === "entries" && issue.path.length > 1,
    );
    throw new Error(
      entryError
        ? "Invalid or duplicate problem catalog entry"
        : "Unsupported or invalid problem catalog",
    );
  }
  return parsed.data;
}
