import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { LRUCache } from "lru-cache";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { readCatalog } from "translation-core/catalog-files";
import { assertCatalogShapes } from "translation-core/catalog-schema";
import {
  resolveDictionary,
  validateCatalog,
  type Catalog,
  type UsageDictionary,
} from "translation-core/translation-catalog";
import { ReviewError } from "./problem-review.ts";
const revision = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export class UiCatalogRepository {
  constructor(
    private root: string,
    private dataRoot: string,
  ) {}

  private pageCache = new LRUCache<string, { stamp: string; html: string }>({
    max: 16,
  });

  async readCatalogState() {
    const catalogRaw = await readFile(
      join(this.root, "translations/ko.messages.json"),
      "utf8",
    );
    const catalog = JSON.parse(catalogRaw) as Catalog;
    const raw: Record<string, string> = {};
    const dictionaries: Record<string, UsageDictionary> = {};
    for (const name of (await readdir(join(this.root, "translations/ko")))
      .filter((n) => /^[a-z0-9_]+\.json$/u.test(n))
      .sort()) {
      raw[name] = await readFile(
        join(this.root, "translations/ko", name),
        "utf8",
      );
      dictionaries[name] = JSON.parse(raw[name]);
    }
    const dom = new JSDOM("");
    try {
      assertCatalogShapes(catalog, dictionaries);
      validateCatalog(catalog, dictionaries, dom.window.document);
    } finally {
      dom.window.close();
    }
    return {
      catalog,
      dictionaries,
      catalogRaw,
      raw,
      revision: revision(JSON.stringify([catalogRaw, raw])),
    };
  }

  async readList() {
    const catalog = await readCatalog(this.root);
    const catalogRevision = catalog.messages.length
      ? revision(JSON.stringify(catalog))
      : "";
    const directory = join(this.root, "translations/ko");
    const dictionaries = await Promise.all(
      (await readdir(directory))
        .filter((name) => /^[a-z0-9_]+\.json$/u.test(name))
        .sort()
        .map(async (file) => {
          const raw = await readFile(join(directory, file), "utf8");
          const dom = new JSDOM("");
          try {
            return {
              file,
              revision: revision(raw) + catalogRevision,
              entries: resolveDictionary(
                JSON.parse(raw),
                catalog,
                dom.window.document,
              ).translations,
            };
          } finally {
            dom.window.close();
          }
        }),
    );
    let pages: string[] = [];
    try {
      pages = (await readdir(join(this.dataRoot, "pages")))
        .filter((name) => /^[a-zA-Z0-9_-]+\.html$/u.test(name))
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const optionalJson = async (path: string, root = this.root) => {
      try {
        return JSON.parse(await readFile(join(root, path), "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return undefined;
      }
    };
    const coverage = await optionalJson(
      "reports/ui-page-coverage.json",
      this.dataRoot,
    );
    const sourceContexts = await optionalJson(
      "tools/review/public/ui-contexts.json",
    );
    return {
      dictionaries,
      pages,
      coverage: coverage?.entries ?? [],
      sourceContexts: sourceContexts ?? [],
    };
  }

  async page(name: string) {
    if (!/^[a-zA-Z0-9_-]+\.html$/u.test(name))
      throw new ReviewError("올바르지 않은 페이지입니다.");
    const path = join(this.dataRoot, "pages", name);
    const info = await stat(path);
    const stamp = `${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
    const cached = this.pageCache.get(name);
    if (cached?.stamp === stamp) return cached.html;
    const dom = new JSDOM(await readFile(path, "utf8"));
    try {
      const doc = dom.window.document;
      doc
        .querySelectorAll(
          "script, iframe, object, embed, base, meta[http-equiv], link[rel=preload], link[rel=modulepreload]",
        )
        .forEach((el) => el.remove());
      const purifier = createDOMPurify(dom.window);
      purifier.addHook("uponSanitizeAttribute", (_node, data) => {
        if (/^(?:javascript|data):/iu.test(data.attrValue.trim()))
          data.keepAttr = false;
      });
      purifier.sanitize(doc.documentElement, {
        IN_PLACE: true,
        WHOLE_DOCUMENT: true,
        ADD_TAGS: ["link"],
        FORBID_TAGS: ["script", "iframe", "object", "embed", "base"],
        FORBID_ATTR: ["srcdoc"],
      });
      const base = doc.createElement("base");
      base.href = "https://yukicoder.me/";
      doc.head.prepend(base);
      const html = dom.serialize();
      this.pageCache.set(name, { stamp, html });
      return html;
    } finally {
      dom.window.close();
    }
  }
}
