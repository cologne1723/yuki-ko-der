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
    const notice =
      root.dataset.reviewStatus === "approved" ? "" : " (기계번역입니다)";
    heading.textContent = title + notice;
    document.title = title + notice;
    return dom.serialize();
  } finally {
    dom.window.close();
  }
}
