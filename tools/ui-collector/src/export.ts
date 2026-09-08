import { strToU8, zipSync } from "fflate";
import type { ExportBundle } from "./types.ts";

function jsonLine(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value)}\n`);
}
function markdown(bundle: ExportBundle): string {
  const byCategory = Map.groupBy(
    bundle.occurrences,
    (occurrence): string => occurrence.category,
  );
  const lines = [
    `# UI collector report`,
    ``,
    `Session: ${bundle.session.sessionId}`,
    `Dictionary hash: ${bundle.session.dictionary.hash}`,
    ``,
    `The collector records observations of remaining Japanese text. Event proximity is context and does not prove causation.`,
    ``,
  ];
  for (const category of ["interface", "uncertain", "content"]) {
    lines.push(`## ${category[0].toUpperCase()}${category.slice(1)}`, ``);
    const grouped = Map.groupBy(
      byCategory.get(category) ?? [],
      (occurrence) => occurrence.findingId,
    );
    for (const [id, occurrences] of grouped) {
      const finding = bundle.findings.find((row) => row.findingId === id);
      lines.push(
        `### ${escape(finding?.normalizedText ?? occurrences[0].exactText)}`,
        "",
        `${occurrences.length} observations in this category.`,
        "",
      );
      for (const occurrence of occurrences) {
        const capture = bundle.captures.find(
          (c) => c.captureId === occurrence.captureId,
        );
        lines.push(
          `- **${escape(occurrence.exactText)}** (${occurrence.kind}) — [snapshot ${occurrence.captureId}](html/${capture?.htmlHash}.html), ${escape(occurrence.classificationRule)}; URL: ${escape(capture?.url ?? "unknown")}; locator: ${escape(occurrence.snapshotNodeLocator)}; ${occurrence.precedingEventIds.length} preceding events (temporal context only).`,
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}
function escape(value: string): string {
  return value.replace(/[\\`*_{}[\]()<>#+\-.!|]/gu, "\\$&");
}
export function createZip(bundle: ExportBundle): Uint8Array {
  const root = `collection-${new Date(bundle.session.startedAt).toISOString().replace(/[:.]/gu, "-")}-${bundle.session.sessionId}`;
  const files: Record<string, Uint8Array> = {};
  const path = (name: string) => `${root}/${name}`;
  files[path("manifest.json")] = strToU8(
    JSON.stringify(
      {
        schemaVersion: 1,
        committedCutoff: bundle.cutoff ?? Date.now(),
        session: bundle.session,
        counts: {
          findings: bundle.findings.length,
          occurrences: bundle.occurrences.length,
          events: bundle.events.length,
          captures: bundle.captures.length,
          html: bundle.html.length,
        },
      },
      null,
      2,
    ),
  );
  files[path("report.md")] = strToU8(markdown(bundle));
  files[path("findings.jsonl")] = strToU8(
    bundle.findings.map((value) => JSON.stringify(value)).join("\n") +
      (bundle.findings.length ? "\n" : ""),
  );
  files[path("occurrences.jsonl")] = strToU8(
    bundle.occurrences.map((value) => JSON.stringify(value)).join("\n") +
      (bundle.occurrences.length ? "\n" : ""),
  );
  files[path("events.jsonl")] = strToU8(
    bundle.events.map((value) => JSON.stringify(value)).join("\n") +
      (bundle.events.length ? "\n" : ""),
  );
  for (const capture of bundle.captures)
    files[path(`captures/${capture.captureId}.json`)] = jsonLine(capture);
  for (const snapshot of bundle.html)
    files[path(`html/${snapshot.hash}.html`)] = strToU8(snapshot.html);
  return zipSync(files, { level: 6 });
}
