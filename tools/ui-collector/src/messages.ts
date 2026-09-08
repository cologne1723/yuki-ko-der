import { z } from "translation-core/validation";
export const collectorStateSchema = z.looseObject({
  recording: z.boolean(),
  sessionId: z.string().optional(),
  counts: z
    .object({ saved: z.number(), pending: z.number(), failed: z.number() })
    .optional(),
  lastFailure: z.string().optional(),
  manualCapture: z
    .object({
      requestId: z.string(),
      outcome: z.enum(["saved", "failed", "not-recording"]),
      error: z.string().optional(),
    })
    .optional(),
});
export const popupStatusSchema = collectorStateSchema
  .extend({
    allowed: z.boolean(),
    tabId: z.number().int().optional(),
    warning: z.string().optional(),
  })
  .refine((value) => !value.allowed || value.tabId !== undefined);
export const captureOutcomeSchema = z.discriminatedUnion("outcome", [
  z.looseObject({ outcome: z.literal("saved"), captureId: z.string() }),
  z.looseObject({ outcome: z.literal("queued"), requestId: z.string() }),
  z.looseObject({ outcome: z.literal("failed"), error: z.string() }),
  z.looseObject({ outcome: z.literal("not-recording") }),
]);
export const collectorReplySchema = collectorStateSchema.partial().extend({
  outcome: z.enum(["saved", "queued", "failed", "not-recording"]).optional(),
  captureId: z.string().optional(),
  requestId: z.string().optional(),
  error: z.string().optional(),
});
export type CollectorState = z.infer<typeof collectorStateSchema>;
export type PopupStatus = z.infer<typeof popupStatusSchema>;
export type CaptureOutcome = z.infer<typeof captureOutcomeSchema>;
export type Reply<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      error: string;
      recording?: boolean;
    };

const success = z.looseObject({ ok: z.literal(true) });
const failure = z.looseObject({ error: z.string() });
export function acknowledged<T extends z.ZodType>(
  schema: T,
  reply: unknown,
): z.infer<T> {
  if (!success.safeParse(reply).success) {
    const parsed = failure.safeParse(reply);
    throw new Error(
      parsed.success
        ? parsed.data.error
        : "The collector did not acknowledge the request. Reload the yukicoder tab and try again.",
    );
  }
  return schema.parse(reply);
}

export const collectorCommandSchema = z.looseObject({
  type: z.string(),
  sessionId: z.string().optional(),
});
export const backgroundCommandSchema = z.looseObject({
  type: z.string(),
  tabId: z.number().int().nonnegative().optional(),
});
