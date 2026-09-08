import { JSDOM } from "jsdom";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pLimit } from "translation-core/concurrency";
import type { TranslationEntry } from "translation-core/fixed-translations";
import { defaultDataDirectory } from "translation-core/paths";
import type { Usage } from "translation-core/translation-catalog";
import { CollectionReviewStore } from "./collection-review.ts";
import type { CollectionEvent } from "./collection-types.ts";
import { collectImportTasks } from "./import-matching.ts";
import { ImportProgress, type Progress } from "./import-progress.ts";
import { ReviewError } from "./problem-review.ts";
import { UiReviewStore } from "./ui-review.ts";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type CatalogState = Awaited<ReturnType<UiReviewStore["catalogState"]>>;
export type ImportStatus =
  "new" | "draft" | "approved" | "deferred" | "excluded" | "needs-check";
export interface ImportLocation {
  collectionId: string;
  occurrenceId: string;
  url: string;
  title: string;
  htmlHash: string;
  locator: string;
  observedText: string;
  recordedMessageIds: string[];
  precedingEvents: CollectionEvent[];
  file?: string;
  selector?: string;
  attribute?: string;
  messageId?: string;
  variant?: number;
  verified: boolean;
  reason?: string;
}
export interface ImportTask {
  id: string;
  source: string;
  target: string;
  kind: string;
  status: ImportStatus;
  revision: string;
  messageId?: string;
  variables?: TranslationEntry["variables"];
  locations: ImportLocation[];
}

export class UiImportStore {
  private pending = pLimit(1);
  private progressStore: ImportProgress;
  constructor(
    private ui: UiReviewStore,
    private collections: CollectionReviewStore,
    root: string,
    dataRoot = defaultDataDirectory(root),
  ) {
    this.progressStore = new ImportProgress(join(dataRoot, "collections"));
  }
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    return this.pending(work);
  }
  private taskCache?: { key: string; result: Promise<ImportTask[]> };
  private async tasks(
    state: CatalogState,
    progress: Progress,
  ): Promise<ImportTask[]> {
    const summaries = await this.collections.list();
    // Wording/review edits do not change source-to-snapshot matching.
    const key = hash([
      state.catalog.messages.map(
        ({
          target: _target,
          reviewStatus: _status,
          alternatives,
          ...message
        }) => ({ ...message, variants: alternatives?.length }),
      ),
      state.dictionaries,
      summaries.map((s) => s.id),
    ]);
    if (this.taskCache?.key !== key) {
      const result = collectImportTasks(this.collections, state, summaries);
      this.taskCache = { key, result };
      void result.catch(() => {
        if (this.taskCache?.key === key) this.taskCache = undefined;
      });
    }
    const tasks = new Map(
      structuredClone(await this.taskCache.result).map((t) => [t.id, t]),
    );
    for (const task of tasks.values()) {
      const ids = new Set(
        task.locations
          .filter((l) => l.verified && l.messageId)
          .map((l) => l.messageId!),
      );
      const message =
        ids.size === 1
          ? state.catalog.messages.find((m) => m.id === [...ids][0])
          : undefined;
      task.messageId = message?.id;
      task.source = message?.source ?? task.source;
      task.variables = message?.variables;
      const variants = message
        ? task.locations
            .filter((l) => l.verified)
            .map((l) =>
              l.variant === undefined
                ? message
                : message.alternatives?.[l.variant],
            )
            .filter((v) => v !== undefined)
        : [];
      task.target = variants[0]?.target ?? message?.target ?? "";
      const unresolved =
        task.locations.some((l) => !l.verified) ||
        ids.size > 1 ||
        new Set(variants.map((v) => v.target)).size > 1;
      const allUsed = task.locations
        .filter((l) => l.verified)
        .every((l) => l.messageId === message?.id);
      task.status =
        progress.tasks[task.id] ??
        (task.locations.every((l) => l.reason === "콘텐츠 관찰")
          ? "excluded"
          : unresolved
            ? "needs-check"
            : !message
              ? "new"
              : allUsed &&
                  variants.length > 0 &&
                  variants.every((v) => v.reviewStatus === "approved")
                ? "approved"
                : "draft");
      task.revision = hash([state.revision, task, progress.tasks[task.id]]);
    }
    return [...tasks.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  async list() {
    const progress = await this.progressStore.read();
    return {
      tasks: await this.tasks(await this.ui.catalogState(), progress),
      collections: await this.collections.list(),
      selected: progress.selected,
      collection: progress.collection,
    };
  }
  async get(id: string) {
    const task = (await this.list()).tasks.find((t) => t.id === id);
    if (!task) throw new ReviewError("항목을 찾을 수 없습니다.", 404);
    return task;
  }
  select(id: string, collection?: string) {
    return this.serialize(async () => {
      const current = await this.list();
      if (!current.tasks.some((t) => t.id === id))
        throw new ReviewError("항목을 찾을 수 없습니다.", 404);
      if (
        collection &&
        !collection
          .split(",")
          .every((id) => current.collections.some((c) => c.id === id))
      )
        throw new ReviewError("자료를 찾을 수 없습니다.", 404);
      const progress = await this.progressStore.read();
      progress.selected = id;
      progress.collection = collection;
      await this.progressStore.write(progress);
      return { selected: id, collection };
    });
  }
  save(
    id: string,
    body: { revision?: unknown; target?: unknown; action?: unknown },
  ) {
    return this.serialize(async () => {
      if (
        !body ||
        typeof body.revision !== "string" ||
        !["save-draft", "approve", "defer", "exclude", "restore"].includes(
          String(body.action),
        )
      )
        throw new ReviewError("작업과 개정 값을 확인하세요.");
      const progress = await this.progressStore.read();
      await this.ui.catalogTransaction(async (state) => {
        const task = (await this.tasks(state, progress)).find(
          (t) => t.id === id,
        );
        if (!task) throw new ReviewError("항목을 찾을 수 없습니다.", 404);
        if (task.revision !== body.revision)
          throw new ReviewError(
            "자료나 사전이 변경되었습니다. 다시 불러온 뒤 저장하세요.",
            409,
          );
        if (body.action === "defer" || body.action === "exclude") {
          progress.tasks[id] =
            body.action === "defer" ? "deferred" : "excluded";
          return;
        }
        delete progress.tasks[id];
        if (body.action === "restore") return;
        const locations = task.locations.filter((l) => l.verified);
        if (
          !locations.length ||
          new Set(locations.map((l) => l.messageId).filter(Boolean)).size > 1
        )
          throw new ReviewError("적용 위치를 먼저 확인해야 합니다.");
        if (
          typeof body.target !== "string" ||
          !body.target.trim() ||
          body.target.trim() === task.source.trim()
        )
          throw new ReviewError("한국어 번역을 입력하세요.");
        let message = state.catalog.messages.find(
          (m) => m.id === task.messageId,
        );
        if (!message) {
          message = {
            id: `ui_import_${id}`,
            source: task.source,
            target: body.target,
            reviewStatus: "unreviewed",
          };
          state.catalog.messages.push(message);
        }
        const variants = new Set(locations.map((l) => l.variant));
        for (const variant of variants) {
          const value =
            variant === undefined ? message : message.alternatives?.[variant];
          if (!value)
            throw new ReviewError("연결된 번역이 변경되었습니다.", 409);
          const unchangedApproved =
            value.target === body.target && value.reviewStatus === "approved";
          value.target = body.target;
          value.reviewStatus =
            body.action === "approve" || unchangedApproved
              ? "approved"
              : "unreviewed";
        }
        for (const location of locations) {
          const usage: Usage = {
            ref: message.id,
            selector: location.selector!,
            ...(location.attribute ? { attribute: location.attribute } : {}),
            ...(location.variant !== undefined
              ? { variant: location.variant }
              : {}),
          };
          const dictionary = state.dictionaries[location.file!];
          if (
            !dictionary.translations.some(
              (u) =>
                "ref" in u &&
                u.ref === usage.ref &&
                u.selector === usage.selector &&
                u.attribute === usage.attribute &&
                u.variant === usage.variant,
            )
          )
            dictionary.translations.push(usage);
        }
      });
      progress.selected = id;
      // Catalog state remains authoritative if this final progress write fails.
      await this.progressStore.write(progress);
      return this.list();
    });
  }
  async snapshot(id: string, collectionId: string, occurrenceId: string) {
    const task = (await this.list()).tasks.find((t) => t.id === id);
    const location = task?.locations.find(
      (l) => l.collectionId === collectionId && l.occurrenceId === occurrenceId,
    );
    if (!location) throw new ReviewError("관찰 항목을 찾을 수 없습니다.", 404);
    const dom = new JSDOM(
      await this.collections.snapshot(collectionId, location.htmlHash),
    );
    try {
      const doc = dom.window.document;
      for (const element of doc.querySelectorAll("[data-review-match]"))
        element.removeAttribute("data-review-match");
      let found = false;
      try {
        const result = doc.evaluate(
          location.locator,
          doc,
          null,
          dom.window.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );
        if (result.snapshotLength === 1) {
          const node = result.snapshotItem(0)!;
          const element =
            node.nodeType === 1
              ? (node as Element)
              : node.nodeType === 2
                ? (node as Attr).ownerElement
                : node.parentElement;
          if (
            (node.nodeValue ?? node.textContent ?? "")
              .replace(/\s+/gu, " ")
              .trim() === location.observedText.replace(/\s+/gu, " ").trim()
          ) {
            element?.setAttribute("data-review-match", "true");
            found = Boolean(element);
          }
        }
      } catch {
        /* Never highlight a guessed replacement. */
      }
      const meta = doc.createElement("meta");
      meta.httpEquiv = "Content-Security-Policy";
      meta.content =
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";
      doc.head.prepend(meta);
      const style = doc.createElement("style");
      style.textContent =
        "[data-review-match] { outline: 3px solid #3457d5 !important; outline-offset: 2px; }";
      doc.head.append(style);
      return {
        html: `<!doctype html>${doc.documentElement.outerHTML}`,
        located: found,
      };
    } finally {
      dom.window.close();
    }
  }
}
