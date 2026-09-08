import { createHash } from "node:crypto";
import type { ExportBundle } from "../../ui-collector/src/types.ts";

export function fixture(
  html = '<html><head></head><body><button data-collector-node="1">日本語</button></body></html>',
): ExportBundle {
  const hash = createHash("sha256").update(html).digest("hex"),
    bytes = Buffer.byteLength(html);
  return {
    cutoff: 1,
    session: {
      sessionId: "session-test",
      startedAt: 1,
      collectorVersion: "test",
      dictionary: { hash: "a".repeat(64), scopes: [] },
      settings: {
        maxHtmlBytes: 5 * 1024 * 1024,
        maxTotalBytes: 100 * 1024 * 1024,
        includeEvents: true,
      },
      status: "recording",
      counts: { saved: 1, pending: 0, failed: 0 },
      captureFailures: [],
      totalBytes: 1000,
    },
    findings: [
      {
        findingId: "finding-test",
        normalizedText: "日本語",
        kind: "text",
        firstSeenAt: 2,
        lastSeenAt: 2,
        occurrenceCount: 1,
      },
    ],
    occurrences: [
      {
        occurrenceId: "occurrence-test",
        findingId: "finding-test",
        sessionId: "session-test",
        captureId: "capture-test",
        documentId: "document-test",
        exactText: "日本語",
        kind: "text",
        category: "uncertain",
        classificationRule: "unknown",
        dictionaryMessageIds: ["known", "missing"],
        snapshotNodeLocator: '//*[@data-collector-node="1"]',
        precedingEventIds: ["event-test"],
        temporalContext: "preceding-observations",
        at: 2,
      },
    ],
    events: [
      {
        eventId: "event-test",
        sessionId: "session-test",
        documentId: "document-test",
        sequence: 1,
        timestamp: 1,
        type: "click",
        target: { tagName: "BUTTON" },
      },
    ],
    captures: [
      {
        captureId: "capture-test",
        sessionId: "session-test",
        documentId: "document-test",
        url: "https://yukicoder.me/",
        title: "Test",
        timestamp: 2,
        reason: "manual",
        viewport: { width: 800, height: 600, devicePixelRatio: 1 },
        scroll: { x: 0, y: 0 },
        htmlHash: hash,
        htmlBytes: bytes,
        redaction: {
          removedElements: 0,
          removedAttributes: 0,
          redactedFields: 0,
          removedExternalLoads: 0,
        },
        findingIds: ["finding-test"],
        occurrenceIds: ["occurrence-test"],
      },
    ],
    html: [{ hash, html, bytes }],
  };
}
