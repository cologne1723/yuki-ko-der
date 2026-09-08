import { JSDOM } from "jsdom";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { assertCatalogShapes } from "./catalog-schema.ts";
import { repositoryRoot } from "./paths.ts";
import {
  resolveDictionary,
  validateCatalog,
  type Catalog,
  type UsageDictionary,
} from "./translation-catalog.ts";

const selectorDocument = new JSDOM("").window.document;
export async function readCatalog(root = repositoryRoot): Promise<Catalog> {
  try {
    return JSON.parse(
      await readFile(join(root, "translations/ko.messages.json"), "utf8"),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { messages: [] };
    throw e;
  }
}
export async function readResolved(file: string, root = repositoryRoot) {
  return resolveDictionary(
    JSON.parse(await readFile(join(root, "translations/ko", file), "utf8")),
    await readCatalog(root),
    selectorDocument,
  );
}
export async function checkCatalog(root = repositoryRoot) {
  const dictionaries: Record<string, UsageDictionary> = {};
  for (const file of (await readdir(join(root, "translations/ko"))).filter(
    (f) => f.endsWith(".json"),
  ))
    dictionaries[file] = JSON.parse(
      await readFile(join(root, "translations/ko", file), "utf8"),
    );
  const catalog = await readCatalog(root);
  assertCatalogShapes(catalog, dictionaries);
  validateCatalog(catalog, dictionaries, selectorDocument);
  return {
    messages: catalog.messages.length,
    usages: Object.values(dictionaries).reduce(
      (n, d) => n + d.translations.length,
      0,
    ),
  };
}
