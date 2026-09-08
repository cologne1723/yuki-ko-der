import { openDB, type DBSchema } from "idb";
import type {
  Capture,
  EventRecord,
  Finding,
  HtmlSnapshot,
  Occurrence,
  PendingBatch,
  Session,
} from "./types.ts";

export type Stored<T> = T & {
  key: string;
  sessionId?: string;
  commitOrder?: number;
  _failureReserve?: string;
};
export interface CollectorDatabase extends DBSchema {
  sessions: { key: string; value: Stored<Session> };
  findings: { key: string; value: Stored<Finding> };
  occurrences: { key: string; value: Stored<Occurrence> };
  events: { key: string; value: Stored<EventRecord> };
  captures: { key: string; value: Stored<Capture> };
  html: { key: string; value: Stored<HtmlSnapshot> };
  pending: {
    key: string;
    value: Stored<{ sessionId: string; batches?: PendingBatch[] }>;
  };
  commits: {
    key: string;
    value: Stored<{
      sessionId: string;
      order: number;
      keys: string;
      payloadHash?: string;
    }>;
  };
}
export const STORES = [
  "sessions",
  "findings",
  "occurrences",
  "events",
  "captures",
  "html",
  "pending",
  "commits",
] as const;
export function openCollectorDatabase(name: string) {
  return openDB<CollectorDatabase>(name, 2, {
    upgrade(db) {
      for (const store of STORES)
        if (!db.objectStoreNames.contains(store))
          db.createObjectStore(store, { keyPath: "key" });
    },
  });
}
export function stripKey<T extends { key: string; _failureReserve?: string }>(
  value: T,
) {
  const { key, _failureReserve, ...rest } = value;
  return rest;
}
export const recordSize = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;
