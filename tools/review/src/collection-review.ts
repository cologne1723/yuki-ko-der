import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { pLimit } from "translation-core/concurrency";
import { defaultDataDirectory } from "translation-core/paths";
import { sanitizeSnapshotCss } from "translation-core/snapshot-css";
import { archiveHash, readCollectionArchive } from "./collection-archive.ts";
import type {
  CollectionDetail,
  CollectionSummary,
} from "./collection-types.ts";
import { ReviewError } from "./problem-review.ts";
export const SNAPSHOT_CSP =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox";
export function sanitizeCollectionSnapshot(html: string): string {
  const dom = new JSDOM("");
  try {
    const purifier = createDOMPurify(dom.window);
    purifier.addHook("afterSanitizeAttributes", (node) => {
      if (node.hasAttribute("style"))
        node.setAttribute(
          "style",
          sanitizeSnapshotCss(node.getAttribute("style") ?? "", true),
        );
      if (node.tagName?.toLowerCase() === "style")
        node.textContent = sanitizeSnapshotCss(node.textContent ?? "");
    });
    const clean = purifier.sanitize(html, {
      WHOLE_DOCUMENT: true,
      FORBID_TAGS: [
        "script",
        "noscript",
        "iframe",
        "frame",
        "frameset",
        "object",
        "embed",
        "portal",
        "base",
        "link",
        "meta",
        "template",
        "svg",
        "math",
        "audio",
        "video",
      ],
      FORBID_ATTR: [
        "src",
        "srcset",
        "imagesrcset",
        "href",
        "xlink:href",
        "action",
        "formaction",
        "poster",
        "background",
        "manifest",
        "ping",
        "codebase",
        "archive",
        "srcdoc",
        "autofocus",
      ],
    });
    return "<!doctype html>\n" + clean;
  } finally {
    dom.window.close();
  }
}
export class CollectionReviewStore {
  private readonly directory: string;
  private pending = pLimit(1);
  constructor(root: string, dataRoot = defaultDataDirectory(root)) {
    this.directory = join(dataRoot, "collections");
  }
  private path(id: string) {
    if (!/^[a-f0-9]{64}$/u.test(id))
      throw new ReviewError("Invalid collection identity", 400);
    return join(this.directory, id);
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    return this.pending(operation);
  }
  async list(): Promise<CollectionSummary[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const summaries: CollectionSummary[] = [];
    for (const id of names.filter((n) => /^[a-f0-9]{64}$/u.test(n))) {
      try {
        summaries.push(
          JSON.parse(
            await readFile(join(this.path(id), "summary.json"), "utf8"),
          ),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return summaries.sort(
      (a, b) => b.importedAt - a.importedAt || a.id.localeCompare(b.id),
    );
  }
  async get(id: string): Promise<CollectionDetail> {
    try {
      return JSON.parse(
        await readFile(join(this.path(id), "detail.json"), "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new ReviewError("Collection not found", 404);
      throw error;
    }
  }
  async import(
    bytes: Uint8Array,
  ): Promise<CollectionSummary & { duplicate: boolean }> {
    // Serializing imports bounds decompression memory and makes duplicates deterministic.
    return this.serialize(async () => {
      const id = archiveHash(bytes);
      try {
        const { importedAt, manifest } = await this.get(id);
        return { id, importedAt, manifest, duplicate: true };
      } catch (error) {
        if (!(error instanceof ReviewError && error.statusCode === 404))
          throw error;
      }
      const parsed = await readCollectionArchive(bytes);
      const summary: CollectionSummary = {
        id,
        importedAt: Date.now(),
        manifest: parsed.detail.manifest,
      };
      await mkdir(this.directory, { recursive: true });
      const staging = await mkdtemp(join(this.directory, ".import-"));
      try {
        await mkdir(join(staging, "snapshots"));
        await writeFile(join(staging, "archive.zip"), bytes);
        await writeFile(
          join(staging, "detail.json"),
          JSON.stringify({ ...parsed.detail, ...summary }),
        );
        await writeFile(join(staging, "summary.json"), JSON.stringify(summary));
        for (const [hash, html] of parsed.snapshots)
          await writeFile(join(staging, "snapshots", hash + ".html"), html);
        await rename(staging, this.path(id));
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
      return { ...summary, duplicate: false };
    });
  }
  async snapshot(id: string, hash: string): Promise<string> {
    return sanitizeCollectionSnapshot(await this.sourceSnapshot(id, hash));
  }
  // Inert server-side inspection only; routes must use the sanitized snapshot.
  async sourceSnapshot(id: string, hash: string): Promise<string> {
    if (!/^[a-f0-9]{64}$/u.test(hash))
      throw new ReviewError("Invalid snapshot identity");
    await this.get(id);
    try {
      return await readFile(
        join(this.path(id), "snapshots", hash + ".html"),
        "utf8",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new ReviewError("Snapshot not found", 404);
      throw error;
    }
  }
  delete(id: string): Promise<void> {
    return this.serialize(async () => {
      await this.get(id);
      await rm(this.path(id), { recursive: true });
    });
  }
}
