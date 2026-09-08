import { collectionSchemas } from "translation-core/collection-schema";
import { ReviewError } from "./problem-review.ts";
export { collectionSchemas } from "translation-core/collection-schema";
export function validateRecord(
  kind: keyof typeof collectionSchemas,
  value: unknown,
  file: string,
): void {
  const parsed = collectionSchemas[kind].safeParse(value);
  if (!parsed.success)
    throw new ReviewError(`Invalid ${file}: ${parsed.error.message}`);
}
