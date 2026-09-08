import { mutateCapture } from "./capture-transactions.ts";
import {
  openCollectorDatabase,
  recordSize as size,
  STORES,
  stripKey,
  type CollectorDatabase,
} from "./collector-db.ts";
import { CollectorQueries } from "./storage-queries.ts";
import type { CollectorStore, StoreCounts } from "./storage-types.ts";
import type { ExportBundle, PendingBatch, Session } from "./types.ts";
import { MAX_TOTAL_BYTES } from "./types.ts";

export { validateCapture } from "./capture-validation.ts";
export { StorageLimitError } from "./storage-errors.ts";
export type { CollectorStore, StoreCounts } from "./storage-types.ts";

import { type IDBPDatabase } from "idb";
import { StorageLimitError } from "./storage-errors.ts";
export class IndexedDbStore implements CollectorStore {
  private queries = new CollectorQueries(() => this.open());
  private database?: Promise<IDBPDatabase<CollectorDatabase>>;
  constructor(private name = "yukicoder-ui-collector") {}
  private open() {
    return (this.database ??= openCollectorDatabase(this.name));
  }
  async close() {
    (await this.open()).close();
    this.database = undefined;
  }
  async listSessions(): Promise<Session[]> {
    return this.queries.listSessions();
  }
  async createSession(session: Session) {
    if (
      !session ||
      typeof session.sessionId !== "string" ||
      !/^[a-zA-Z0-9-]+$/u.test(session.sessionId) ||
      !Number.isFinite(session.startedAt) ||
      !session.settings ||
      !Number.isFinite(session.settings.maxTotalBytes) ||
      session.settings.maxTotalBytes <= 0 ||
      !Number.isFinite(session.settings.maxHtmlBytes) ||
      !Array.isArray(session.captureFailures)
    )
      throw new Error("Invalid collection session");
    const db = await this.open();
    const tx = db.transaction([...STORES], "readwrite");
    const sessions = tx.objectStore("sessions");
    if (!(await sessions.get(session.sessionId)))
      await sessions.add({
        ...session,
        key: session.sessionId,
        totalBytes: 0,
        counts: { saved: 0, pending: 0, failed: 0 },
        // Count reserved failure-report space toward the global logical limit.
        _failureReserve: " ".repeat(1024),
      });
    const total = (
      await Promise.all(STORES.map((name) => tx.objectStore(name).getAll()))
    )
      .flat()
      .reduce((n, row) => n + size(row), 0);
    if (total > MAX_TOTAL_BYTES) {
      tx.abort();
      await tx.done.catch(() => {});
      throw new StorageLimitError(
        "Collection storage limit reached across sessions",
      );
    }
    await tx.done;
  }
  async rotateSession(
    predecessorId: string,
    successor: Session,
  ): Promise<Session> {
    const tx = (await this.open()).transaction([...STORES], "readwrite");
    try {
      const sessions = tx.objectStore("sessions");
      let current = await sessions.get(predecessorId);
      const visited = new Set<string>();
      while (current?.successorSessionId) {
        if (visited.has(current.sessionId))
          throw new Error("Invalid session successor cycle");
        visited.add(current.sessionId);
        current = await sessions.get(current.successorSessionId);
      }
      if (!current) throw new Error("Unknown predecessor session");
      if (current.dictionary.hash === successor.dictionary.hash) {
        await tx.done;
        return stripKey(current) as Session;
      }
      if (
        (await tx.objectStore("pending").getAll()).some(
          (row) => row.sessionId === current.sessionId,
        )
      )
        throw new Error(
          "Finish pending captures before rotating the dictionary",
        );
      if (
        !successor.sessionId ||
        !/^[a-zA-Z0-9-]+$/.test(successor.sessionId) ||
        !successor.dictionary.hash ||
        !Number.isFinite(successor.startedAt)
      )
        throw new Error("Invalid successor session");
      if (await sessions.get(successor.sessionId))
        throw new Error("Successor identity already belongs to a session");
      const next = {
        ...successor,
        key: successor.sessionId,
        predecessorSessionId: current.sessionId,
        status: "paused" as const,
        counts: { saved: 0, pending: 0, failed: 0 },
        captureFailures: [],
        totalBytes: 0,
        _failureReserve: " ".repeat(1024),
      };
      await sessions.add(next);
      await sessions.put({
        ...current,
        status: "complete",
        endedAt: successor.startedAt,
        successorSessionId: successor.sessionId,
      });
      const total = (
        await Promise.all(STORES.map((name) => tx.objectStore(name).getAll()))
      )
        .flat()
        .reduce((sum, row) => sum + size(row), 0);
      if (total > Math.min(MAX_TOTAL_BYTES, current.settings.maxTotalBytes))
        throw new StorageLimitError(
          "Collection storage limit reached during dictionary rotation",
        );
      await tx.done;
      return stripKey(next) as Session;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async getSession(id: string): Promise<Session | undefined> {
    const session = await (await this.open()).get("sessions", id);
    return session ? (stripKey(session) as Session) : undefined;
  }
  async updateSession(session: Session) {
    const tx = (await this.open()).transaction([...STORES], "readwrite");
    try {
      const sessions = tx.objectStore("sessions");
      const current = await sessions.get(session.sessionId);
      if (!current) throw new Error("Unknown collection session");
      const failures = [
        ...new Map(
          [...current.captureFailures, ...session.captureFailures].map((f) => [
            JSON.stringify(f),
            f,
          ]),
        ).values(),
      ];
      const updated = {
        ...current,
        status: current.successorSessionId ? "complete" : session.status,
        endedAt: current.successorSessionId ? current.endedAt : session.endedAt,
        captureFailures: failures,
        counts: { ...current.counts, failed: failures.length },
      };
      const reserve = current._failureReserve ?? "";
      const growth = Math.max(0, size(updated) - size(current));
      updated._failureReserve = reserve.slice(Math.min(growth, reserve.length));
      await sessions.put(updated);
      const total = (
        await Promise.all(STORES.map((name) => tx.objectStore(name).getAll()))
      )
        .flat()
        .reduce((n, row) => n + size(row), 0);
      if (total > Math.min(MAX_TOTAL_BYTES, current.settings.maxTotalBytes))
        throw new StorageLimitError(
          "Collection storage limit reached across sessions",
        );
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async stageCapture(sessionId: string, batches: PendingBatch[]) {
    await mutateCapture(() => this.open(), sessionId, batches, true);
  }
  async commitBatch(
    sessionId: string,
    batches: PendingBatch[],
    _bytes: number,
  ) {
    await mutateCapture(() => this.open(), sessionId, batches, false);
  }
  async retryPending(id: string) {
    for (const row of await (await this.open()).getAll("pending"))
      if (row.sessionId === id && row.batches)
        await this.commitBatch(id, row.batches, 0);
  }
  async locations(id: string, documentId: string): Promise<string[]> {
    return this.queries.locations(id, documentId);
  }
  async counts(id: string): Promise<StoreCounts> {
    return this.queries.counts(id);
  }
  async bundle(
    id: string,
    cutoff = Number.MAX_SAFE_INTEGER,
  ): Promise<ExportBundle> {
    return this.queries.bundle(id, cutoff);
  }
  async deleteSession(id: string) {
    const tx = (await this.open()).transaction([...STORES], "readwrite");
    for (const store of STORES) {
      if (store === "html") continue;
      for (const row of await tx.objectStore(store).getAll())
        if (row.sessionId === id || (store === "sessions" && row.key === id))
          await tx.objectStore(store).delete(row.key);
    }
    const hashes = new Set(
      (await tx.objectStore("captures").getAll()).map((c) => c.htmlHash),
    );
    for (const row of await tx.objectStore("html").getAll())
      if (!hashes.has(row.hash)) await tx.objectStore("html").delete(row.key);
    await tx.done;
  }
}
