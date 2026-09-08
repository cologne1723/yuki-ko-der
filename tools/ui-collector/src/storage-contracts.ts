import { collectionSchemas } from "translation-core/collection-schema";
import { z } from "translation-core/validation";

// Legacy local sessions may predate content-addressed dictionary identities.
// Export validation still requires the version-1 SHA-256 wire format.
export const sessionSchema = collectionSchemas.manifest.shape.session.extend({
  dictionary: collectionSchemas.manifest.shape.session.shape.dictionary.extend({
    hash: z.string(),
  }),
});
export const controlStateSchema = z.looseObject({
  tagName: z.string(),
  role: z.string().optional(),
  name: z.string().optional(),
  disabled: z.boolean().optional(),
  expanded: z.boolean().optional(),
  checked: z.boolean().optional(),
  selected: z.boolean().optional(),
  valuePresent: z.boolean().optional(),
});
export const eventSchema = collectionSchemas.event.extend({
  controlState: controlStateSchema.optional(),
});
export const occurrenceSchema = collectionSchemas.occurrence.extend({
  ambiguous: z.boolean().optional(),
  liveCssSelectorHint: z.string().optional(),
  nearbyContext: z.string().optional(),
});
export const htmlSnapshotSchema = z.looseObject({
  hash: z.string(),
  html: z.string(),
  bytes: z.number().int().nonnegative(),
});
export const pendingBatchSchema = z.looseObject({
  key: z.string().min(1),
  sessionId: z.string().min(1),
  documentId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  createdAt: z.number().nonnegative(),
  finding: collectionSchemas.finding.optional(),
  occurrence: occurrenceSchema.optional(),
  event: eventSchema.optional(),
  capture: collectionSchemas.capture.optional(),
  html: htmlSnapshotSchema.optional(),
});
const id = z.string().min(1);
const batches = z.array(pendingBatchSchema);
export const storageRequestSchema = z.discriminatedUnion("operation", [
  z.looseObject({
    operation: z.literal("createSession"),
    args: z.tuple([sessionSchema]),
  }),
  z.looseObject({
    operation: z.literal("rotateSession"),
    args: z.tuple([id, sessionSchema]),
  }),
  z.looseObject({ operation: z.literal("getSession"), args: z.tuple([id]) }),
  z.looseObject({
    operation: z.literal("updateSession"),
    args: z.tuple([sessionSchema]),
  }),
  z.looseObject({
    operation: z.literal("stageCapture"),
    args: z.tuple([id, batches]),
  }),
  z.looseObject({
    operation: z.literal("commitBatch"),
    args: z.tuple([id, batches, z.number().nonnegative()]),
  }),
  z.looseObject({ operation: z.literal("retryPending"), args: z.tuple([id]) }),
  z.looseObject({ operation: z.literal("counts"), args: z.tuple([id]) }),
  z.looseObject({ operation: z.literal("locations"), args: z.tuple([id, id]) }),
  z.looseObject({ operation: z.literal("deleteSession"), args: z.tuple([id]) }),
  z.looseObject({ operation: z.literal("listSessions"), args: z.tuple([]) }),
]);
export type StorageRequest = z.infer<typeof storageRequestSchema>;

export function parseStorageRequest(value: unknown): StorageRequest {
  storageRequestSchema.parse(value);
  // Commit replay hashes JSON bytes. Validation must not reorder existing batches.
  return structuredClone(value) as StorageRequest;
}
