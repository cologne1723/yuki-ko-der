import type { ExportBundle, PendingBatch, Session } from "./types.ts";
export interface StoreCounts {
  saved: number;
  pending: number;
  failed: number;
}
export interface CollectorStore {
  createSession(session: Session): Promise<void>;
  rotateSession?(predecessorId: string, successor: Session): Promise<Session>;
  stageCapture?(sessionId: string, batches: PendingBatch[]): Promise<void>;
  getSession(sessionId: string): Promise<Session | undefined>;
  updateSession(session: Session): Promise<void>;
  commitBatch(
    sessionId: string,
    batches: PendingBatch[],
    totalBytes: number,
  ): Promise<void>;
  retryPending(sessionId: string): Promise<void>;
  counts(sessionId: string): Promise<StoreCounts>;
  locations?(sessionId: string, documentId: string): Promise<string[]>;
  bundle(sessionId: string, cutoff?: number): Promise<ExportBundle>;
  deleteSession(sessionId: string): Promise<void>;
}
