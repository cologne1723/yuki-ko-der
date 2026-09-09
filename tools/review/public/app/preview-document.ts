import DOMPurify from "dompurify";
import katexCss from "katex/dist/katex.min.css?inline";
import { renderPreviewMath } from "../tex.ts";

export function previewDocument(
  html: string,
  inert: boolean,
  origin = location.origin,
) {
  const clean = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ["link"],
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["base", "form", "iframe", "object", "embed", "meta"],
  });
  const doc = new DOMParser().parseFromString(clean, "text/html");
  const base = doc.createElement("base");
  base.href = "https://yukicoder.me/";
  doc.head.prepend(base);
  const css = doc.createElement("style");
  css.dataset.reviewMath = "katex";
  css.textContent = katexCss.replaceAll(
    "url(fonts/",
    `url(${origin}/katex/fonts/`,
  );
  doc.head.append(css);
  const style = doc.createElement("style");
  style.textContent =
    "body{font:15px/1.75 system-ui,sans-serif;margin:24px;color:#242424}img{max-width:100%}pre{overflow:auto;background:#f4f4f4;padding:12px}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}.katex-display{overflow:auto}";
  doc.head.append(style);
  const policy = doc.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = inert
    ? "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"
    : "default-src 'none'; style-src 'unsafe-inline' " +
      origin +
      " https://yukicoder.me https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://use.fontawesome.com; img-src data: https://yukicoder.me; font-src data: " +
      origin +
      " https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://use.fontawesome.com; form-action 'none'";
  if (inert) {
    doc.querySelectorAll("a").forEach((a) => a.removeAttribute("href"));
  }
  doc.head.prepend(policy);
  renderPreviewMath(doc.body);
  return doc.documentElement.outerHTML;
}
