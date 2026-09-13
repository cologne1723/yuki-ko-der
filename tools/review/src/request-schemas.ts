import { zValidator } from "@hono/zod-validator";
import { ReviewError } from "translation-core/review-state";
import { z } from "translation-core/validation";

const text = z.string();
const target = text.refine((value) => !!value.trim());
const action = z.enum(["save", "approve", "unapprove"]);
export const problemSaveSchema = z.looseObject({ html: text, revision: text });
export const problemVisibilitySchema = z.strictObject({
  visibility: z.boolean(),
  revision: text,
});
export const settingsSaveSchema = z.looseObject({ dataDirectory: text });
export const importSelectionSchema = z.looseObject({
  id: text,
  collection: text.optional(),
});
export const importSaveSchema = z.looseObject({
  revision: text,
  action: z.enum(["save-draft", "approve", "defer", "exclude", "restore"]),
  target: text.optional(),
});
export const uiSaveSchema = z.looseObject({ target, revision: text, action });
export const sharedSaveSchema = z.looseObject({
  target,
  members: z.array(
    z.looseObject({ file: text, index: z.number(), revision: text }),
  ),
  action: action.nullish(),
});
export const draftSchema = z.looseObject({
  file: text,
  revision: text,
  selector: target,
  attribute: text.optional(),
  target: text.optional(),
  meaning: text.optional(),
  reuseId: text.optional(),
});

export function jsonBody<T extends z.ZodType<Record<string, unknown>>>(
  schema: T,
  message?: string,
) {
  const invalid = (error: { issues: readonly { message: string }[] }) =>
    new ReviewError(message ?? error.issues[0].message, 400);
  const validate = zValidator("json", schema, (result) => {
    if (!result.success) throw invalid(result.error);
  });
  const middleware: typeof validate = async (context, next) => {
    const contentType = context.req.header("content-type") ?? "";
    if (contentType.toLowerCase() === "application/json")
      return validate(context, next);
    // Preserve legacy JSON requests without a JSON header. The standard path
    // above uses zValidator; this compatibility path keeps the same contract.
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      throw new ReviewError(message ?? "Malformed JSON in request body", 400);
    }
    const parsed = await schema.safeParseAsync(body);
    if (!parsed.success) throw invalid(parsed.error);
    context.req.addValidatedData("json", parsed.data);
    await next();
  };
  return middleware;
}
