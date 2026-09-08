import { z } from "translation-core/validation";
import { receiveBundle } from "./bundle-channel.ts";
import { sessionSchema, type StorageRequest } from "./storage-contracts.ts";
import { StorageLimitError } from "./storage-errors.ts";
import type { CollectorStore } from "./storage.ts";
import type { PendingBatch, Session } from "./types.ts";
const failureSchema = z.looseObject({
  ok: z.literal(false),
  error: z.string().optional(),
  name: z.string().optional(),
});
const call = async <T extends z.ZodType>(
  schema: T,
  request: StorageRequest,
): Promise<z.infer<T>> => {
  const api = globalThis.browser ?? globalThis.chrome;
  const result: unknown = await api.runtime.sendMessage({
    type: "storage:request",
    ...request,
  });
  const failure = failureSchema.safeParse(result);
  if (failure.success)
    throw new (
      failure.data.name === "StorageLimitError" ? StorageLimitError : Error
    )(failure.data.error ?? "Collector background did not acknowledge saving");
  const envelope = z
    .object({ ok: z.literal(true), value: z.unknown().optional() })
    .parse(result);
  return schema.parse(envelope.value);
};
const countsSchema = z.object({
  saved: z.number().nonnegative(),
  pending: z.number().nonnegative(),
  failed: z.number().nonnegative(),
});
export class RemoteStore implements CollectorStore {
  createSession(session: Session) {
    return call(z.void(), { operation: "createSession", args: [session] });
  }
  rotateSession(id: string, successor: Session) {
    return call(sessionSchema, {
      operation: "rotateSession",
      args: [id, successor],
    });
  }
  getSession(id: string) {
    return call(sessionSchema.optional(), {
      operation: "getSession",
      args: [id],
    });
  }
  updateSession(session: Session) {
    return call(z.void(), { operation: "updateSession", args: [session] });
  }
  stageCapture(id: string, batches: PendingBatch[]) {
    return call(z.void(), { operation: "stageCapture", args: [id, batches] });
  }
  commitBatch(id: string, batches: PendingBatch[], bytes: number) {
    return call(z.void(), {
      operation: "commitBatch",
      args: [id, batches, bytes],
    });
  }
  retryPending(id: string) {
    return call(z.void(), { operation: "retryPending", args: [id] });
  }
  counts(id: string) {
    return call(countsSchema, { operation: "counts", args: [id] });
  }
  bundle(id: string, cutoff?: number) {
    const runtime: typeof chrome.runtime & {
      lastError?: { message?: string };
    } = (globalThis.browser ?? globalThis.chrome).runtime;
    return receiveBundle(
      {
        connect: (options) => runtime.connect(undefined, options),
        get lastError() {
          return runtime.lastError;
        },
      },
      id,
      cutoff,
    );
  }
  deleteSession(id: string) {
    return call(z.void(), { operation: "deleteSession", args: [id] });
  }
  locations(id: string, documentId: string) {
    return call(z.array(z.string()), {
      operation: "locations",
      args: [id, documentId],
    });
  }
  listSessions() {
    return call(z.array(sessionSchema), {
      operation: "listSessions",
      args: [],
    });
  }
}
