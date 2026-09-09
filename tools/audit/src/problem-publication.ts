import { JSDOM } from "jsdom";

/** Add the public review notice without changing editable source or metadata. */
export function labelPublishedProblem(html: string): string {
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const root = document.querySelector<HTMLElement>(
      "main[data-yukicoder-ko-problem]",
    );
    const heading = root?.querySelector("h3");
    if (!root || !heading)
      throw new Error("Problem translation heading is missing");
    const title = (heading.textContent ?? "")
      .replace(/^\[기계 번역\]\s*/u, "")
      .replace(/\s*\(기계번역입니다\)$/u, "");
    heading.textContent = title;
    document.title = title;
    root.querySelector(".machine-translation-notice")?.remove();
    if (root.dataset.reviewStatus !== "approved") {
      const notice = document.createElement("p");
      notice.className = "machine-translation-notice";
      notice.textContent = "아래 텍스트는 기계번역 되었습니다";
      heading.before(notice);
    }
    return dom.serialize();
  } finally {
    dom.window.close();
  }
}
