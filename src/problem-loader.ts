import type { PublishedProblem } from "translation-core/problem-catalog";
import { sourceStatementBlocks } from "translation-core/problem-document";
import { parseTranslationDocument as parseDocument } from "translation-core/problem-document";
import { fetchBuffered } from "translation-core/request";
import { sha256Hex as hashBytes } from "translation-core/sha256";
import { cacheReplySchema, runtimeFailureSchema } from "./runtime-contracts.ts";
export class ProblemVerificationError extends Error {
  constructor(
    message: string,
    readonly sourceHtml?: string,
  ) {
    super(message);
  }
}
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
    // Wait for both requests even on failure so an immediate retry cannot
    // overlap the remaining request from this attempt.
    const responses = await Promise.allSettled([
      fetchWithTimeout(
        new URL(`/api/v1/problems/${problemId}`, location.origin),
        options,
      ),
      fetchWithTimeout(
        new URL(`/api/v1/problems/${problemId}/html`, location.origin),
        options,
      ),
    ]);
    const [metadataResponse, htmlResponse] = responses.map((response) => {
      if (response.status === "rejected") throw response.reason;
      return response.value;
    });
    if (!metadataResponse.ok || !htmlResponse.ok) {
      throw new Error("Canonical problem source request failed");
    }

    const [metadata, htmlBytes]: [unknown, ArrayBuffer] = await Promise.all([
      metadataResponse.json(),
      htmlResponse.arrayBuffer(),
    ]);
    if (
      !metadata ||
      typeof metadata !== "object" ||
      !("No" in metadata) ||
      typeof metadata.No !== "number" ||
      !Number.isSafeInteger(metadata.No) ||
      metadata.No < 1 ||
      !("ProblemId" in metadata) ||
      typeof metadata.ProblemId !== "number" ||
      !Number.isSafeInteger(metadata.ProblemId) ||
      metadata.ProblemId < 1 ||
      !("Title" in metadata) ||
      typeof metadata.Title !== "string" ||
      !metadata.Title.trim()
    )
      throw new Error("Canonical problem metadata is unavailable");

    const html = new TextDecoder("utf-8", { fatal: true }).decode(htmlBytes);
    const blocks = sourceStatementBlocks(parseHtml(html).body);
    if (
      !blocks.some(
        (block) =>
          block.matches(".block") &&
          (block.textContent?.trim() || block.querySelector("img, svg, math")),
      )
    )
      throw new Error("Canonical problem statement is unavailable");

    // A malformed HTTP 200 response is not evidence of a source change.
    // Compare identities and bytes only after both payloads are validated.
    if (
      metadata.No !== Number(problemNo) ||
      metadata.ProblemId !== Number(problemId) ||
      metadata.Title !== sourceTitle
    ) {
      throw new ProblemVerificationError(
        "Canonical problem metadata changed",
        html,
      );
    }
    if ((await sha256Hex(htmlBytes)) !== sourceHtmlSha256) {
      throw new ProblemVerificationError(
        "Canonical problem statement changed",
        html,
      );
    }
    return html;
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
