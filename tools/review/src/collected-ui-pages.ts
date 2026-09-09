import { translatedValue } from "translation-core/fixed-translations";
import { pageDictionaryNames } from "translation-core/page-dictionaries";
import type { ReviewDictionary } from "translation-core/ui-review-groups";
import { CollectionReviewStore } from "./collection-review.ts";

export async function collectedUiPages(
  store: CollectionReviewStore,
  dictionaries: ReviewDictionary[],
) {
  const pages = new Map<string, string>();
  const coverage = new Map<
    string,
    { file: string; index: number; source: string; pages: string[] }
  >();
  for (const summary of await store.list()) {
    const collection = await store.get(summary.id);
    const captures = new Map(collection.captures.map((c) => [c.captureId, c]));
    const matches = new Map<
      string,
      { file: string; index: number; source: string }[]
    >();
    for (const occurrence of collection.occurrences) {
      if (occurrence.category === "content") continue;
      const capture = captures.get(occurrence.captureId);
      if (!capture) continue;
      const url = new URL(capture.url);
      if (url.origin !== "https://yukicoder.me") continue;
      const key = JSON.stringify([
        url.pathname,
        occurrence.kind,
        occurrence.exactText,
      ]);
      let entries = matches.get(key);
      if (!entries) {
        const files = new Set(
          pageDictionaryNames(url.pathname).map((name) => `${name}.json`),
        );
        entries = dictionaries
          .filter((d) => files.has(d.file))
          .flatMap((d) =>
            d.entries.flatMap((entry, index) => {
              const attribute =
                occurrence.kind === "text"
                  ? undefined
                  : occurrence.kind === "button-label"
                    ? "value"
                    : occurrence.kind;
              return entry.attribute === attribute &&
                translatedValue(occurrence.exactText, entry) !== undefined
                ? [{ file: d.file, index, source: entry.source }]
                : [];
            }),
          );
        matches.set(key, entries);
      }
      if (!entries.length) continue;
      const name = `collection-${summary.id}-${capture.htmlHash}.html`;
      pages.set(
        name,
        `${url.pathname} · 수집 ZIP · ${new Date(Number(capture.timestamp)).toISOString()}`,
      );
      for (const entry of entries) {
        const id = `${entry.file}:${entry.index}`;
        const row = coverage.get(id) ?? { ...entry, pages: [] };
        if (!row.pages.includes(name)) row.pages.push(name);
        coverage.set(id, row);
      }
    }
  }
  return {
    pages: [...pages.keys()],
    pageLabels: Object.fromEntries(pages),
    coverage: [...coverage.values()],
  };
}
