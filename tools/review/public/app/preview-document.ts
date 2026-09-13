import DOMPurify from "dompurify";
import katexCss from "katex/dist/katex.min.css?inline";
import {
  renderPreviewInFrame,
  type PreviewRenderOptions,
} from "./preview-math-frame.ts";
import type { ProblemRenderProfile } from "translation-core/problem-render-profile";
import { resolveProblemUrls } from "translation-core/problem-urls";
import { verifyProblemRenderMarkup } from "translation-core/problem-render-markup";
import { sanitizeTranslatedBlocks } from "translation-core/problem-rendering";

export async function previewDocument(
  html: string,
  inert: boolean,
  origin = location.origin,
  contentHeading?: string,
  renderProfile?: ProblemRenderProfile,
  sourceUrl = "https://yukicoder.me/",
  options: PreviewRenderOptions = {},
) {
  const previewOrigin = new URL(origin, location.href).origin;
  const clean = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ["link"],
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["base", "form", "iframe", "object", "embed", "meta"],
  });
  const doc = new DOMParser().parseFromString(
    "<!doctype html>\n" + clean,
    "text/html",
  );
  const translation = doc.querySelector("main[data-yukicoder-ko-problem]");
  if (translation) {
    verifyProblemRenderMarkup(translation);
    const title = translation.querySelector(":scope > h3");
    const statement = translation.querySelector(":scope > .problem-statement");
    const blocks = [...(title ? [title] : []), ...(statement?.children ?? [])];
    const sanitized = sanitizeTranslatedBlocks(blocks, { document, sourceUrl });
    blocks.forEach((block, index) => block.replaceWith(sanitized[index]));
  }
  resolveProblemUrls(
    doc.documentElement,
    sourceUrl,
    `${previewOrigin}/problem-images`,
  );
  for (const link of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (link.getAttribute("href")?.startsWith("#")) continue;
    // Navigation stays sandboxed; popups/top navigation are not enabled.
    link.target = "_self";
    link.rel = "noopener noreferrer";
  }
  if (contentHeading) {
    const heading = doc.createElement("h3");
    heading.textContent = contentHeading;
    doc.body.prepend(heading);
  }
  const base = doc.createElement("base");
  base.href = sourceUrl;
  doc.head.prepend(base);
  const css = doc.createElement("style");
  css.dataset.reviewMath = "katex";
  css.textContent = katexCss.replaceAll(
    "url(fonts/",
    `url(${previewOrigin}/katex/fonts/`,
  );
  if (renderProfile?.engine === "katex") doc.head.append(css);
  const style = doc.createElement("style");
  style.textContent =
    "body{font:15px/1.75 system-ui,sans-serif;margin:24px;color:#242424}img{max-width:100%}pre{overflow:auto;background:#f4f4f4;padding:12px}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}.katex-display{overflow:auto}";
  doc.head.append(style);
  const policy = doc.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = inert
    ? "default-src 'none'; style-src 'unsafe-inline'; font-src data: " +
      previewOrigin +
      "; img-src data: " +
      previewOrigin +
      "; form-action 'none'; base-uri 'none'"
    : "default-src 'none'; style-src 'unsafe-inline' " +
      previewOrigin +
      " https://yukicoder.me https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://use.fontawesome.com; img-src data: " +
      previewOrigin +
      " https://yukicoder.me; font-src data: " +
      previewOrigin +
      " https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://use.fontawesome.com; form-action 'none'";
  if (inert) {
    doc.querySelectorAll("a").forEach((a) => a.removeAttribute("href"));
  }
  doc.head.prepend(policy);
  const source = "<!doctype html>\n" + doc.documentElement.outerHTML;
  return renderProfile
    ? renderPreviewInFrame(
        source,
        renderProfile,
        `${previewOrigin}/mathjax/fonts/woff-v2`,
        options,
      )
    : source;
}
