import {
  parseProblemCatalog,
  type ProblemCatalog,
} from "translation-core/problem-catalog";
import { fetchBuffered } from "translation-core/request";

export interface CatalogResult {
  catalog?: ProblemCatalog;
  source: "remote" | "cache" | "bundled";
  warning?: string;
}
export interface CatalogStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
}

export function createProblemCatalogLoader(
  baseUrl: string,
  storage?: CatalogStorage,
  request: typeof fetch = globalThis.fetch,
) {
  const url = new URL(
    "ko/problem-catalog.json",
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  ).href;
  const key = `problem-catalog:ko:${url}`;
  let pending: Promise<CatalogResult> | undefined;
  let lastValid: ProblemCatalog | undefined;
  async function load(): Promise<CatalogResult> {
    try {
      const response = await fetchBuffered(
        url,
        { cache: "no-cache", credentials: "omit" },
        10_000,
        request,
      );
      if (!response.ok)
        throw new Error(`Problem catalog returned HTTP ${response.status}`);
      const catalog = parseProblemCatalog(await response.json());
      lastValid = catalog;
      try {
        await storage?.set({ [key]: catalog });
      } catch (error) {
        console.warn("[yukicoder-ko] Could not cache problem catalog", error);
      }
      return { catalog, source: "remote" };
    } catch (error) {
      if (!lastValid) {
        try {
          const saved = await storage?.get(key);
          if (saved?.[key]) lastValid = parseProblemCatalog(saved[key]);
        } catch (cacheError) {
          console.warn(
            "[yukicoder-ko] Could not read cached problem catalog",
            cacheError,
          );
        }
      }
      return {
        catalog: lastValid,
        source: lastValid ? "cache" : "bundled",
        warning: String(error),
      };
    }
  }
  return () => {
    pending ??= load().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
