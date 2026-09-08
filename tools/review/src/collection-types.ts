// Version-1 collector interchange data. Importing never starts the extension.
export interface CollectionRecord {
  [key: string]: unknown;
}
export interface CollectionManifest {
  schemaVersion: 1;
  committedCutoff: number;
  session: CollectionRecord & {
    sessionId: string;
    startedAt: number;
    status: string;
    dictionary: { hash: string; scopes: unknown[] };
  };
  counts: Record<
    "findings" | "occurrences" | "events" | "captures" | "html",
    number
  >;
}
export interface CollectionFinding extends CollectionRecord {
  findingId: string;
  normalizedText: string;
  kind: string;
  occurrenceCount: number;
}
export interface CollectionOccurrence extends CollectionRecord {
  occurrenceId: string;
  findingId: string;
  captureId: string;
  sessionId: string;
  documentId: string;
  exactText: string;
  category: string;
  kind: string;
  classificationRule: string;
  snapshotNodeLocator: string;
  dictionaryMessageIds: string[];
  precedingEventIds: string[];
  at: number;
}
export interface CollectionCapture extends CollectionRecord {
  captureId: string;
  sessionId: string;
  documentId: string;
  url: string;
  title: string;
  htmlHash: string;
  htmlBytes: number;
  findingIds: string[];
  occurrenceIds: string[];
}
export interface CollectionEvent extends CollectionRecord {
  eventId: string;
  sessionId: string;
  documentId: string;
  timestamp: number;
}
export interface CollectionSummary {
  id: string;
  importedAt: number;
  manifest: CollectionManifest;
}
export interface CollectionDetail extends CollectionSummary {
  findings: CollectionFinding[];
  occurrences: CollectionOccurrence[];
  captures: CollectionCapture[];
  events: CollectionEvent[];
}
