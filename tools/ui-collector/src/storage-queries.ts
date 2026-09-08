import { type IDBPDatabase } from "idb";
import { STORES, stripKey, type CollectorDatabase } from "./collector-db.ts";
import type { StoreCounts } from "./storage-types.ts";
import type { ExportBundle, Session } from "./types.ts";
export class CollectorQueries {
  constructor(private open: () => Promise<IDBPDatabase<CollectorDatabase>>) {}

  async listSessions(): Promise<Session[]> {
    return (await (await this.open()).getAll("sessions")).map(
      stripKey,
    ) as Session[];
  }

  async locations(id: string, documentId: string): Promise<string[]> {
    return (await (await this.open()).getAll("occurrences"))
      .filter(
        (o) =>
          o.sessionId === id && o.documentId === documentId && o.commitOrder,
      )
      .map((o) => `${o.snapshotNodeLocator}|${o.kind}|${o.exactText}`);
  }

  async counts(id: string): Promise<StoreCounts> {
    const tx = (await this.open()).transaction([
      "sessions",
      "captures",
      "pending",
    ]);
    const [s, captures, pending] = await Promise.all([
      tx.objectStore("sessions").get(id),
      tx.objectStore("captures").getAll(),
      tx.objectStore("pending").getAll(),
    ]);
    await tx.done;
    return {
      saved: captures.filter((row) => row.sessionId === id && row.commitOrder)
        .length,
      pending: pending.filter((row) => row.sessionId === id && row.batches)
        .length,
      failed: s?.captureFailures?.length ?? 0,
    };
  }

  async bundle(
    id: string,
    cutoff = Number.MAX_SAFE_INTEGER,
  ): Promise<ExportBundle> {
    if (!Number.isSafeInteger(cutoff) || cutoff < 0)
      throw new Error("Invalid committed cutoff");
    const tx = (await this.open()).transaction([...STORES]);
    const rows = await Promise.all([
      tx.objectStore("sessions").getAll(),
      tx.objectStore("findings").getAll(),
      tx.objectStore("occurrences").getAll(),
      tx.objectStore("events").getAll(),
      tx.objectStore("captures").getAll(),
      tx.objectStore("html").getAll(),
      tx.objectStore("pending").getAll(),
      tx.objectStore("commits").getAll(),
    ]);
    await tx.done;
    const session = rows[0].find((s) => s.key === id);
    if (!session) throw new Error("Unknown collection session");
    const committed = rows[7].filter((r) => r.sessionId === id);
    const order = Math.min(
      cutoff,
      Math.max(0, ...committed.map((r) => r.order)),
    );
    const captures = rows[4].filter(
      (r) => r.sessionId === id && r.commitOrder && r.commitOrder <= order,
    );
    const captureIds = new Set(captures.map((c) => c.captureId));
    const occurrences = rows[2].filter(
      (o) => o.sessionId === id && captureIds.has(o.captureId),
    );
    const findingIds = new Set(occurrences.map((o) => o.findingId));
    const eventIds = new Set(occurrences.flatMap((o) => o.precedingEventIds));
    const htmlIds = new Set(captures.map((c) => c.htmlHash));
    const findings = rows[1]
      .filter((f) => f.sessionId === id && findingIds.has(f.findingId))
      .map((f) => {
        const observations = occurrences.filter(
          (o) => o.findingId === f.findingId,
        );
        return {
          ...f,
          firstSeenAt: Math.min(...observations.map((o) => o.at)),
          lastSeenAt: Math.max(...observations.map((o) => o.at)),
          occurrenceCount: observations.length,
        };
      });
    const legacyCount =
      rows[4].filter((c) => c.sessionId === id && !c.commitOrder).length +
      rows[6].filter((r) => r.sessionId === id && !r.batches).length;
    return {
      session: {
        ...stripKey(session),
        counts: {
          saved: captures.length,
          pending: rows[6].filter((row) => row.sessionId === id && row.batches)
            .length,
          failed: session.captureFailures?.length ?? 0,
        },
        legacyUnverifiedRecords: legacyCount,
      } as unknown as Session,
      cutoff: order,
      captures: captures.map(stripKey),
      occurrences: occurrences.map(stripKey),
      findings: findings.map(stripKey),
      events: rows[3]
        .filter((e) => e.sessionId === id && eventIds.has(e.eventId))
        .map(stripKey),
      html: rows[5]
        .filter((h) => h.key === h.hash && h.commitOrder && htmlIds.has(h.hash))
        .map(stripKey),
    } as ExportBundle;
  }
}
