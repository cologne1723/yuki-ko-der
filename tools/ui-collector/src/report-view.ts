import type { ExportBundle } from "./types.ts";

export function renderReport(
  bundle: ExportBundle,
  report: HTMLElement,
  preview: HTMLIFrameElement,
  message: HTMLElement,
) {
  const grouped = Map.groupBy(
    bundle.occurrences,
    (occurrence): string => occurrence.category,
  );
  report.replaceChildren();
  for (const category of ["interface", "uncertain", "content"]) {
    const heading = document.createElement("h2");
    heading.textContent = `${category} (${grouped.get(category)?.length ?? 0})`;
    report.append(heading);
    const findings = new Map<string, HTMLElement>();
    for (const occurrence of grouped.get(category) ?? []) {
      let group = findings.get(occurrence.findingId);
      if (!group) {
        group = document.createElement("section");
        const title = document.createElement("h3");
        const finding = bundle.findings.find(
          (row) => row.findingId === occurrence.findingId,
        );
        title.textContent = `${finding?.normalizedText ?? occurrence.exactText} — ${finding?.occurrenceCount ?? 1} observations`;
        group.append(title);
        findings.set(occurrence.findingId, group);
        report.append(group);
      }
      const capture = bundle.captures.find(
        (value) => value.captureId === occurrence.captureId,
      );
      const item = document.createElement("article");
      const text = document.createElement("code");
      text.textContent = occurrence.exactText;
      const detail = document.createElement("p");
      detail.textContent = `${capture?.url ?? "Unknown page"}; ${occurrence.kind}; ${occurrence.classificationRule}; ${occurrence.dictionaryMessageIds.join(", ")}; ${occurrence.snapshotNodeLocator}; ${occurrence.precedingEventIds.length} preceding events (temporal context only)`;
      const button = document.createElement("button");
      button.textContent = "Preview snapshot";
      button.onclick = async () => {
        const capture = bundle.captures.find(
          (value) => value.captureId === occurrence.captureId,
        );
        const html = bundle.html.find(
          (value) => value.hash === capture?.htmlHash,
        )?.html;
        preview.srcdoc = html ?? "<p>Snapshot unavailable</p>";
      };
      item.append(text, detail, button);
      group.append(item);
    }
  }
  message.textContent = `Saved ${bundle.session.counts.saved ?? 0}; pending ${bundle.session.counts.pending ?? 0} (may be lost before acknowledgement); failed ${bundle.session.counts.failed ?? 0}; legacy unverified records ${bundle.session.legacyUnverifiedRecords ?? 0}.`;
}
