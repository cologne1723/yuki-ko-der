import { readFile } from "node:fs/promises";
import { z } from "translation-core/validation";
import { validProblemRenderProfile } from "translation-core/problem-render-profile";

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const offlinePublicationSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(
    z.object({
      problemNo: z.number().int().positive(),
      sourceHtmlSha256: hash,
      sourceSamplesSha256: hash,
      pageHtmlSha256: hash,
      profile: z
        .object({ engine: z.enum(["katex", "mathjax"]), version: z.string() })
        .refine(validProblemRenderProfile),
    }),
  ),
});

export async function readOfflinePublicationData(path: string) {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return new Map<
        number,
        z.infer<typeof offlinePublicationSchema>["entries"][number]
      >();
    throw error;
  }
  const { entries } = offlinePublicationSchema.parse(JSON.parse(raw));
  const result = new Map(entries.map((entry) => [entry.problemNo, entry]));
  if (result.size !== entries.length)
    throw new Error("Duplicate offline publication problem number");
  return result;
}
