import type {
  Capture,
  EventRecord,
  Finding,
  HtmlSnapshot,
  Occurrence,
  PendingBatch,
} from "./types.ts";
export function captureBatches(
  sessionId: string,
  documentId: string,
  findings: Finding[],
  occurrences: Occurrence[],
  observedEvents: EventRecord[],
  capture: Capture,
  snapshot: HtmlSnapshot,
  nextSequence: () => number,
  sequence: () => number,
  now: () => number,
): PendingBatch[] {
  const batches: PendingBatch[] = [];
  for (const finding of findings)
    batches.push({
      key: `${sessionId}:${documentId}:${nextSequence()}:finding:${finding.findingId}`,
      sessionId: sessionId,
      documentId: documentId,
      sequence: sequence(),
      createdAt: now(),
      finding,
    });
  for (const occurrence of occurrences)
    batches.push({
      key: `${sessionId}:${documentId}:${nextSequence()}:occurrence:${occurrence.occurrenceId}`,
      sessionId: sessionId,
      documentId: documentId,
      sequence: sequence(),
      createdAt: now(),
      occurrence,
    });
  for (const event of observedEvents) {
    batches.push({
      key: `${sessionId}:${documentId}:${nextSequence()}:event:${event.eventId}`,
      sessionId: sessionId,
      documentId: documentId,
      sequence: sequence(),
      createdAt: now(),
      event,
    });
  }
  batches.push({
    key: `${sessionId}:${documentId}:${nextSequence()}:capture:${capture.captureId}`,
    sessionId: sessionId,
    documentId: documentId,
    sequence: sequence(),
    createdAt: now(),
    capture,
  });
  batches.push({
    key: `${sessionId}:${documentId}:${nextSequence()}:html:${snapshot.hash}`,
    sessionId: sessionId,
    documentId: documentId,
    sequence: sequence(),
    createdAt: now(),
    html: {
      hash: snapshot.hash,
      html: snapshot.html,
      bytes: snapshot.bytes,
    },
  });
  return batches;
}
