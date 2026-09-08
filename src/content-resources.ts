import { catalogSchema } from "translation-core/catalog-schema";
import { pageDictionaryNames } from "translation-core/page-dictionaries";
import { resolveDictionary } from "translation-core/translation-catalog";
import { readableDictionarySchema } from "translation-core/translation-schema";
import type { CatalogResult } from "./problem-catalog";
import {
  catalogReplySchema,
  runtimeFailureSchema,
} from "./runtime-contracts.ts";

export function createContentResources(runtime: typeof chrome.runtime) {
  async function loadJson(path: string): Promise<unknown> {
    const response = await fetch(runtime.getURL(path));
    if (!response.ok)
      throw new Error(
        `Translation dictionary returned HTTP ${response.status}`,
      );
    return response.json();
  }
  async function loadTranslations() {
    const dictionaries = await Promise.all(
      pageDictionaryNames(location.pathname).map(async (name) =>
        readableDictionarySchema.parse(
          await loadJson(`translations/ko/${name}.json`),
        ),
      ),
    );
    const hasReferences = dictionaries.some((d) =>
      d.translations.some((entry) => "ref" in entry),
    );
    const catalog = hasReferences
      ? catalogSchema.parse(await loadJson("translations/ko.messages.json"))
      : { messages: [] };
    return dictionaries.flatMap(
      (dictionary) => resolveDictionary(dictionary, catalog).translations,
    );
  }
  async function loadCatalog(): Promise<CatalogResult> {
    try {
      if (!runtime?.sendMessage) return { source: "bundled" };
      const reply: unknown = await runtime.sendMessage({
        type: "problem-catalog:get",
      });
      const parsed = catalogReplySchema.safeParse(reply);
      if (!parsed.success) {
        const failure = runtimeFailureSchema.safeParse(reply);
        throw new Error(
          failure.success
            ? failure.data.error
            : "Problem catalog request was not acknowledged",
        );
      }
      const response = parsed.data;
      const catalog = response.catalog;
      if (response.warning)
        console.warn(
          "[yukicoder-ko] Using fallback problem catalog",
          response.warning,
        );
      return { ...response, catalog };
    } catch (error) {
      console.warn("[yukicoder-ko] Using bundled problem titles", error);
      return { source: "bundled", warning: String(error) };
    }
  }

  return { loadTranslations, loadCatalog };
}
