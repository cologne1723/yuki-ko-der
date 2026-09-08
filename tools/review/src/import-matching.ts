const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

import { LRUCache } from "lru-cache";

import { createHash } from "node:crypto";

import { JSDOM, VirtualConsole } from "jsdom";

import { pageDictionaryNames } from "translation-core/page-dictionaries";

import { translatedValue } from "translation-core/fixed-translations";

import type { Usage } from "translation-core/translation-catalog";

import { CollectionReviewStore } from "./collection-review.ts";

import type { CatalogState, ImportTask } from "./ui-imports.ts";
export async function collectImportTasks(
  collections: CollectionReviewStore,
  state: CatalogState,
  summaries: Awaited<ReturnType<CollectionReviewStore["list"]>>,
): Promise<ImportTask[]> {
  const tasks = new Map<string, ImportTask>();
  for (const summary of summaries) {
    const detail = await collections.get(summary.id);
    const snapshots = new LRUCache<string, JSDOM>({
      max: 4,
      dispose: (dom) => dom.window.close(),
    });
    try {
      const captures = new Map(detail.captures.map((c) => [c.captureId, c]));
      const ordered = [...detail.occurrences].sort((a, b) =>
        captures
          .get(a.captureId)!
          .htmlHash.localeCompare(captures.get(b.captureId)!.htmlHash),
      );
      for (const observation of ordered) {
        const capture = detail.captures.find(
          (c) => c.captureId === observation.captureId,
        )!;
        let dom = snapshots.get(capture.htmlHash);
        if (!dom) {
          dom = new JSDOM(
            await collections.sourceSnapshot(summary.id, capture.htmlHash),
            { virtualConsole: new VirtualConsole() },
          );
          snapshots.set(capture.htmlHash, dom);
        }
        const doc = dom.window.document;
        let element: Element | null = null;
        let located = false;
        try {
          const result = doc.evaluate(
            observation.snapshotNodeLocator,
            doc,
            null,
            dom.window.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null,
          );
          if (result.snapshotLength === 1) {
            const node = result.snapshotItem(0)!;
            element =
              node.nodeType === 1
                ? (node as Element)
                : node.nodeType === 2
                  ? (node as Attr).ownerElement
                  : node.parentElement;
            located =
              (node.nodeValue ?? node.textContent ?? "")
                .replace(/\s+/gu, " ")
                .trim() === observation.exactText.replace(/\s+/gu, " ").trim();
          }
        } catch {
          /* Unresolvable evidence remains visible for inspection. */
        }
        const url = new URL(capture.url);
        const files = pageDictionaryNames(url.pathname)
          .map((n) => `${n}.json`)
          .filter((n) => state.dictionaries[n]);
        const attribute = [
          "title",
          "alt",
          "aria-label",
          "placeholder",
        ].includes(observation.kind)
          ? observation.kind
          : observation.kind === "button-label" &&
              element?.matches(
                "input[type=button],input[type=submit],input[type=reset]",
              )
            ? "value"
            : undefined;
        const matches: Array<{ file: string; usage: Usage }> = [];
        if (element && located)
          for (const file of files)
            for (const usage of state.dictionaries[file].translations) {
              if (
                !("ref" in usage) ||
                usage.attribute !== attribute ||
                !element.matches(usage.selector)
              )
                continue;
              const message = state.catalog.messages.find(
                (m) => m.id === usage.ref,
              )!;
              if (
                translatedValue(observation.exactText, {
                  ...message,
                  selector: usage.selector,
                }) !== undefined
              )
                matches.push({ file, usage });
            }
        const identities = new Set(
          matches.map((m) => `${m.usage.ref}:${m.usage.variant ?? ""}`),
        );
        const match = identities.size === 1 ? matches[0] : undefined;
        let selector = match?.usage.selector;
        if (
          !selector &&
          element &&
          located &&
          typeof observation.liveCssSelectorHint === "string" &&
          !/data-collector/iu.test(observation.liveCssSelectorHint)
        ) {
          try {
            const found = [
              ...doc.querySelectorAll(observation.liveCssSelectorHint),
            ];
            if (found.length === 1 && found[0] === element)
              selector = observation.liveCssSelectorHint;
          } catch {
            /* Invalid hints are not translation selectors. */
          }
        }
        const file = match?.file ?? files.at(-1);
        const source = match
          ? state.catalog.messages.find((m) => m.id === match.usage.ref)!.source
          : observation.exactText;
        // A stable evidence key survives saving a previously unknown definition.
        const context = [
          observation.kind,
          element?.tagName,
          element?.getAttribute("id"),
          element?.getAttribute("class"),
          files.at(-1),
          observation.liveCssSelectorHint,
          element?.parentElement?.getAttribute("id"),
          element?.parentElement?.getAttribute("class"),
        ];
        const evidenceId = hash([observation.exactText, context]);
        const id = match
          ? /^ui_import_[a-f0-9]{64}$/u.test(match.usage.ref)
            ? match.usage.ref.slice("ui_import_".length)
            : hash([
                "linked",
                match.usage.ref,
                observation.kind,
                match.usage.variant,
              ])
          : evidenceId;
        const task: ImportTask = tasks.get(id) ?? {
          id,
          source,
          target: "",
          kind: observation.kind,
          status: "new",
          revision: "",
          locations: [],
        };
        const ambiguous =
          identities.size > 1 ||
          (!match &&
            state.catalog.messages.some(
              (m) =>
                m.source.replace(/\s+/gu, " ").trim() ===
                  source.replace(/\s+/gu, " ").trim() ||
                m.id === `ui_import_${id}`,
            ));
        const verified =
          url.origin === "https://yukicoder.me" &&
          observation.category === "interface" &&
          located &&
          Boolean(selector && file) &&
          !ambiguous &&
          !element?.closest(
            ".problem_content,[data-yukicoder-ko-problem],textarea,[contenteditable=true],script,style,template,head",
          ) &&
          (Boolean(match) || !source.includes("{"));
        task.locations.push({
          collectionId: summary.id,
          occurrenceId: observation.occurrenceId,
          title: capture.title,
          url: capture.url,
          htmlHash: capture.htmlHash,
          locator: observation.snapshotNodeLocator,
          observedText: observation.exactText,
          recordedMessageIds: observation.dictionaryMessageIds,
          precedingEvents: detail.events.filter((event) =>
            observation.precedingEventIds.includes(event.eventId),
          ),
          file,
          selector,
          attribute,
          messageId: match?.usage.ref,
          variant: match?.usage.variant,
          verified,
          reason:
            observation.category === "content"
              ? "콘텐츠 관찰"
              : !verified
                ? "문맥과 적용 위치 확인 필요"
                : undefined,
        });
        tasks.set(id, task);
      }
    } finally {
      snapshots.clear();
    }
  }
  return [...tasks.values()];
}
