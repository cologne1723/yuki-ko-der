import type { collectionSchemas } from "translation-core/collection-schema";
import type { z } from "translation-core/validation";
import type {
  controlStateSchema,
  eventSchema,
  htmlSnapshotSchema,
  occurrenceSchema,
  pendingBatchSchema,
} from "./storage-contracts.ts";
export const SCHEMA_VERSION = 1;
export const MAX_HTML_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export type FindingCategory = "interface" | "content" | "uncertain";
export type TextKind =
  "text" | "title" | "alt" | "aria-label" | "placeholder" | "button-label";

export type DictionaryScope = DictionaryIdentity["scopes"][number];

export type DictionaryIdentity = Session["dictionary"];

export type Session = z.infer<typeof collectionSchemas.manifest>["session"];

export type CollectionSettings = Session["settings"];

export type CaptureFailure = Session["captureFailures"][number];

export type Finding = z.infer<typeof collectionSchemas.finding>;

export type EventRecord = z.infer<typeof eventSchema>;
export type ControlState = z.infer<typeof controlStateSchema>;

export type TargetDescription = EventRecord["target"];

export type Occurrence = z.infer<typeof occurrenceSchema>;

export type Capture = z.infer<typeof collectionSchemas.capture>;

export type RedactionSummary = Capture["redaction"];

export type HtmlSnapshot = z.infer<typeof htmlSnapshotSchema>;
export type PendingBatch = z.infer<typeof pendingBatchSchema>;

export interface ExportBundle {
  session: Session;
  cutoff?: number;
  findings: Finding[];
  occurrences: Occurrence[];
  events: EventRecord[];
  captures: Capture[];
  html: HtmlSnapshot[];
}

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
