import { StorageLimitError } from "./storage-errors.ts";
import type { Capture, PendingBatch } from "./types.ts";
import { MAX_HTML_BYTES } from "./types.ts";
export function validateCapture(
  sessionId: string,
  batches: PendingBatch[],
): Capture {
  if (!Array.isArray(batches) || !batches.length)
    throw new Error("A complete capture is required");
  const captures = batches.flatMap((b) => (b.capture ? [b.capture] : []));
  if (captures.length !== 1) throw new Error("Exactly one capture is required");
  const capture = captures[0];
  const keys = new Set<string>();
  const findings = new Set(
    batches.flatMap((b) => (b.finding ? [b.finding.findingId] : [])),
  );
  if (findings.size !== batches.filter((b) => b.finding).length)
    throw new Error("Duplicate finding record in capture");
  const occurrences = batches.flatMap((b) =>
    b.occurrence ? [b.occurrence] : [],
  );
  const observedFindings = new Set(occurrences.map((o) => o.findingId));
  const events = new Set(
    batches.flatMap((b) => (b.event ? [b.event.eventId] : [])),
  );
  const html = batches.find((b) => b.html?.hash === capture.htmlHash)?.html;
  if (batches.filter((b) => b.html).length !== 1)
    throw new Error("Exactly one HTML snapshot is required");
  if (!html || html.bytes !== new TextEncoder().encode(html.html).byteLength)
    throw new Error("Capture HTML is missing or has invalid byte accounting");
  if (capture.htmlBytes !== html.bytes)
    throw new Error("Capture snapshot size does not match");
  if (html.bytes > MAX_HTML_BYTES)
    throw new StorageLimitError("Snapshot exceeds 5 MiB");
  if (capture.sessionId !== sessionId || !Number.isFinite(capture.timestamp))
    throw new Error("Invalid capture identity");
  for (const batch of batches) {
    if (
      !batch ||
      batch.sessionId !== sessionId ||
      batch.documentId !== capture.documentId ||
      typeof batch.key !== "string" ||
      !batch.key ||
      keys.has(batch.key)
    )
      throw new Error("Invalid or duplicate idempotency key");
    keys.add(batch.key);
  }
  if (
    capture.occurrenceIds.length !== occurrences.length ||
    new Set(capture.occurrenceIds).size !== occurrences.length ||
    new Set(occurrences.map((o) => o.occurrenceId)).size !==
      occurrences.length ||
    findings.size !== observedFindings.size ||
    [...findings].some((id) => !observedFindings.has(id)) ||
    capture.findingIds.length !== findings.size ||
    new Set(capture.findingIds).size !== findings.size ||
    capture.findingIds.some((id) => !findings.has(id))
  )
    throw new Error("Capture references are incomplete");
  for (const o of occurrences)
    if (
      o.sessionId !== sessionId ||
      o.captureId !== capture.captureId ||
      o.documentId !== capture.documentId ||
      !Number.isFinite(o.at) ||
      !findings.has(o.findingId) ||
      !capture.occurrenceIds.includes(o.occurrenceId) ||
      o.precedingEventIds.some((id) => !events.has(id))
    )
      throw new Error("Occurrence references are incomplete");
  for (const batch of batches)
    if (
      batch.event &&
      (batch.event.sessionId !== sessionId ||
        batch.event.documentId !== capture.documentId ||
        !Number.isFinite(batch.event.timestamp) ||
        batch.event.timestamp > capture.timestamp)
    )
      throw new Error("Invalid capture event context");
  return capture;
}
