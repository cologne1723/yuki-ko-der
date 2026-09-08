import { z } from "./validation.ts";

const string = z.string();
const id = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const number = z.number().min(0);
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const strings = z.array(string);
const ids = z
  .array(id)
  .refine(
    (values) => new Set(values).size === values.length,
    "IDs must be unique",
  );
const kind = z.enum([
  "text",
  "title",
  "alt",
  "aria-label",
  "placeholder",
  "button-label",
]);
const counts = z.looseObject({
  findings: integer,
  occurrences: integer,
  events: integer,
  captures: integer,
  html: integer,
});
export const collectionSchemas = {
  manifest: z.looseObject({
    schemaVersion: z.literal(1),
    committedCutoff: integer,
    counts,
    session: z.looseObject({
      sessionId: id,
      startedAt: number,
      endedAt: number.optional(),
      predecessorSessionId: string.optional(),
      successorSessionId: string.optional(),
      collectorVersion: string,
      dictionary: z.looseObject({
        hash,
        scopes: z.array(
          z.looseObject({
            messageId: string,
            selector: string.optional(),
            attribute: string.optional(),
            path: string.optional(),
          }),
        ),
      }),
      settings: z.looseObject({
        maxHtmlBytes: number,
        maxTotalBytes: number,
        includeEvents: z.boolean(),
      }),
      status: z.enum(["recording", "paused", "complete"]),
      counts: z.record(z.string(), integer),
      totalBytes: number,
      captureFailures: z.array(
        z.looseObject({
          at: number,
          documentId: id,
          reason: z.enum([
            "oversized",
            "storage-limit",
            "serialization",
            "unknown",
          ]),
          detail: string,
        }),
      ),
      legacyUnverifiedRecords: integer.optional(),
    }),
  }),
  finding: z.looseObject({
    findingId: id,
    normalizedText: string,
    kind,
    firstSeenAt: number,
    lastSeenAt: number,
    occurrenceCount: integer,
  }),
  occurrence: z.looseObject({
    occurrenceId: id,
    findingId: id,
    sessionId: id,
    captureId: id,
    documentId: id,
    exactText: string,
    kind,
    category: z.enum(["interface", "content", "uncertain"]),
    classificationRule: string,
    dictionaryMessageIds: strings,
    snapshotNodeLocator: string,
    precedingEventIds: ids,
    temporalContext: z.literal("preceding-observations"),
    at: number,
  }),
  capture: z.looseObject({
    captureId: id,
    sessionId: id,
    documentId: id,
    url: string,
    title: string,
    timestamp: number,
    reason: z.enum([
      "initial",
      "mutation",
      "interaction",
      "manual",
      "navigation",
    ]),
    viewport: z.looseObject({
      width: number,
      height: number,
      devicePixelRatio: number,
    }),
    scroll: z.looseObject({ x: z.number(), y: z.number() }),
    htmlHash: hash,
    htmlBytes: integer,
    redaction: z.looseObject({
      removedElements: integer,
      removedAttributes: integer,
      redactedFields: integer,
      removedExternalLoads: integer,
    }),
    findingIds: ids,
    occurrenceIds: ids,
  }),
  event: z.looseObject({
    eventId: id,
    sessionId: id,
    documentId: id,
    sequence: integer,
    timestamp: number,
    type: z.enum([
      "click",
      "focus",
      "hover",
      "change",
      "submit",
      "disclosure",
      "navigation",
    ]),
    target: z.looseObject({
      tagName: string,
      id: string.optional(),
      role: string.optional(),
      name: string.optional(),
      locator: string.optional(),
    }),
  }),
};
