import { operationInputSchema } from "translation-audit/operations/input";
import { z } from "translation-core/validation";

const itemSchema = z.looseObject({
  id: z.string(),
  status: z.enum(["passed", "saved", "skipped", "failed", "review-required"]),
  message: z.string(),
  details: z.unknown().optional(),
  reviewStatus: z.enum(["machine", "unreviewed", "approved"]).optional(),
  location: z
    .looseObject({
      dictionary: z.string().regex(/^[a-z0-9_-]+\.json$/),
      index: z.number().int().min(0),
    })
    .optional(),
});
export const taskSchema = z.looseObject({
  id: z.string().regex(/^[a-f0-9-]+$/),
  input: operationInputSchema,
  dataRoot: z.string(),
  revision: z.string(),
  startedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  status: z.enum([
    "running",
    "cancelling",
    "cancelled",
    "interrupted",
    "completed",
    "failed",
  ]),
  error: z.string().optional(),
  progress: z.array(itemSchema),
  result: z
    .looseObject({
      operation: z.string(),
      report: z.string().optional(),
      items: z.array(itemSchema),
      artifact: z
        .looseObject({
          name: z.string().regex(/^[A-Za-z0-9._-]+$/),
          content: z.string(),
          mime: z.string().regex(/^[^\r\n]+$/),
          problemNo: z.number().int().min(1).optional(),
          revision: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});
