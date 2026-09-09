import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { join, relative } from "node:path";
import { setTimeout } from "node:timers/promises";
import {
  atomicFile,
  optionalFile,
} from "translation-audit/operations/source-store";
import { pLimit } from "translation-core/concurrency";
import { ReviewError } from "translation-core/review-state";
interface CatalogChange {
  path: string;
  raw: string;
  output: string;
}
export class CatalogTransactions {
  constructor(private root: string) {}
  private queue = pLimit(1);
  private catalogLockContext = new AsyncLocalStorage<boolean>();
  private get journalPath() {
    return join(this.root, "data/reports/review-catalog/replacement.json");
  }
  private async recoverCatalog() {
    const bytes = await optionalFile(this.journalPath);
    if (!bytes) return;
    const changes: unknown = JSON.parse(bytes.toString());
    if (
      !Array.isArray(changes) ||
      !changes.length ||
      changes.some(
        (item) =>
          !item ||
          typeof item.path !== "string" ||
          !/^(?:translations\/(?:ko\.messages\.json|ko\/[a-z0-9_]+\.json)|translations\/tags\/ko\.json)$/u.test(
            item.path,
          ) ||
          typeof item.raw !== "string" ||
          typeof item.output !== "string",
      ) ||
      new Set(changes.map((item) => item.path)).size !== changes.length
    ) {
      throw new ReviewError(
        "Invalid catalog recovery journal; existing files were preserved.",
        409,
      );
    }
    for (const item of changes) {
      const current = await optionalFile(join(this.root, item.path));
      if (
        current?.toString() !== item.raw &&
        current?.toString() !== item.output
      )
        throw new ReviewError(
          `Interrupted catalog save conflicts with external edits in ${item.path}. Existing files and recovery journal ${this.journalPath} were preserved; inspect them before retrying.`,
          409,
        );
    }
    for (const item of changes) {
      const path = join(this.root, item.path);
      const current = await optionalFile(path);
      if (
        current?.toString() !== item.raw &&
        current?.toString() !== item.output
      )
        throw new ReviewError(
          `Catalog recovery stopped because ${item.path} changed; existing files and recovery journal were preserved.`,
          409,
        );
      if (current?.toString() !== item.raw) await atomicFile(path, item.raw);
    }
    await unlink(this.journalPath);
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.catalogLockContext.getStore()) return work();
    return this.queue(() => this.runLocked(work));
  }
  private async runLocked<T>(work: () => Promise<T>): Promise<T> {
    const directory = join(this.root, "data/reports/review-catalog");
    await mkdir(directory, { recursive: true });
    const { DatabaseSync } = await import("node:sqlite");
    const lock = new DatabaseSync(join(directory, "lock.sqlite"));
    try {
      for (;;) {
        try {
          lock.exec("BEGIN IMMEDIATE");
          break;
        } catch (error) {
          if (![5, 6].includes((error as { errcode?: number }).errcode ?? -1))
            throw error;
          await setTimeout(25);
        }
      }
      await this.recoverCatalog();
      return await this.catalogLockContext.run(true, work);
    } finally {
      lock.close();
    }
  }
  async commit(changes: CatalogChange[]) {
    if (!changes.length) return;
    for (const item of changes) {
      if ((await readFile(item.path, "utf8")) !== item.raw)
        throw new ReviewError(
          "사전이 변경되었습니다. 다시 불러온 뒤 저장하세요.",
          409,
        );
    }
    await atomicFile(
      this.journalPath,
      JSON.stringify(
        changes.map((item) => ({
          path: relative(this.root, item.path),
          raw: item.raw,
          output: item.output,
        })),
      ),
    );
    try {
      for (const item of changes) {
        if ((await readFile(item.path, "utf8")) !== item.raw)
          throw new ReviewError(
            "사전이 변경되었습니다. 다시 불러온 뒤 저장하세요.",
            409,
          );
        await atomicFile(item.path, item.output);
      }
      await unlink(this.journalPath);
    } catch (error) {
      await this.recoverCatalog();
      throw error;
    }
  }
}
