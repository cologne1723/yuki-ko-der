import { type IDBPDatabase } from "idb";
import { validateCapture } from "./capture-validation.ts";
import {
  recordSize as size,
  STORES,
  type CollectorDatabase,
} from "./collector-db.ts";
import { sha256 } from "./hash.ts";
import { StorageLimitError } from "./storage-errors.ts";
import type {
  Capture,
  EventRecord,
  Finding,
  HtmlSnapshot,
  Occurrence,
  PendingBatch,
} from "./types.ts";
import { MAX_TOTAL_BYTES } from "./types.ts";
export async function mutateCapture(
  open: () => Promise<IDBPDatabase<CollectorDatabase>>,
  sessionId: string,
  batches: PendingBatch[],
  stage: boolean,
): Promise<void> {
  const capture = validateCapture(sessionId, batches);
  for (const batch of batches) {
    if (batch.html && (await sha256(batch.html.html)) !== batch.html.hash)
      throw new Error("Snapshot hash does not match its contents");
    if (
      batch.finding &&
      (
        await sha256(
          `${batch.finding.kind}\u0000${batch.finding.normalizedText}`,
        )
      ).slice(0, 32) !== batch.finding.findingId
    )
      throw new Error("Finding identity does not match its contents");
  }
  const key = `${sessionId}:${capture.documentId}:${capture.captureId}`;
  const payloadHash = await sha256(JSON.stringify(batches));
  const tx = (await open()).transaction([...STORES], "readwrite");
  try {
    const current = await tx.objectStore("sessions").get(sessionId);
    if (!current) throw new Error("Unknown collection session");
    if (current.successorSessionId)
      throw new Error(
        "Session dictionary has rotated; stale captures are rejected",
      );
    if (capture.htmlBytes > current.settings.maxHtmlBytes)
      throw new StorageLimitError("Snapshot exceeds the session limit");
    const replay = await tx.objectStore("commits").get(key);
    if (replay) {
      if (
        replay.keys !== JSON.stringify(batches.map((b) => b.key)) ||
        replay.payloadHash !== payloadHash
      )
        throw new Error(
          "Capture identity was reused with different contents or unverifiable legacy data",
        );
      await tx.done;
      return;
    }
    const pendingStore = tx.objectStore("pending");
    if (stage) {
      const existing = await pendingStore.get(key);
      if (
        existing &&
        JSON.stringify(existing.batches) !== JSON.stringify(batches)
      )
        throw new Error("Pending capture identity conflict");
      await pendingStore.put({ key, sessionId, batches });
    } else {
      const commits = await tx.objectStore("commits").getAll();
      const order = Math.max(0, ...commits.map((r) => r.order)) + 1;
      const committedKeys = new Set(commits.flatMap((r) => JSON.parse(r.keys)));
      if (batches.some((b) => committedKeys.has(b.key)))
        throw new Error("Idempotency key reused by another capture");
      for (const batch of batches) {
        for (const [field, store, id] of [
          ["finding", "findings", "findingId"],
          ["occurrence", "occurrences", "occurrenceId"],
          ["event", "events", "eventId"],
          ["capture", "captures", "captureId"],
          ["html", "html", "hash"],
        ] as const) {
          const record = batch[field];
          if (!record) continue;
          const rowKey =
            field === "html"
              ? record[id as keyof typeof record]
              : `${sessionId}:${(record as unknown as Record<string, string>)[id]}`;
          const prior = await tx.objectStore(store).get(rowKey as string);
          if (prior && (field === "occurrence" || field === "capture"))
            throw new Error("Capture record identity was reused");
          if (prior && field === "event") {
            const { key: _key, commitOrder: _order, ...saved } = prior;
            if (JSON.stringify(saved) !== JSON.stringify(record))
              throw new Error(
                "Event identity was reused with different context",
              );
          }
          let value:
            Finding | Occurrence | EventRecord | Capture | HtmlSnapshot = {
            ...record,
          };
          if (field === "finding") {
            const observations = batches.flatMap((b) =>
              b.occurrence?.findingId === batch.finding!.findingId
                ? [b.occurrence]
                : [],
            );
            value = {
              ...batch.finding!,
              firstSeenAt: Math.min(
                (prior &&
                "firstSeenAt" in prior &&
                typeof prior.firstSeenAt === "number"
                  ? prior.firstSeenAt
                  : undefined) ?? Infinity,
                ...observations.map((o) => o.at),
              ),
              lastSeenAt: Math.max(
                (prior &&
                "lastSeenAt" in prior &&
                typeof prior.lastSeenAt === "number"
                  ? prior.lastSeenAt
                  : undefined) ?? 0,
                ...observations.map((o) => o.at),
              ),
              occurrenceCount:
                ((prior &&
                "occurrenceCount" in prior &&
                typeof prior.occurrenceCount === "number"
                  ? prior.occurrenceCount
                  : undefined) ?? 0) + observations.length,
            };
          }
          await tx.objectStore(store).put({
            ...value,
            key: String(rowKey),
            ...(field === "html" ? {} : { sessionId }),
            commitOrder: order,
          });
        }
      }
      await pendingStore.delete(key);
      await tx.objectStore("commits").put({
        key,
        sessionId,
        order,
        keys: JSON.stringify(batches.map((b) => b.key)),
        payloadHash,
      });
      current.counts.saved =
        commits.filter((row) => row.sessionId === sessionId).length + 1;
      await tx.objectStore("sessions").put(current);
    }
    // The logical limit includes metadata, every record type and complete pending units.
    const all = await Promise.all(
      STORES.map((store) => tx.objectStore(store).getAll()),
    );
    current.totalBytes = all
      .flat()
      .filter((row) => row.sessionId === sessionId)
      .reduce((n, row) => n + size(row), 0);
    current.counts.pending = all[6].filter(
      (row) => row.sessionId === sessionId && "batches" in row && row.batches,
    ).length;
    await tx.objectStore("sessions").put(current);
    // Include the final counter/byte metadata, which can grow by several digits.
    const finalRows = await Promise.all(
      STORES.map((store) => tx.objectStore(store).getAll()),
    );
    const total = finalRows.flat().reduce((n, row) => n + size(row), 0);
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
