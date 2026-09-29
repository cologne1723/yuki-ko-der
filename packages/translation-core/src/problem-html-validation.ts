import createDOMPurify, { type WindowLike } from "dompurify";

export function validateHtmlWithWindow(html: string, window: WindowLike): void {
  const root = window.document!.createElement("div");
  root.innerHTML = html;
  const purifier = createDOMPurify(window);
  purifier.sanitize(root, { IN_PLACE: true, USE_PROFILES: { html: true } });
  if (purifier.removed.length)
    throw new Error("Unsupported or executable HTML in problem MDX");
}

export function validateStaticHtml(html: string): void {
  validateHtmlWithWindow(html, window);
}
