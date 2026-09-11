import type { ProblemRenderProfile } from "translation-core/problem-render-profile";
import { renderPreviewMath } from "../tex.ts";

export interface PreviewRenderOptions {
  signal?: AbortSignal;
  width?: number;
  height?: number;
  timeoutMs?: number;
}

let nextJob = 0;

/** Measure with the preview's own CSS and browsing context before serializing. */
export function renderPreviewInFrame(
  source: string,
  profile: ProblemRenderProfile,
  fontUrl: string,
  options: PreviewRenderOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    const job = String(++nextJob);
    frame.dataset.reviewMathStage = job;
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.referrerPolicy = "no-referrer";
    Object.assign(frame.style, {
      position: "fixed",
      left: "-100000px",
      top: "0",
      visibility: "hidden",
      pointerEvents: "none",
      border: "0",
      width: `${options.width || document.documentElement.clientWidth || 800}px`,
      height: `${options.height || document.documentElement.clientHeight || 600}px`,
    });
    let settled = false;
    let started = false;
    const cleanup = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", aborted);
      frame.removeEventListener("load", loaded);
      frame.remove();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const aborted = () =>
      fail(
        options.signal?.reason ??
          new DOMException("Preview rendering cancelled", "AbortError"),
      );
    const timer = setTimeout(
      () =>
        fail(
          new Error(
            "Preview rendering timed out while waiting for layout, fonts or math",
          ),
        ),
      options.timeoutMs ?? 15000,
    );
    const loaded = () => {
      const doc = frame.contentDocument;
      // Ignore the initial about:blank load and any repeated load notification.
      if (
        settled ||
        started ||
        doc?.documentElement.dataset.reviewMathStage !== job
      )
        return;
      started = true;
      void (async () => {
        if (!frame.isConnected || !doc.defaultView)
          throw new Error("Preview browsing context is unavailable");
        doc.body.getBoundingClientRect();
        await doc.fonts?.ready;
        if (settled) return;
        await renderPreviewMath(doc.body, profile, { fontUrl });
        if (settled) return;
        doc.body.getBoundingClientRect();
        await doc.fonts?.ready;
        if (settled) return;
        delete doc.documentElement.dataset.reviewMathStage;
        const result = "<!doctype html>\n" + doc.documentElement.outerHTML;
        settled = true;
        cleanup();
        resolve(result);
      })().catch(fail);
    };
    frame.addEventListener("load", loaded);
    options.signal?.addEventListener("abort", aborted, { once: true });
    if (options.signal?.aborted) {
      aborted();
      return;
    }
    try {
      document.body.append(frame);
      frame.srcdoc = source.replace(
        "<html",
        `<html data-review-math-stage="${job}"`,
      );
    } catch (error) {
      fail(error);
    }
  });
}
