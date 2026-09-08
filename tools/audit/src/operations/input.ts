import { z } from "translation-core/validation";
import { problemSelection } from "./types.ts";
export const operations = [
  "setup",
  "audit-problems",
  "verify-problems",
  "validate-problems",
  "lint-problems",
  "validate-ui",
  "audit-ui-pages",
  "audit-ui-contexts",
  "audit-translations",
  "convert-problem",
] as const;

export const operationInputSchema = z
  .strictObject(
    {
      operation: z.enum(operations, { error: "Unsupported operation" }),
      problems: z
        .string({ error: "Invalid problem selection" })
        .max(1000, "Invalid problem selection")
        .optional(),
      selection: z
        .enum(["problems", "pages", "both"], {
          error: "Invalid download selection",
        })
        .optional(),
      refresh: z.boolean({ error: "Invalid refresh option" }).optional(),
      page: z
        .string({ error: "Select an existing saved page" })
        .regex(/^[-\w]+\.html$/, "Select an existing saved page")
        .optional(),
      html: z.string({ error: "HTML fixture must be text" }).optional(),
      dictionaries: z
        .array(z.string().regex(/^[-\w]+\.json$/), {
          error: "Invalid dictionary selection",
        })
        .optional(),
      fixtures: z
        .array(z.unknown(), { error: "Invalid dictionary fixtures" })
        .optional(),
      problemNo: z
        .number({ error: "Invalid problem number" })
        .int("Invalid problem number")
        .min(1, "Invalid problem number")
        .optional(),
    },
    {
      error: (issue) =>
        issue.code === "unrecognized_keys"
          ? "Unknown operation input"
          : "Invalid operation request",
    },
  )
  .superRefine((input, ctx) => {
    if (input.problems !== undefined) {
      try {
        problemSelection(input.problems);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: ["problems"],
          message: String(error instanceof Error ? error.message : error),
        });
      }
    }
    if (
      input.html !== undefined &&
      (input.page !== undefined || input.problemNo !== undefined)
    )
      ctx.addIssue({
        code: "custom",
        path: ["html"],
        message: "Choose one HTML source: a repository selection or an upload",
      });
  });
export type OperationInput = z.infer<typeof operationInputSchema>;
export function operationInput(value: unknown): OperationInput {
  const parsed = operationInputSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue.path[0] === "dictionaries"
        ? "Invalid dictionary selection"
        : issue.message,
    );
  }
  // Revisions hash JSON bytes, so preserve the caller's validated property order.
  return structuredClone(value) as OperationInput;
}
