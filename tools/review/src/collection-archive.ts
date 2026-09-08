import { createHash } from "node:crypto";
import { validateRecord } from "./collection-schema.ts";
import type {
  CollectionCapture,
  CollectionDetail,
  CollectionEvent,
  CollectionFinding,
  CollectionManifest,
  CollectionOccurrence,
} from "./collection-types.ts";
import { ReviewError } from "./problem-review.ts";
import { MAX_ARCHIVE_BYTES, readZipFiles } from "./zip-files.ts";
export {
  MAX_ARCHIVE_BYTES,
  MAX_EXPANDED_BYTES,
  MAX_SNAPSHOT_BYTES,
} from "./zip-files.ts";
const fail = (message: string): never => {
  throw new ReviewError(message);
};
export const archiveHash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const decode = (bytes: Uint8Array) =>
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);

export async function readCollectionArchive(bytes: Uint8Array): Promise<{
  detail: Omit<CollectionDetail, "id" | "importedAt">;
  snapshots: Map<string, Uint8Array>;
}> {
  try {
    if (bytes.length > MAX_ARCHIVE_BYTES || bytes.length < 22)
      fail("ZIP upload size is invalid");
    const files = await readZipFiles(bytes);
    const manifests = [...files.keys()].filter((n) =>
      /^(?:[^/]+\/)?manifest\.json$/u.test(n),
    );
    if (manifests.length !== 1) fail("Expected one collection manifest");
    const root = manifests[0].slice(0, -"manifest.json".length);
    const read = (name: string) =>
      files.get(root + name) ?? fail(`Missing ${name}`);
    const json = (name: string) => JSON.parse(decode(read(name)));
    const manifest = json("manifest.json") as CollectionManifest;
    validateRecord("manifest", manifest, "manifest.json");
    const records = <T>(
      name: string,
      kind: "finding" | "occurrence" | "event",
    ): T[] =>
      decode(read(name))
        .split(/\r?\n/u)
        .filter((l) => l.trim())
        .map((l, i) => {
          const value = JSON.parse(l);
          validateRecord(kind, value, `${name}:${i + 1}`);
          return value;
        });
    const findings = records<CollectionFinding>("findings.jsonl", "finding");
    const occurrences = records<CollectionOccurrence>(
      "occurrences.jsonl",
      "occurrence",
    );
    const events = records<CollectionEvent>("events.jsonl", "event");
    read("report.md");
    const captures: CollectionCapture[] = [],
      snapshots = new Map<string, Uint8Array>();
    for (const [path, content] of files) {
      if (path === root && !content.length) continue;
      if (!path.startsWith(root)) fail("Multiple collection roots");
      const name = path.slice(root.length);
      if (
        [
          "manifest.json",
          "report.md",
          "findings.jsonl",
          "occurrences.jsonl",
          "events.jsonl",
          "captures/",
          "html/",
        ].includes(name)
      )
        continue;
      const capture = /^captures\/([A-Za-z0-9_-]+)\.json$/u.exec(name);
      const html = /^html\/([a-f0-9]{64})\.html$/u.exec(name);
      if (capture) {
        const value = JSON.parse(decode(content));
        validateRecord("capture", value, name);
        if (value.captureId !== capture[1])
          fail("Capture filename does not match identity");
        captures.push(value);
      } else if (html) {
        if (archiveHash(content) !== html[1]) fail("Snapshot SHA-256 mismatch");
        decode(content);
        snapshots.set(html[1], content);
      } else fail(`Unsupported collection file: ${name}`);
    }
    const unique = <T>(rows: T[], key: (row: T) => string) => {
      const map = new Map(rows.map((r) => [key(r), r]));
      if (map.size !== rows.length) fail("Duplicate record identity");
      return map;
    };
    const fs = unique(findings, (r) => r.findingId),
      os = unique(occurrences, (r) => r.occurrenceId),
      cs = unique(captures, (r) => r.captureId),
      es = unique(events, (r) => r.eventId);
    const sid = manifest.session.sessionId;
    const observed = new Map<string, CollectionOccurrence[]>();
    const usedEvents = new Set<string>();
    for (const o of occurrences) {
      const c = cs.get(o.captureId),
        f = fs.get(o.findingId);
      if (
        !c ||
        !f ||
        o.sessionId !== sid ||
        o.documentId !== c.documentId ||
        !c.occurrenceIds.includes(o.occurrenceId) ||
        !c.findingIds.includes(o.findingId) ||
        o.kind !== f.kind
      )
        fail("Incomplete occurrence references");
      for (const id of o.precedingEventIds) {
        const e = es.get(id);
        if (
          !e ||
          e.sessionId !== sid ||
          e.documentId !== o.documentId ||
          e.timestamp > o.at
        )
          fail("Invalid preceding event reference");
        usedEvents.add(id);
      }
      observed.set(o.findingId, [...(observed.get(o.findingId) ?? []), o]);
    }
    for (const f of findings)
      if (
        !observed.has(f.findingId) ||
        f.occurrenceCount !== observed.get(f.findingId)!.length
      )
        fail("Invalid finding occurrence count");
    const usedHtml = new Set<string>();
    for (const c of captures) {
      const html = snapshots.get(c.htmlHash);
      usedHtml.add(c.htmlHash);
      if (c.sessionId !== sid || !html || html.length !== c.htmlBytes)
        fail("Missing snapshot or invalid capture size");
      const refs = c.occurrenceIds.map((id) => os.get(id));
      if (
        refs.some((o) => !o || o.captureId !== c.captureId) ||
        new Set(refs.map((o) => o!.findingId)).size !== c.findingIds.length ||
        c.findingIds.some((id) => !refs.some((o) => o!.findingId === id))
      )
        fail("Incomplete capture references");
    }
    if (usedEvents.size !== events.length || usedHtml.size !== snapshots.size)
      fail("Unreferenced collection evidence");
    for (const [name, count] of Object.entries({
      findings: findings.length,
      occurrences: occurrences.length,
      events: events.length,
      captures: captures.length,
      html: snapshots.size,
    }))
      if (manifest.counts[name as keyof typeof manifest.counts] !== count)
        fail(`Manifest ${name} count mismatch`);
    return {
      detail: { manifest, findings, occurrences, events, captures },
      snapshots,
    };
  } catch (error) {
    if (error instanceof ReviewError) throw error;
    throw new ReviewError(
      `Invalid collection ZIP: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
