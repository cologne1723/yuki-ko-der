import type { PublishedProblem } from "translation-core/problem-catalog";
import { parseTranslationDocument as parseDocument } from "translation-core/problem-document";
import { fetchBuffered } from "translation-core/request";
import { sha256Hex as hashBytes } from "translation-core/sha256";
import { cacheReplySchema, runtimeFailureSchema } from "./runtime-contracts.ts";
export class ProblemVerificationError extends Error {}
export function createProblemLoader(host: Window & typeof globalThis) {
  const { DOMParser, location } = host;
  const parseTranslationDocument = (html: string, no: number, id: string) =>
    parseDocument(html, no, id, parseHtml);

  const runtime = (host.browser ?? host.chrome)?.runtime;

  function parseHtml(html: string) {
    return new DOMParser().parseFromString(html, "text/html");
  }

  const sha256Hex = (bytes: BufferSource) =>
    hashBytes(bytes, host.crypto.subtle);

  async function cacheRequest(
    type: "get" | "set" | "remove",
    key: string,
    html?: string,
  ) {
    if (!runtime?.sendMessage) return undefined;
    const response: unknown = await runtime.sendMessage({
      type: `problem-cache:${type}`,
      problemNo: Number(key.split(":").at(-1)),
      html,
    });
    const parsed = cacheReplySchema.safeParse(response);
    if (!parsed.success) {
      const failure = runtimeFailureSchema.safeParse(response);
      throw new Error(
        failure.success
          ? failure.data.error
          : "Problem cache background is unavailable",
      );
    }
    return parsed.data.value;
  }
  const storageGet = (key: string) => cacheRequest("get", key);
  const storageSet = (key: string, value: string) =>
    cacheRequest("set", key, value);

  const fetchWithTimeout = (url: string | URL, options: RequestInit = {}) =>
    fetchBuffered(url, options, 10_000, host.fetch.bind(host));

  async function loadTranslationDocument(
    baseUrl: string,
    problemNo: number,
    pageProblemId: string,
    expected?: PublishedProblem,
  ) {
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const url = new URL(`ko/problems/${problemNo}.html`, normalizedBaseUrl)
      .href;
    const cacheKey = `problem-translation-html:ko:${problemNo}`;
    let removed = false;
    async function parseVerified(html: string) {
      try {
        if (
          expected &&
          (await sha256Hex(new TextEncoder().encode(html))) !==
            expected.htmlSha256
        )
          throw new Error(
            "Problem translation differs from the published catalog",
          );
        const translation = parseTranslationDocument(
          html,
          problemNo,
          pageProblemId,
        );
        if (
          expected &&
          (expected.problemNo !== problemNo ||
            expected.problemId !== Number(pageProblemId) ||
            translation.root.dataset.sourceTitle !== expected.source)
        )
          throw new Error(
            "Problem translation identity differs from the published catalog",
          );
        return translation;
      } catch (error) {
        throw new ProblemVerificationError(String(error));
      }
    }
    try {
      const response = await fetchWithTimeout(url, {
        cache: "no-cache",
        credentials: "omit",
      });
      if (response.status === 404 || response.status === 410) {
        // A removed translation must not continue to display from local cache.
        removed = true;
        try {
          await cacheRequest("remove", cacheKey);
        } catch (cacheError) {
          console.warn(
            "[yukicoder-ko] Could not clear removed problem translation cache:",
            cacheError,
          );
        }
        return undefined;
      }
      if (!response.ok) {
        throw new Error(`remote translation HTML returned ${response.status}`);
      }
      const html = await response.text();
      const translation = await parseVerified(html);
      try {
        await storageSet(cacheKey, html);
      } catch (cacheError) {
        console.warn(
          "[yukicoder-ko] Could not cache problem translation:",
          cacheError,
        );
      }
      return translation;
    } catch (error) {
      if (removed || error instanceof ProblemVerificationError) throw error;
      let cached: unknown;
      try {
        cached = await storageGet(cacheKey);
      } catch (cacheError) {
        console.warn("[yukicoder-ko] Could not read problem cache", cacheError);
      }
      if (typeof cached === "string" && cached) {
        return parseVerified(cached);
      }
      throw error;
    }
  }

  async function verifyCanonicalSource(
    translation: ReturnType<typeof parseTranslationDocument>,
  ) {
    const { problemId, problemNo, sourceTitle, sourceHtmlSha256 } =
      translation.root.dataset;
    const options: RequestInit = { cache: "no-store", credentials: "omit" };
    const [metadataResponse, htmlResponse] = await Promise.all([
      fetchWithTimeout(
        new URL(`/api/v1/problems/${problemId}`, location.origin),
        options,
      ),
      fetchWithTimeout(
        new URL(`/api/v1/problems/${problemId}/html`, location.origin),
        options,
      ),
    ]);
    if (!metadataResponse.ok || !htmlResponse.ok) {
      throw new Error("Canonical problem source request failed");
    }

    const [metadata, htmlBytes] = await Promise.all([
      metadataResponse.json(),
      htmlResponse.arrayBuffer(),
    ]);
    if (
      metadata.No !== Number(problemNo) ||
      metadata.ProblemId !== Number(problemId) ||
      metadata.Title !== sourceTitle
    ) {
      throw new ProblemVerificationError("Canonical problem metadata changed");
    }
    if ((await sha256Hex(htmlBytes)) !== sourceHtmlSha256) {
      throw new ProblemVerificationError("Canonical problem statement changed");
    }
    return new TextDecoder().decode(htmlBytes);
  }

  return {
    parseHtml,
    parseTranslationDocument,
    sha256Hex,
    cacheRequest,
    loadTranslationDocument,
    verifyCanonicalSource,
  };
}
